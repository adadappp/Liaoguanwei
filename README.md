# 导读 · 桌面划词

在 **WPS、Adobe Reader、Zotero、知网阅读器**这些浏览器之外的软件里，选中一个词或一句话，按 `Ctrl+Shift+Q`，卡片在鼠标旁边弹出来。

和浏览器扩展是两套东西，但共用同一套提示词和 `MODE:` 协议。

## 启动

**双击 `daodu.exe`。**

- 不会弹窗口，只在任务栏右下角托盘里出现一个图标
- 第一次用：**右键托盘图标 → 设置**，填 API Key（和扩展里那个一样，但要各填一次）
- 之后随时：选中文字 → `Ctrl+Shift+Q`

## 用法

1. 在 WPS 里**选中一整句**（别只选一个词——整句能同时给你译文和难词解释）
2. 按 `Ctrl+Shift+Q`
3. 卡片出现在鼠标旁边
4. `Esc` 或点 × 关闭；点「复制」把结果拷走

**为什么建议选整句**：多数桌面软件（包括 WPS）不让程序读取段落，程序只能看到你选中的那一小段。选整句，模型就能据此给出「译文 + 句中难词解释」。

**注意**：优先用 UI Automation 直接读选区，不碰剪贴板；读不到时才回退到模拟 Ctrl+C，那时会短暂占用剪贴板。真读到上下文时，卡片右下角会标「已带上下文」。

## 第一次运行的两个拦截

这个 exe 没有数字签名，Windows 和杀毒软件都会多看一眼：

- **SmartScreen**：「Windows 已保护你的电脑」→ 点「更多信息」→「仍要运行」
- **360 / 火绒**：可能提示「未知程序」→ 选「允许」并加入信任区

如果 360 直接删了，去「恢复区」恢复，再把本文件夹加入信任目录。

> 上一版用的是 `start.cmd` + PowerShell，被杀软按 `TrojanDownloader/PS.NetLoader` 特征直接删了——那是误报，但解释不清，所以改成了 exe。

## 术语表

查过的词会自动记下来（`%APPDATA%\daodu\vocab.json`），只存在本地。

- 右键托盘 → **导出术语表…**，存成 CSV。第一列是论文，同一篇的术语连在一起；带 BOM，Excel 和 Anki 都能直接打开
- **按论文分组**：窗口标题去掉「- WPS Office」这类后缀当论文名，CSV 第一列就是它
- 同一个词在同一篇论文里只留一条，累计查过几次
- 读一篇论文查了十几个术语，导出来就是一张表

另外有个**缓存**：同一个词、同一个文档，48 小时内再查不会重复请求，秒出也不花钱。命中的卡片右下角标「缓存」。

## 设置

配置存在 `%APPDATA%\daodu\config.json`：

```json
{
  "apiKey": "sk-...",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-flash",
  "hotkey": "Ctrl+Shift+Q"
}
```

改热键：右键托盘 → 设置 → 热键，保存即生效。也可以在 `config.json` 里改 `hotkey`。

如果填的组合已被别的程序占用，启动时会自动依次尝试 `Ctrl+Shift+Q`、`Ctrl+Alt+Q`、`Ctrl+Shift+F9` 等备用组合，并用托盘气泡告诉你实际用的是哪个。

## 开机自启

`Win+R` → `shell:startup` → 把 `daodu.exe` 的快捷方式拖进去。

## 排错

| 现象 | 处理 |
|---|---|
| 托盘没图标 | 进程没起来，看事件查看器，或重新双击 |
| 热键没反应 | 配置的组合被别的软件占了时，程序会自动换一个能用的并在托盘气泡里告诉你；也可以右键托盘 →「查当前选中文字」 |
| 卡片右下角没有「已带上下文」 | 正常。多数桌面软件不让读段落，按「选中整句」用就行 |
| 卡片一直「正在查…」 | 网络不通 / Key 没保存上 |
| 提示「基础连接已经关闭」 | 网络或代理问题，本程序走系统代理 |

## 源码与重新编译

`src\Daodu.cs` 是全部源码（单文件，约 900 行），`src\app.manifest` 管高分屏适配。

用 Windows 自带的 C# 编译器重新编译，**不需要装 .NET SDK**：

```bat
csc /nologo /target:winexe /platform:anycpu /optimize+ /langversion:5 ^
    /out:daodu.exe /win32icon:src\app.ico /win32manifest:src\app.manifest ^
    /r:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationFramework.dll" ^
    /r:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\PresentationCore.dll" ^
    /r:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF\WindowsBase.dll" ^
    /r:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Xaml.dll" ^
    /r:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Windows.Forms.dll" ^
    /r:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Drawing.dll" ^
    /r:"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\System.Web.Extensions.dll" ^
    src\Daodu.cs
```

自检：

```bat
daodu.exe --selftest     :: 写 %TEMP%\daodu-selftest.txt
daodu.exe --smoketest    :: 完整启动 1.2 秒后自动退出，写 %TEMP%\daodu-smoke.txt
```

## 已知限制

- **不是流式**：先「正在查…」，拿到完整结果后一次性出现。浏览器扩展那边是逐字长出来的。
- 没有页面上下文，所以 `term` 模式里「在这个语境里」那一段会弱一些。
- 只支持 Windows（.NET Framework 4.5+，Win10/11 自带）。
- 退出要用托盘菜单，没有主窗口可关。
