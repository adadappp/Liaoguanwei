using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Threading;
using Drawing = System.Drawing;
using WinForms = System.Windows.Forms;

namespace Daodu
{
    /// <summary>配置：%APPDATA%\daodu\config.json，可用 DAODU_CONFIG_DIR 覆盖</summary>
    sealed class Settings
    {
        public string ApiKey = "";
        public string BaseUrl = "https://api.deepseek.com";
        public string Model = "deepseek-flash";
        public string Hotkey = "Ctrl+Shift+D";

        public static Settings Current;

        public static string Dir
        {
            get
            {
                string custom = Environment.GetEnvironmentVariable("DAODU_CONFIG_DIR");
                if (!string.IsNullOrEmpty(custom)) return custom;
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                if (string.IsNullOrEmpty(appData)) appData = AppDomain.CurrentDomain.BaseDirectory;
                return Path.Combine(appData, "daodu");
            }
        }

        public static string FilePath { get { return Path.Combine(Dir, "config.json"); } }

        public static Settings Load()
        {
            var s = new Settings();
            try
            {
                if (Directory.Exists(Dir) == false) Directory.CreateDirectory(Dir);
                if (File.Exists(FilePath))
                {
                    var ser = new JavaScriptSerializer();
                    var map = ser.Deserialize<Dictionary<string, object>>(File.ReadAllText(FilePath, Encoding.UTF8));
                    if (map != null)
                    {
                        s.ApiKey = Pick(map, "apiKey", s.ApiKey);
                        s.BaseUrl = Pick(map, "baseUrl", s.BaseUrl);
                        s.Model = Pick(map, "model", s.Model);
                        s.Hotkey = Pick(map, "hotkey", s.Hotkey);
                    }
                }
                else
                {
                    s.Save();
                }
            }
            catch { /* 配置坏了就用默认值，不要因为读配置失败而启动不了 */ }
            return s;
        }

        static string Pick(Dictionary<string, object> map, string key, string fallback)
        {
            object value;
            if (map.TryGetValue(key, out value) && value != null)
            {
                string text = Convert.ToString(value);
                if (!string.IsNullOrEmpty(text)) return text;
            }
            return fallback;
        }

        public void Save()
        {
            try
            {
                if (Directory.Exists(Dir) == false) Directory.CreateDirectory(Dir);
                var map = new Dictionary<string, object>();
                map["apiKey"] = ApiKey;
                map["baseUrl"] = BaseUrl;
                map["model"] = Model;
                map["hotkey"] = Hotkey;
                var ser = new JavaScriptSerializer();
                File.WriteAllText(FilePath, PrettyJson(ser.Serialize(map)), Encoding.UTF8);
            }
            catch { }
        }

        static string PrettyJson(string compact)
        {
            var sb = new StringBuilder();
            int depth = 0;
            bool inString = false;
            for (int i = 0; i < compact.Length; i++)
            {
                char c = compact[i];
                if (c == '"' && (i == 0 || compact[i - 1] != '\\')) inString = !inString;
                if (!inString && (c == '{' || c == '[')) { depth++; sb.Append(c); sb.Append("\n"); sb.Append(new string(' ', depth * 2)); continue; }
                if (!inString && (c == '}' || c == ']')) { depth--; sb.Append("\n"); sb.Append(new string(' ', depth * 2)); sb.Append(c); continue; }
                if (!inString && c == ',') { sb.Append(c); sb.Append("\n"); sb.Append(new string(' ', depth * 2)); continue; }
                sb.Append(c);
            }
            return sb.ToString();
        }

        public static string Endpoint(string baseUrl)
        {
            string b = (baseUrl ?? "").Trim().TrimEnd('/');
            if (b.Length == 0) b = "https://api.deepseek.com";
            if (Regex.IsMatch(b, "/chat/completions$", RegexOptions.IgnoreCase)) return b;
            if (Regex.IsMatch(b, @"/v\d+[a-z]*$", RegexOptions.IgnoreCase)) return b + "/chat/completions";
            return b + "/v1/chat/completions";
        }
    }

    static class Prompt
    {
        // 桌面版专用：读者通常选中整句，所以 sentence 模式额外要求解释句中的难词，
        // 用一句选中的文字换回「翻译 + 术语解释」，弥补拿不到段落上下文的短板。
        public const string System =
            "你是一名中文母语的学术阅读助手。读者在文档中选中了一段文字，想知道它是什么意思。\n\n" +
            "先判断类型，并在回答的第一行输出 MODE 标记（这一行必须存在，且只能出现在第一行）：\n" +
            "- MODE: word —— 单个英文单词或极短的名词短语（不超过 3 个词），读者想知道它的中文意思\n" +
            "- MODE: term —— 学术术语、专业名词、缩写、人名机构名、模型或方法名，读者想知道「这是什么东西」\n" +
            "- MODE: sentence —— 完整的句子或长句，读者想知道整句的意思\n\n" +
            "然后严格按对应模板输出，模板以外的内容一律不要写：\n\n" +
            "【MODE: word】\n音标: /音标/（没有把握就整行省略）\n词性: n. / v. / adj. …（多个词性用「；」分隔）\n释义: 一行中文释义，最多两个义项，用「；」分隔\n\n" +
            "【MODE: term】\n一句话: 用一句中文说清它是什么\n通常出现在: 这类词一般用在什么场景（不要假装知道读者那篇文章写了什么）\n\n" +
            "【MODE: sentence】\n译文: 中文译文，保持学术语气，不要逐字硬译\n术语: 句中出现的、读者可能不认识的专业术语或缩写，写成「原词 —— 一句话解释」；最多两个，用「；」分隔；没有就整行省略\n\n" +
            "规则：\n" +
            "1. 没把握就直说没把握，绝对不要编造定义、数据、出处或人名。\n" +
            "2. 同一个词在不同学科含义不同时，选择符合当前语境的义项。\n" +
            "3. term 模式总共不超过 3 句话；不要写「以下是我的解释」这类开场白。\n" +
            "4. 你只看到读者选中的这段文字，没有更多背景；不要假设它出自哪篇文章，也不要编造「在本文中」之类的说法。\n" +
            "5. 只输出模板要求的行，不要用 Markdown 标题、代码块或列表符号。";
    }

    enum CardState { Loading, Text, Error }

    sealed class CardWindow : Window
    {
        readonly StackPanel panel;
        readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
        string lastBody = "";

        static readonly FontFamily Font = new FontFamily("Microsoft YaHei UI, Microsoft YaHei, Segoe UI");
        static readonly Brush Fg = new SolidColorBrush(Color.FromRgb(0x1F, 0x23, 0x28));
        static readonly Brush Muted = new SolidColorBrush(Color.FromRgb(0x6B, 0x72, 0x80));
        static readonly Brush Line = new SolidColorBrush(Color.FromRgb(0xE8, 0xE9, 0xEB));
        static readonly Brush Danger = new SolidColorBrush(Color.FromRgb(0xD1, 0x24, 0x2F));
        static readonly Brush Accent = new SolidColorBrush(Color.FromRgb(0x25, 0x63, 0xEB));

        public CardWindow()
        {
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ShowActivated = false;
            SizeToContent = SizeToContent.Height;
            Width = 360;
            FontFamily = Font;

            var root = new Border();
            root.CornerRadius = new CornerRadius(12);
            root.Background = Brushes.White;
            root.BorderBrush = Line;
            root.BorderThickness = new Thickness(1);
            root.Margin = new Thickness(12);
            root.Effect = new DropShadowEffect
            {
                BlurRadius = 26,
                ShadowDepth = 6,
                Direction = 270,
                Opacity = 0.20,
                Color = Colors.Black
            };

            panel = new StackPanel();
            root.Child = panel;
            Content = root;

            Deactivated += delegate { HideCard(); };
            PreviewKeyDown += delegate(object sender, System.Windows.Input.KeyEventArgs e)
            {
                if (e.Key == Key.Escape) HideCard();
            };

            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icon32.png");
            try
            {
                if (File.Exists(iconPath))
                {
                    var img = new System.Windows.Media.Imaging.BitmapImage(new Uri(iconPath));
                    Icon = img;
                }
            }
            catch { }
        }

        public void HideCard()
        {
            if (IsVisible) Hide();
        }

        public void Render(string title, string body, CardState state, string note = null)
        {
            panel.Children.Clear();

            // 头部
            var head = new Grid();
            head.Margin = new Thickness(12, 9, 8, 8);
            head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var term = new TextBlock();
            term.Text = title ?? "";
            term.FontSize = 12;
            term.Foreground = Muted;
            term.TextTrimming = TextTrimming.CharacterEllipsis;
            term.TextWrapping = TextWrapping.NoWrap;
            term.ToolTip = title;
            Grid.SetColumn(term, 0);
            head.Children.Add(term);

            var close = new Button();
            close.Content = "×";
            close.Width = 22;
            close.Height = 22;
            close.FontSize = 15;
            close.Padding = new Thickness(0);
            close.Foreground = Muted;
            close.Background = Brushes.Transparent;
            close.BorderThickness = new Thickness(0);
            close.Cursor = System.Windows.Input.Cursors.Hand;
            close.ToolTip = "关闭（Esc）";
            close.Click += delegate { HideCard(); };
            Grid.SetColumn(close, 1);
            head.Children.Add(close);

            panel.Children.Add(head);
            panel.Children.Add(HorizontalRule());

            // 正文
            var scroll = new ScrollViewer();
            scroll.MaxHeight = 360;
            scroll.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            scroll.Margin = new Thickness(0, 8, 0, 10);

            var inner = new StackPanel();
            scroll.Content = inner;

            if (state == CardState.Loading)
            {
                inner.Children.Add(BodyLine(null, "正在查…", Muted));
            }
            else if (state == CardState.Error)
            {
                inner.Children.Add(BodyLine(null, body, Danger));
            }
            else
            {
                string[] lines = (body ?? "").Replace("\r\n", "\n").Split('\n');
                foreach (string raw in lines)
                {
                    string line = (raw ?? "").Replace("**", "").Trim();
                    if (line.Length == 0) { continue; }
                    var m = Regex.Match(line, @"^([^:：]{1,10})[:：]\s*(.*)$");
                    if (m.Success) inner.Children.Add(BodyLine(m.Groups[1].Value.Trim(), m.Groups[2].Value, Fg));
                    else inner.Children.Add(BodyLine(null, line, Fg));
                }
                lastBody = body;
            }

            panel.Children.Add(scroll);
            panel.Children.Add(HorizontalRule());

            // 底部：左边复制，右边提示这次有没有带上上下文
            var foot = new Grid();
            foot.Margin = new Thickness(8, 6, 10, 6);
            foot.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            foot.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            foot.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var left = new StackPanel();
            left.Orientation = Orientation.Horizontal;
            if (state == CardState.Text && !string.IsNullOrEmpty(body))
            {
                var copy = LinkButton("复制");
                copy.Click += delegate
                {
                    try { WinForms.Clipboard.SetText(lastBody); } catch { }
                    HideCard();
                };
                left.Children.Add(copy);
            }
            Grid.SetColumn(left, 0);
            foot.Children.Add(left);

            if (!string.IsNullOrEmpty(note))
            {
                var noteBlock = new TextBlock();
                noteBlock.Text = note;
                noteBlock.FontSize = 11;
                noteBlock.Foreground = Muted;
                noteBlock.VerticalAlignment = VerticalAlignment.Center;
                noteBlock.Margin = new Thickness(4, 0, 0, 0);
                noteBlock.ToolTip = "UI Automation 能读到选中所处的段落时，解释会更贴合语境";
                Grid.SetColumn(noteBlock, 2);
                foot.Children.Add(noteBlock);
            }

            panel.Children.Add(foot);
        }

        static Border HorizontalRule()
        {
            var line = new Border();
            line.BorderBrush = Line;
            line.BorderThickness = new Thickness(0, 1, 0, 0);
            return line;
        }

        static Button LinkButton(string text)
        {
            var b = new Button();
            b.Content = text;
            b.FontSize = 12.5;
            b.Foreground = Muted;
            b.Background = Brushes.Transparent;
            b.BorderThickness = new Thickness(0);
            b.Padding = new Thickness(8, 3, 8, 3);
            b.Cursor = System.Windows.Input.Cursors.Hand;
            return b;
        }

        static TextBlock BodyLine(string label, string text, Brush brush)
        {
            var row = new TextBlock();
            row.FontSize = 13.5;
            row.LineHeight = 22;
            row.TextWrapping = TextWrapping.Wrap;
            row.Margin = new Thickness(12, 0, 12, 5);

            if (!string.IsNullOrEmpty(label))
            {
                var run1 = new Run(label + "：");
                run1.Foreground = Muted;
                run1.FontSize = 12.5;
                row.Inlines.Add(run1);
            }
            var run2 = new Run(text ?? "");
            run2.Foreground = brush;
            row.Inlines.Add(run2);
            return row;
        }

        public void ShowNearCursor()
        {
            Opacity = 0;
            if (!IsVisible) Show();
            UpdateLayout();

            double scaleX = 1, scaleY = 1;
            var source = PresentationSource.FromVisual(this);
            if (source != null && source.CompositionTarget != null)
            {
                scaleX = source.CompositionTarget.TransformToDevice.M11;
                scaleY = source.CompositionTarget.TransformToDevice.M22;
            }
            if (scaleX <= 0) scaleX = 1;
            if (scaleY <= 0) scaleY = 1;

            Drawing.Point cursor = WinForms.Cursor.Position;
            Drawing.Rectangle work = WinForms.Screen.FromPoint(cursor).WorkingArea;

            double workLeft = work.Left / scaleX;
            double workTop = work.Top / scaleY;
            double workRight = (work.Left + work.Width) / scaleX;
            double workBottom = (work.Top + work.Height) / scaleY;
            double cx = cursor.X / scaleX;
            double cy = cursor.Y / scaleY;

            double w = ActualWidth;
            double h = ActualHeight;

            double left = cx + 16;
            double top = cy + 18;
            if (left + w > workRight - 8) left = workRight - w - 8;
            if (left < workLeft + 8) left = workLeft + 8;
            if (top + h > workBottom - 8) top = cy - h - 18;
            if (top < workTop + 8) top = workTop + 8;

            Left = left;
            Top = top;
            Opacity = 1;
            Activate();
        }
    }

    sealed class HotkeySource : IDisposable
    {
        public const int Id = 0x0DA0;
        HwndSource source;
        public event Action Pressed;

        public bool Register(string combo)
        {
            var parts = ParseCombo(combo);
            var parameters = new HwndSourceParameters("daodu-hotkey");
            parameters.Width = 0;
            parameters.Height = 0;
            parameters.WindowStyle = 0;
            source = new HwndSource(parameters);
            source.AddHook(WndProc);
            return Native.RegisterHotKey(source.Handle, Id, (uint)parts.Key, (uint)parts.Value);
        }

        static KeyValuePair<int, int> ParseCombo(string combo)
        {
            int mods = 0;
            int vk = 0;
            string[] parts = (combo ?? "").Split(new char[] { '+' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string raw in parts)
            {
                string p = raw.Trim();
                if (p.Equals("ctrl", StringComparison.OrdinalIgnoreCase)) mods |= 0x0002;
                else if (p.Equals("alt", StringComparison.OrdinalIgnoreCase)) mods |= 0x0001;
                else if (p.Equals("shift", StringComparison.OrdinalIgnoreCase)) mods |= 0x0004;
                else if (p.Equals("win", StringComparison.OrdinalIgnoreCase)) mods |= 0x0008;
                else if (p.Length > 0) vk = char.ToUpperInvariant(p[0]);
            }
            if (vk == 0) vk = 'D';
            return new KeyValuePair<int, int>(mods, vk);
        }

        IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == 0x0312 && wParam.ToInt32() == Id)
            {
                handled = true;
                var handler = Pressed;
                if (handler != null) handler();
            }
            return IntPtr.Zero;
        }

        public void Dispose()
        {
            if (source != null)
            {
                Native.UnregisterHotKey(source.Handle, Id);
                source.Dispose();
                source = null;
            }
        }
    }

    static class Native
    {
        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    }

    /// <summary>
    /// 用 UI Automation 直接读当前文档里的选区和所在段落。
    /// 比模拟 Ctrl+C 好在两点：不碰剪贴板，而且能顺手拿到上下文。
    /// WPS / Adobe / Zotero 这类程序多数支持，不支持的会返回 false，由调用方回退到复制。
    /// </summary>
    static class Uia
    {
        sealed class Result
        {
            public string Text = "";
            public string Context = "";
        }

        public static bool TryGetSelection(out string selected, out string context)
        {
            selected = "";
            context = "";

            Result result = null;
            try
            {
                // UIA 调用偶尔会卡住，给它 1.5 秒
                var task = Task.Run(new Func<Result>(ReadNow));
                if (!task.Wait(1500)) return false;
                result = task.Result;
            }
            catch { return false; }

            if (result == null || string.IsNullOrEmpty(result.Text)) return false;
            selected = result.Text;
            context = result.Context;
            return true;
        }

        static Result ReadNow()
        {
            var result = new Result();
            try
            {
                var element = AutomationElement.FocusedElement;
                if (element == null) return result;

                object patternObject;
                if (!element.TryGetCurrentPattern(TextPattern.Pattern, out patternObject)) return result;

                var pattern = patternObject as TextPattern;
                if (pattern == null) return result;

                TextPatternRange[] ranges = pattern.GetSelection();
                if (ranges == null || ranges.Length == 0) return result;

                TextPatternRange range = ranges[0];
                string raw = range.GetText(-1);
                if (string.IsNullOrEmpty(raw)) return result;

                result.Text = Normalize(raw);
                if (result.Text.Length == 0) return result;

                try
                {
                    TextPatternRange paragraph = range.Clone();
                    paragraph.ExpandToEnclosingUnit(TextUnit.Paragraph);
                    string block = paragraph.GetText(4000);
                    result.Context = SliceAround(block, result.Text, 100);
                }
                catch { }

                return result;
            }
            catch { return result; }
        }

        static string Normalize(string text)
        {
            if (text == null) return "";
            return Regex.Replace(text.Replace("\r\n", "\n").Replace('\r', '\n'), @"\s+", " ").Trim();
        }

        static string SliceAround(string block, string selected, int radius)
        {
            if (string.IsNullOrEmpty(block)) return "";
            string flat = Normalize(block);
            if (flat.Length == 0) return "";

            int index = flat.IndexOf(selected, StringComparison.Ordinal);
            if (index < 0 && selected.Length > 20)
            {
                index = flat.IndexOf(selected.Substring(0, 20), StringComparison.Ordinal);
            }
            if (index < 0)
            {
                // 定位不到就退化成「整段照给」，总比没有强
                return flat.Length > 600 ? flat.Substring(0, 600) : flat;
            }

            int start = Math.Max(0, index - radius);
            int end = Math.Min(flat.Length, index + selected.Length + radius);
            string slice = flat.Substring(start, end - start).Trim();
            return slice == selected ? "" : slice;
        }

        public static string ForegroundTitle()
        {
            try
            {
                IntPtr hwnd = Native.GetForegroundWindow();
                if (hwnd == IntPtr.Zero) return "";
                var buffer = new StringBuilder(512);
                Native.GetWindowText(hwnd, buffer, buffer.Capacity);
                return buffer.ToString().Trim();
            }
            catch { return ""; }
        }
    }

    sealed class Tray : IDisposable
    {
        WinForms.NotifyIcon icon;
        WinForms.ContextMenuStrip menu;

        public event Action QueryRequested;
        public event Action SettingsRequested;
        public event Action ExportRequested;
        public event Action ExitRequested;

        public Tray()
        {
            icon = new WinForms.NotifyIcon();
            icon.Text = "导读 · 划词（Ctrl+Alt+D）";
            icon.Icon = LoadIcon();
            icon.Visible = true;

            menu = new WinForms.ContextMenuStrip();
            var q = menu.Items.Add("查当前选中文字");
            var s = menu.Items.Add("设置…");
            var e = menu.Items.Add("导出术语表…");
            menu.Items.Add(new WinForms.ToolStripSeparator());
            var x = menu.Items.Add("退出");

            q.Click += delegate { var h = QueryRequested; if (h != null) h(); };
            s.Click += delegate { var h = SettingsRequested; if (h != null) h(); };
            e.Click += delegate { var h = ExportRequested; if (h != null) h(); };
            x.Click += delegate { var h = ExitRequested; if (h != null) h(); };

            icon.ContextMenuStrip = menu;
            icon.DoubleClick += delegate { var h = QueryRequested; if (h != null) h(); };
        }

        static Drawing.Icon LoadIcon()
        {
            try
            {
                string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icon32.png");
                if (File.Exists(path))
                {
                    using (var bmp = new Drawing.Bitmap(path))
                    {
                        IntPtr handle = bmp.GetHicon();
                        return Drawing.Icon.FromHandle(handle);
                    }
                }
            }
            catch { }
            return Drawing.SystemIcons.Application;
        }

        public void Notify(string text)
        {
            try { icon.ShowBalloonTip(4000, "导读", text, WinForms.ToolTipIcon.Info); } catch { }
        }

        public void SetHotkey(string combo)
        {
            try
            {
                icon.Text = string.IsNullOrEmpty(combo)
                    ? "导读 · 划词（热键不可用）"
                    : "导读 · 划词（" + combo + "）";
            }
            catch { }
        }

        public void Dispose()
        {
            if (icon != null) { icon.Visible = false; icon.Dispose(); icon = null; }
            if (menu != null) { menu.Dispose(); menu = null; }
        }
    }

    sealed class SettingsWindow : Window
    {
        readonly TextBox keyBox;
        readonly TextBox urlBox;
        readonly TextBox modelBox;
        readonly TextBox hotkeyBox;

        public SettingsWindow(Settings current)
        {
            Title = "导读 · 设置";
            Width = 460;
            SizeToContent = SizeToContent.Height;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = new SolidColorBrush(Color.FromRgb(0xF6, 0xF7, 0xF9));
            FontFamily = new FontFamily("Microsoft YaHei UI, Segoe UI");

            var panel = new StackPanel();
            panel.Margin = new Thickness(20);

            keyBox = AddField(panel, "API Key", current.ApiKey);
            urlBox = AddField(panel, "Base URL", current.BaseUrl);
            modelBox = AddField(panel, "模型名", current.Model);
            hotkeyBox = AddField(panel, "热键（Ctrl / Alt / Shift / Win 的组合，例如 Ctrl+Shift+D）", current.Hotkey);

            var hint = new TextBlock();
            hint.Text = "Key 存在 " + Settings.FilePath + "，只发给你填的服务地址。";
            hint.FontSize = 11.5;
            hint.Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x72, 0x80));
            hint.TextWrapping = TextWrapping.Wrap;
            hint.Margin = new Thickness(0, 10, 0, 0);
            panel.Children.Add(hint);

            var save = new Button();
            save.Content = "保存";
            save.Margin = new Thickness(0, 16, 0, 0);
            save.Padding = new Thickness(18, 7, 18, 7);
            save.HorizontalAlignment = HorizontalAlignment.Left;
            save.Background = new SolidColorBrush(Color.FromRgb(0x25, 0x63, 0xEB));
            save.Foreground = Brushes.White;
            save.BorderThickness = new Thickness(0);
            save.FontSize = 13;
            save.Cursor = System.Windows.Input.Cursors.Hand;
            save.Click += delegate
            {
                var s = Settings.Current;
                s.ApiKey = keyBox.Text.Trim();
                s.BaseUrl = urlBox.Text.Trim();
                s.Model = modelBox.Text.Trim();
                string hotkey = hotkeyBox.Text.Trim();
                if (hotkey.Length > 0) s.Hotkey = hotkey;
                s.Save();
                Close();
                Program.ApplyHotkey();
            };
            panel.Children.Add(save);

            Content = panel;
        }

        static TextBox AddField(StackPanel panel, string label, string value)
        {
            var lbl = new TextBlock();
            lbl.Text = label;
            lbl.FontSize = 12.5;
            lbl.Foreground = new SolidColorBrush(Color.FromRgb(0x6B, 0x72, 0x80));
            lbl.Margin = new Thickness(0, 10, 0, 4);
            panel.Children.Add(lbl);

            var box = new TextBox();
            box.Text = value ?? "";
            box.FontSize = 13;
            box.Padding = new Thickness(8, 6, 8, 6);
            panel.Children.Add(box);
            return box;
        }
    }

    /// <summary>
    /// 本地存储：术语表 + 查询缓存，都是 %APPDATA%\daodu 下的 json 文件，不上传任何地方。
    /// </summary>
    static class Store
    {
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        static List<Dictionary<string, object>> vocab;
        static Dictionary<string, Dictionary<string, object>> cache;

        public static string VocabPath { get { return Path.Combine(Settings.Dir, "vocab.json"); } }
        public static string CachePath { get { return Path.Combine(Settings.Dir, "cache.json"); } }

        static long Now { get { return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds; } }

        static string Text(Dictionary<string, object> item, string key)
        {
            object value;
            if (!item.TryGetValue(key, out value) || value == null) return "";
            return Convert.ToString(value);
        }

        static long Number(Dictionary<string, object> item, string key)
        {
            object value;
            if (!item.TryGetValue(key, out value) || value == null) return 0;
            long parsed;
            return long.TryParse(Convert.ToString(value), out parsed) ? parsed : 0;
        }

        // ---------------- 术语表 ----------------

        public static List<Dictionary<string, object>> Vocab()
        {
            if (vocab != null) return vocab;
            vocab = new List<Dictionary<string, object>>();
            try
            {
                if (File.Exists(VocabPath))
                {
                    var loaded = Json.Deserialize<List<Dictionary<string, object>>>(File.ReadAllText(VocabPath, Encoding.UTF8));
                    if (loaded != null) vocab = loaded;
                }
            }
            catch { }

            // 老记录没有 paper 字段，读进来时补上，导出才不会少一列
            foreach (var item in vocab)
            {
                if (string.IsNullOrEmpty(Text(item, "paper"))) item["paper"] = PaperOf(Text(item, "source"));
            }
            return vocab;
        }

        static void SaveVocab()
        {
            try
            {
                if (!Directory.Exists(Settings.Dir)) Directory.CreateDirectory(Settings.Dir);
                File.WriteAllText(VocabPath, Json.Serialize(Vocab()), Encoding.UTF8);
            }
            catch { }
        }

        /// <summary>把窗口标题收拾成「论文名」：去掉「 - WPS Office」这类应用后缀</summary>
        public static string PaperOf(string title)
        {
            string text = (title ?? "").Trim();
            if (text.Length == 0) return "未知来源";

            text = Regex.Replace(
                text,
                @"\s+[-–—]\s+(WPS Office|WPS|Microsoft Word|Word|Adobe Acrobat.*|Adobe Reader.*|Foxit.*|SumatraPDF|Notepad|记事本|Edge|Google Chrome|Chrome).*$",
                "",
                RegexOptions.IgnoreCase);

            text = text.Trim();
            return text.Length == 0 ? "未知来源" : text;
        }

        public static void AddVocab(string term, string answer, string mode, string source)
        {
            if (string.IsNullOrEmpty(term) || string.IsNullOrEmpty(answer)) return;

            string paper = PaperOf(source);
            var list = Vocab();

            // 老记录没有 paper，先补上
            foreach (var old in list)
            {
                if (string.IsNullOrEmpty(Text(old, "paper"))) old["paper"] = PaperOf(Text(old, "source"));
            }

            Dictionary<string, object> existing = null;
            foreach (var item in list)
            {
                if (Text(item, "term") == term && Text(item, "mode") == mode && Text(item, "paper") == paper)
                {
                    existing = item;
                    break;
                }
            }

            if (existing != null)
            {
                existing["answer"] = answer;
                existing["ts"] = Now;
                existing["hits"] = Number(existing, "hits") + 1;
                existing["source"] = source;
            }
            else
            {
                var item = new Dictionary<string, object>();
                item["term"] = term;
                item["answer"] = answer;
                item["mode"] = mode;
                item["paper"] = paper;
                item["source"] = source;
                item["ts"] = Now;
                item["hits"] = 1;
                list.Add(item);
                if (list.Count > 2000) list.RemoveAt(0); // 先进先出，防止无限增长
            }

            SaveVocab();
        }

        public static int VocabCount()
        {
            return Vocab().Count;
        }

        static string ModeLabel(string mode)
        {
            if (mode == "word") return "单词";
            if (mode == "sentence") return "翻译";
            return "术语";
        }

        static string FormatTime(long ts)
        {
            try
            {
                var time = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(ts).ToLocalTime();
                return time.ToString("yyyy-MM-dd HH:mm");
            }
            catch { return ""; }
        }

        static string Cell(string value)
        {
            string text = (value ?? "")
                .Replace("\r\n", " ")
                .Replace("\n", " ")
                .Replace("\"", "\"\"");
            return "\"" + text + "\"";
        }

        /// <summary>导出用 CSV：先按论文聚合，再按时间倒序。第一字节是 BOM，Excel / Anki 打开中文不乱码</summary>
        public static string Csv()
        {
            var items = new List<Dictionary<string, object>>(Vocab());
            items.Sort(delegate(Dictionary<string, object> a, Dictionary<string, object> b)
            {
                int byPaper = string.Compare(Text(a, "paper"), Text(b, "paper"), StringComparison.CurrentCulture);
                if (byPaper != 0) return byPaper;
                return Number(b, "ts").CompareTo(Number(a, "ts"));
            });

            var sb = new StringBuilder();
            sb.Append('\uFEFF');
            sb.AppendLine("\"论文\",\"词\",\"类型\",\"解释\",\"时间\",\"次数\"");
            foreach (var item in items)
            {
                sb.AppendLine(string.Join(",", new string[]
                {
                    Cell(Text(item, "paper")),
                    Cell(Text(item, "term")),
                    Cell(ModeLabel(Text(item, "mode"))),
                    Cell(Text(item, "answer")),
                    Cell(FormatTime(Number(item, "ts"))),
                    Cell(Number(item, "hits").ToString())
                }));
            }
            return sb.ToString();
        }

        // ---------------- 缓存 ----------------

        static Dictionary<string, Dictionary<string, object>> Cache()
        {
            if (cache != null) return cache;
            cache = new Dictionary<string, Dictionary<string, object>>();
            try
            {
                if (File.Exists(CachePath))
                {
                    var loaded = Json.Deserialize<Dictionary<string, Dictionary<string, object>>>(File.ReadAllText(CachePath, Encoding.UTF8));
                    if (loaded != null) cache = loaded;
                }
            }
            catch { }
            return cache;
        }

        static void SaveCache()
        {
            try
            {
                if (!Directory.Exists(Settings.Dir)) Directory.CreateDirectory(Settings.Dir);
                File.WriteAllText(CachePath, Json.Serialize(Cache()), Encoding.UTF8);
            }
            catch { }
        }

        public static string CacheKey(string text, string source, string mode)
        {
            string raw = (text ?? "") + "|" + (source ?? "") + "|" + (mode ?? "auto");
            uint hash = 2166136261;
            foreach (char c in raw)
            {
                hash ^= c;
                hash *= 16777619;
            }
            return hash.ToString("x");
        }

        public static bool CacheTryGet(string key, out string text)
        {
            text = "";
            var map = Cache();
            Dictionary<string, object> entry;
            if (!map.TryGetValue(key, out entry)) return false;

            long ts = Number(entry, "ts");
            if (Now - ts > 48L * 60 * 60 * 1000)
            {
                map.Remove(key);
                return false;
            }

            text = Text(entry, "text");
            return !string.IsNullOrEmpty(text);
        }

        public static void CacheSet(string key, string text)
        {
            var map = Cache();
            var entry = new Dictionary<string, object>();
            entry["text"] = text;
            entry["ts"] = Now;
            map[key] = entry;

            if (map.Count > 500)
            {
                // 老的最先淘汰
                var keys = new List<string>(map.Keys);
                keys.Sort(delegate(string a, string b) { return Number(map[a], "ts").CompareTo(Number(map[b], "ts")); });
                for (int i = 0; i < keys.Count - 400; i++) map.Remove(keys[i]);
            }

            SaveCache();
        }

        public static int CacheCount()
        {
            return Cache().Count;
        }
    }

    static class Program
    {
        static Application app;
        static CardWindow card;
        static Tray tray;
        static HotkeySource hotkey;
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        [STAThread]
        static int Main(string[] args)
        {
            string trace = Path.Combine(Path.GetTempPath(), "daodu-start.txt");
            Action<string> mark = delegate(string m)
            {
                try { File.AppendAllText(trace, DateTime.Now.ToString("HH:mm:ss.fff") + "  " + m + "\n", Encoding.UTF8); } catch { }
            };
            try { File.WriteAllText(trace, "", Encoding.UTF8); } catch { }

            try
            {
                mark("main start");
                Json.MaxJsonLength = int.MaxValue;
                Settings.Current = Settings.Load();
                mark("settings loaded: " + Settings.FilePath);

                if (HasFlag(args, "--selftest")) { SelfTest(); return 0; }
                if (HasFlag(args, "--uia")) { UiaProbe(); return 0; }

                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;

                app = new Application();
                app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
                SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(Dispatcher.CurrentDispatcher));
                mark("application created");

                card = new CardWindow();
                mark("card created");

                tray = new Tray();
                tray.QueryRequested += delegate { BeginQuery(); };
                tray.SettingsRequested += delegate { ShowSettings(); };
                tray.ExportRequested += delegate { ExportVocab(); };
                tray.ExitRequested += delegate { Shutdown(); };
                mark("tray created");

                ApplyHotkey();
                bool hotkeyOk = HotkeyOk;
                mark("hotkey registered: " + hotkeyOk);

                if (HasFlag(args, "--smoketest"))
                {
                    var timer = new DispatcherTimer();
                    timer.Interval = TimeSpan.FromMilliseconds(1200);
                    timer.Tick += delegate
                    {
                        try
                        {
                            timer.Stop();
                            string line = "SMOKE OK hotkey=" + hotkeyOk + " combo=" + ActiveHotkey + " tray=" + (tray != null);
                            try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "daodu-smoke.txt"), line, Encoding.UTF8); } catch { }
                            mark(line);
                            Shutdown();
                        }
                        catch (Exception ex)
                        {
                            mark("SMOKE TICK ERROR " + ex.GetType().FullName + " :: " + SafeMessage(ex));
                            Shutdown();
                        }
                    };
                    timer.Start();
                    mark("smoke timer started");
                }

                mark("entering dispatcher");
                int code = app.Run();
                mark("dispatcher exited: " + code);
                try { hotkey.Dispose(); } catch { }
                try { tray.Dispose(); } catch { }
                return code;
            }
            catch (Exception ex)
            {
                mark("CRASH " + ex.GetType().FullName + " :: " + SafeMessage(ex));
                try { File.AppendAllText(trace, ex.StackTrace + "\n", Encoding.UTF8); } catch { }
                return 1;
            }
        }

        static void Shutdown()
        {
            try { hotkey.Dispose(); } catch { }
            try { tray.Dispose(); } catch { }
            app.Shutdown();
        }

        public static bool HotkeyOk;
        public static string ActiveHotkey = "";

        /// <summary>配置的热键被占用时，按顺序试这些</summary>
        static readonly string[] HotkeyFallbacks = new string[]
        {
            "Ctrl+Shift+Q", "Ctrl+Alt+Q", "Ctrl+Shift+F9", "Ctrl+Alt+F9", "Ctrl+Shift+F10"
        };

        /// <summary>（重新）注册热键。配置的组合被占用就自动往后找，避免「按了没反应」。</summary>
        public static void ApplyHotkey()
        {
            var candidates = new List<string>();
            if (!string.IsNullOrEmpty(Settings.Current.Hotkey)) candidates.Add(Settings.Current.Hotkey.Trim());
            foreach (string f in HotkeyFallbacks)
            {
                bool exists = false;
                foreach (string c in candidates) { if (string.Equals(c, f, StringComparison.OrdinalIgnoreCase)) { exists = true; break; } }
                if (!exists) candidates.Add(f);
            }

            HotkeyOk = false;
            ActiveHotkey = "";

            foreach (string combo in candidates)
            {
                try { if (hotkey != null) hotkey.Dispose(); } catch { }

                hotkey = new HotkeySource();
                hotkey.Pressed += delegate { BeginQuery(); };

                if (hotkey.Register(combo))
                {
                    HotkeyOk = true;
                    ActiveHotkey = combo;
                    break;
                }
            }

            if (tray != null)
            {
                tray.SetHotkey(ActiveHotkey);
                if (!HotkeyOk)
                {
                    tray.Notify("这个热键和备用的几个都被占用了。右键托盘可以用菜单查询，也可以在设置里换一个组合。");
                }
                else if (!string.Equals(ActiveHotkey, Settings.Current.Hotkey, StringComparison.OrdinalIgnoreCase))
                {
                    tray.Notify(Settings.Current.Hotkey + " 被别的程序占用了，已临时改用 " + ActiveHotkey +
                        "。想固定下来的话，在设置里把它填进去。");
                }
            }
        }

        static void ShowSettings()
        {
            var w = new SettingsWindow(Settings.Current);
            w.ShowDialog();
        }

        static void BeginQuery()
        {
            string windowTitle = Uia.ForegroundTitle();

            string text;
            string context;
            bool fromUia = Uia.TryGetSelection(out text, out context);

            if (!fromUia)
            {
                text = ReadSelection();
                context = "";
            }

            if (string.IsNullOrEmpty(text))
            {
                card.Render("没有读到选中的文字",
                    "先选中文字，再按热键。\n" +
                    "如果确实选中了：先在这个软件里试一下 Ctrl+C 能不能复制。\n" +
                    "复制不了的话，说明它有复制保护，模拟按键读不到内容。",
                    CardState.Error);
                card.ShowNearCursor();
                return;
            }

            card.Render(text, "", CardState.Loading);
            card.ShowNearCursor();

            if (string.IsNullOrEmpty(Settings.Current.ApiKey))
            {
                card.Render(text, "还没填 API Key。右键托盘图标 → 设置。", CardState.Error);
                return;
            }

            RunQuery(text, context, windowTitle);
        }

        static async void RunQuery(string text, string context, string title)
        {
            string source = title ?? "";
            string cacheKey = Store.CacheKey(text, source, "auto");

            // 命中缓存：秒出，不花钱
            string cached;
            if (Store.CacheTryGet(cacheKey, out cached))
            {
                card.Render(text, cached, CardState.Text, "缓存");
                Store.AddVocab(text, cached, ModeOf(cached), source);
                return;
            }

            // 只在真的读到了上下文时才标；读不到是常态，不必每次都提醒
            string note = string.IsNullOrEmpty(context) ? null : "已带上下文";
            try
            {
                string body = await QueryAsync(text, context, title);
                card.Render(text, body, CardState.Text, note);
                Store.CacheSet(cacheKey, body);
                Store.AddVocab(text, body, ModeOf(body), source);
            }
            catch (Exception ex)
            {
                card.Render(text, Friendly(ex), CardState.Error);
            }
        }

        /// <summary>答案里已经没有 MODE 行了，用首行的标签反推类型，给术语表分类用</summary>
        static string ModeOf(string body)
        {
            string text = (body ?? "").TrimStart();
            if (text.StartsWith("译文")) return "sentence";
            if (text.StartsWith("音标") || text.StartsWith("词性") || text.StartsWith("释义")) return "word";
            return "term";
        }

        static void ExportVocab()
        {
            try
            {
                int count = Store.VocabCount();
                if (count == 0)
                {
                    tray.Notify("术语表还是空的，先查几个词吧。");
                    return;
                }

                var dialog = new WinForms.SaveFileDialog();
                dialog.Title = "导出术语表";
                dialog.Filter = "CSV 文件 (*.csv)|*.csv";
                dialog.FileName = "导读术语表-" + DateTime.Now.ToString("yyyyMMdd") + ".csv";
                if (dialog.ShowDialog() != WinForms.DialogResult.OK) return;

                // Csv() 里已经带了 BOM，这里不要再加一次
                File.WriteAllText(dialog.FileName, Store.Csv(), new UTF8Encoding(false));
                tray.Notify("已导出 " + count + " 条：" + Path.GetFileName(dialog.FileName));
            }
            catch (Exception ex)
            {
                tray.Notify("导出失败：" + ex.Message);
            }
        }

        /// <summary>
        /// 等用户把 Ctrl/Shift/Alt/Win 松开再模拟复制。
        /// 否则热键里的修饰键还按着，发出去的 ^c 会变成 Ctrl+Shift+C 之类的组合，
        /// 目标软件根本不执行「复制」，表现就是「明明选中了却说没选中」。
        /// </summary>
        static void WaitForModifiersReleased(int timeoutMs)
        {
            int start = Environment.TickCount;
            while (Environment.TickCount - start < timeoutMs)
            {
                bool down = ModifierDown(0x11)   // Ctrl
                         || ModifierDown(0x10)   // Shift
                         || ModifierDown(0x12)   // Alt
                         || ModifierDown(0x5B)   // Win 左
                         || ModifierDown(0x5C);  // Win 右
                if (!down) return;
                Thread.Sleep(15);
            }
        }

        static bool ModifierDown(int vk)
        {
            try { return (Native.GetAsyncKeyState(vk) & 0x8000) != 0; }
            catch { return false; }
        }

        static string ReadSelection()
        {
            WaitForModifiersReleased(900);

            // 两次尝试：有些软件第一次响应模拟按键会慢半拍
            for (int attempt = 0; attempt < 2; attempt++)
            {
                try { WinForms.Clipboard.Clear(); } catch { }
                try { WinForms.SendKeys.SendWait("^c"); } catch { return ""; }

                for (int i = 0; i < 20; i++)
                {
                    Thread.Sleep(50);
                    string text = "";
                    try { text = WinForms.Clipboard.GetText(); } catch { text = ""; }
                    if (!string.IsNullOrEmpty(text)) return text.Trim();
                }

                Thread.Sleep(150);
            }
            return "";
        }

        static async Task<string> QueryAsync(string text, string context, string title)
        {
            var s = Settings.Current;
            var payload = new Dictionary<string, object>();
            payload["model"] = s.Model;
            payload["messages"] = new object[]
            {
                new Dictionary<string, object> { { "role", "system" }, { "content", Prompt.System } },
                new Dictionary<string, object> { { "role", "user" }, { "content", BuildUserMessage(text, context, title) } }
            };
            payload["stream"] = false;
            payload["temperature"] = 0.3;
            payload["max_tokens"] = 800;

            if ((s.Model ?? "").ToLowerInvariant().StartsWith("deepseek"))
            {
                payload["thinking"] = new Dictionary<string, object> { { "type", "disabled" } };
            }

            string json = Json.Serialize(payload);
            var request = (HttpWebRequest)WebRequest.Create(Settings.Endpoint(s.BaseUrl));
            request.Method = "POST";
            request.ContentType = "application/json; charset=utf-8";
            request.Headers.Add("Authorization", "Bearer " + s.ApiKey);
            request.Timeout = 30000;
            request.ReadWriteTimeout = 30000;

            byte[] bytes = Encoding.UTF8.GetBytes(json);
            request.ContentLength = bytes.Length;
            using (var stream = await request.GetRequestStreamAsync())
            {
                await stream.WriteAsync(bytes, 0, bytes.Length);
            }

            HttpWebResponse response;
            try
            {
                response = (HttpWebResponse)await request.GetResponseAsync();
            }
            catch (WebException ex)
            {
                // C# 5 不允许在 catch 里 await，这里同步读错误体（很小）
                var failed = ex.Response as HttpWebResponse;
                if (failed == null) throw new Exception(ex.Message);
                using (failed)
                using (var reader = new StreamReader(failed.GetResponseStream(), Encoding.UTF8))
                {
                    string errorBody = reader.ReadToEnd();
                    if (errorBody != null && errorBody.Length > 300) errorBody = errorBody.Substring(0, 300);
                    throw new Exception("HTTP " + (int)failed.StatusCode + ": " + errorBody);
                }
            }

            using (response)
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                string body = await reader.ReadToEndAsync();
                return ExtractAnswer(body);
            }
        }

        static string BuildUserMessage(string text, string context, string title)
        {
            var sb = new StringBuilder();
            sb.Append("选中内容：\n\"\"\"\n").Append(text).Append("\n\"\"\"");

            if (!string.IsNullOrEmpty(context))
            {
                sb.Append("\n\n上下文（选区前后各约 100 字）：\n\"\"\"\n").Append(context).Append("\n\"\"\"");
            }
            if (!string.IsNullOrEmpty(title))
            {
                sb.Append("\n\n窗口标题：").Append(title);
            }
            return sb.ToString();
        }

        static string ExtractAnswer(string raw)
        {
            var obj = Json.Deserialize<Dictionary<string, object>>(raw);
            object choicesValue;
            if (obj == null || !obj.TryGetValue("choices", out choicesValue)) throw new Exception("模型没有返回内容");

            // JavaScriptSerializer 把 JSON 数组反序列化成 object[]，但不同版本可能是别的 IList 实现
            var choices = choicesValue as System.Collections.IList;
            if (choices == null || choices.Count == 0) throw new Exception("模型没有返回内容（choices 为空）");

            var first = choices[0] as Dictionary<string, object>;
            if (first == null) throw new Exception("返回格式不对（choices[0]）");

            object messageValue;
            if (!first.TryGetValue("message", out messageValue)) throw new Exception("返回格式不对（message）");
            var message = messageValue as Dictionary<string, object>;
            if (message == null) throw new Exception("返回格式不对（message）");

            object contentValue;
            if (!message.TryGetValue("content", out contentValue)) throw new Exception("模型没有返回内容");
            string content = Convert.ToString(contentValue);
            if (string.IsNullOrEmpty(content)) throw new Exception("模型没有返回内容");

            string[] lines = content.Replace("\r\n", "\n").Split('\n');
            if (lines.Length > 0 && Regex.IsMatch(lines[0].Trim(), @"^\**MODE\**\s*[:：]"))
            {
                var rest = new StringBuilder();
                for (int i = 1; i < lines.Length; i++) { if (i > 1) rest.Append('\n'); rest.Append(lines[i]); }
                content = rest.ToString();
            }
            return content.Trim();
        }

        static string Friendly(Exception ex)
        {
            string message = ex.Message ?? "";
            if (Regex.IsMatch(message, "HTTP 401|HTTP 403")) return "API Key 无效或没有权限（401）";
            if (Regex.IsMatch(message, "HTTP 404")) return "接口地址不对（404），检查设置里的 Base URL";
            if (Regex.IsMatch(message, "HTTP 429")) return "请求太频繁或额度不足（429）";
            if (Regex.IsMatch(message, "HTTP 5\\d\\d")) return "模型服务暂时不可用";
            if (Regex.IsMatch(message, "超时|timed out|timeout|操作已超时")) return "请求超时了，检查网络";
            return message;
        }

        static bool HasFlag(string[] args, string flag)
        {
            if (args == null) return false;
            foreach (string a in args) { if (string.Equals(a, flag, StringComparison.OrdinalIgnoreCase)) return true; }
            return false;
        }

        static string SafeMessage(Exception ex)
        {
            try { return ex.Message; }
            catch { return "(message unavailable)"; }
        }

        static void SelfTest()
        {
            string trace = Path.Combine(Path.GetTempPath(), "daodu-selftest.txt");
            Action<string> mark = delegate(string m)
            {
                try { File.AppendAllText(trace, m + "\n", Encoding.UTF8); } catch { }
            };
            try { File.WriteAllText(trace, "", Encoding.UTF8); } catch { }

            mark("1 config path");
            var sb = new StringBuilder();
            sb.AppendLine("config: " + Settings.FilePath);
            sb.AppendLine("model: " + Settings.Current.Model);

            mark("2 endpoint");
            sb.AppendLine("endpoint: " + Settings.Endpoint(Settings.Current.BaseUrl));
            sb.AppendLine("prompt chars: " + Prompt.System.Length);

            mark("3a extract start");
            string canned = "{\"choices\":[{\"message\":{\"content\":\"MODE: word\\n音标: /x/\\n释义: 测试\"}}]}";
            try
            {
                mark("3b deserialize");
                var probe = Json.Deserialize<Dictionary<string, object>>(canned);
                mark("3c deserialized: " + (probe == null ? "null" : probe.Count.ToString()));
                string parsed = ExtractAnswer(canned);
                mark("3d parsed");
                sb.AppendLine("parse: [" + parsed.Replace("\n", " | ") + "]");
            }
            catch (Exception e1)
            {
                mark("3x " + e1.GetType().FullName + " :: " + SafeMessage(e1));
                throw;
            }
            sb.AppendLine("friendly401: " + Friendly(new Exception("HTTP 401: bad")));

            mark("4 card");
            var w = new CardWindow();
            w.Render("Transformer", "MODE: word\nEST", CardState.Loading);
            sb.AppendLine("card built ok");

            mark("5 store");
            try
            {
                Store.AddVocab("Transformer", "译文: 测试\n术语: 测试 —— 一句话", "sentence", "selftest.pdf");
                string csv = Store.Csv();
                sb.AppendLine("csv BOM=" + csv.StartsWith("\uFEFF") + " rows=" + Store.VocabCount());
                sb.AppendLine("csv header ok=" + csv.Contains("\"词\",\"类型\""));
                sb.AppendLine("cache key stable=" + (Store.CacheKey("a", "b", "auto") == Store.CacheKey("a", "b", "auto")));
                sb.AppendLine("mode guess=" + ModeOf("译文: x") + "/" + ModeOf("音标: y") + "/" + ModeOf("一句话: z"));
            }
            catch (Exception e3)
            {
                sb.AppendLine("store error: " + SafeMessage(e3));
            }

            mark("5 dump");
            string text = sb.ToString();
            Console.WriteLine(text);
            File.WriteAllText(trace, text + "SELFTEST OK\n", Encoding.UTF8);
            Console.WriteLine("SELFTEST OK");
        }

        /// <summary>单独验证 UI Automation 能不能读到当前焦点控件里的选区</summary>
        static void UiaProbe()
        {
            var sb = new StringBuilder();
            try
            {
                string t, c;
                bool ok = Uia.TryGetSelection(out t, out c);
                sb.AppendLine("ok=" + ok);
                sb.AppendLine("title=" + Uia.ForegroundTitle());
                sb.AppendLine("text.len=" + t.Length);
                sb.AppendLine("text=" + (t.Length > 100 ? t.Substring(0, 100) : t));
                sb.AppendLine("context.len=" + c.Length);
                sb.AppendLine("context=" + (c.Length > 160 ? c.Substring(0, 160) : c));
            }
            catch (Exception ex)
            {
                sb.AppendLine("ERROR " + ex.GetType().FullName + " :: " + SafeMessage(ex));
            }
            File.WriteAllText(Path.Combine(Path.GetTempPath(), "daodu-uia.txt"), sb.ToString(), Encoding.UTF8);
        }
    }
}
