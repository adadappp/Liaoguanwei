"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Download, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const syncDisplay = () => setStandalone(display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const installed = () => { setStandalone(true); setPrompt(null); setInstructions(false); };
    setUrl(window.location.origin + "/"); syncDisplay();
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed); display.addEventListener("change", syncDisplay);
    return () => { window.removeEventListener("beforeinstallprompt", available); window.removeEventListener("appinstalled", installed); display.removeEventListener("change", syncDisplay); };
  }, []);
  async function install() {
    if (!prompt) { setCopied(false); setInstructions(true); return; }
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setStandalone(true);
    } catch { setInstructions(true); }
    finally { setPrompt(null); setInstalling(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { setCopied(false); document.getElementById("install-app-url")?.focus(); }
  }
  if (standalone) return null;
  return <>
    <button type="button" className="install-app-link" disabled={installing} onClick={install}><Monitor size={14} /><span>{installing ? "正在打开安装窗口…" : "安装桌面版"}</span><Download size={12} /></button>
    <Dialog open={instructions} onOpenChange={setInstructions}><DialogContent className="atlas-dialog install-dialog"><DialogHeader><span className="install-dialog-icon"><Monitor size={25} /></span><DialogTitle>像软件一样，打开图鉴</DialogTitle><DialogDescription>安装后可从开始菜单或桌面图标打开，使用独立窗口。</DialogDescription></DialogHeader>
      <ol className="install-steps"><li><span>1</span><p>在电脑的 <strong>Microsoft Edge</strong> 中打开下面的网址。</p></li><li><span>2</span><p>点击右上角 <strong>⋯</strong>，选择 <strong>更多工具 → 应用 → 将此站点安装为应用</strong>。也可使用地址栏的安装图标。</p></li><li><span>3</span><p>确认安装后，即可从开始菜单打开；安装提示中可选择创建桌面快捷方式。</p></li></ol>
      <div className="install-url"><input id="install-app-url" aria-label="应用网址" value={url} readOnly onFocus={event => event.target.select()} /><Button type="button" variant="outline" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "已复制" : "复制网址"}</Button></div>
      <p className="install-note">安装后仍需联网。已有学习计划可先导出备份，再在桌面版导入；同一 Edge 配置下的数据由该浏览器保存。</p>
    </DialogContent></Dialog>
  </>;
}
