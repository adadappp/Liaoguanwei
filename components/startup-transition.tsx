"use client";

import { useEffect, useState } from "react";


export function StartupTransition() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    // 等待首页完成挂载并有机会绘制，不等待网络空闲，也不增加最短展示时间。
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, []);
  if (dismissed) return null;
  return <div className="atlas-startup" data-ready={ready} aria-hidden="true"
    onAnimationEnd={event => {
      if (event.target === event.currentTarget && (event.animationName === "startup-out" || event.animationName === "startup-safety")) setDismissed(true);
    }}>
    <div className="atlas-startup-content">
      <div className="atlas-startup-mark"><svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1Z"/><path d="M12 7v13"/></svg></div>
      <div className="atlas-startup-track" />
    </div>
  </div>;
}
