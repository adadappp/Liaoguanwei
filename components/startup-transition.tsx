"use client";

import { useEffect, useRef, useState } from "react";

const bookOutline = "M300 100C220 51 120 45 30 75V330C120 300 220 311 300 360C380 311 480 300 570 330V75C480 45 380 51 300 100Z";

export function StartupTransition() {
  const sweep = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const [completedCycle, setCompletedCycle] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const ready = hydrated && completedCycle;
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { if (preference.matches) setCompletedCycle(true); };
    sync(); setHydrated(true);
    // CSS 在 JS 下载期间已开始播放；接管较晚时不能再等下一轮事件。
    const animation = sweep.current?.getAnimations()[0];
    const elapsed = animation?.currentTime;
    const duration = animation?.effect?.getComputedTiming().duration;
    if (typeof elapsed === "number" && typeof duration === "number" && duration > 0 && elapsed >= duration) setCompletedCycle(true);
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!ready || dismissed) return;
    // 动画事件丢失或被系统减少动态效果关闭时，也能可靠退出。
    const timer = setTimeout(() => setDismissed(true), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450);
    return () => clearTimeout(timer);
  }, [ready, dismissed]);
  useEffect(() => {
    if (dismissed) window.dispatchEvent(new Event("atlas:startup-complete"));
  }, [dismissed]);
  if (dismissed) return null;
  return <div className="atlas-startup" data-ready={ready} aria-hidden="true"
    onAnimationEnd={event => {
      if (event.target === event.currentTarget && (event.animationName === "startup-out" || event.animationName === "startup-safety")) setDismissed(true);
    }}>
    <div className="atlas-startup-book">
    <svg className="startup-book-static" viewBox="0 0 600 420" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="startup-book-shadow"><path d={bookOutline}/><path d="M300 100V360"/></g>
      <g className="startup-book-outline"><path d={bookOutline}/><path d="M300 100V360"/></g>
    </svg>
    <div className="startup-book-glint-mask"><div ref={sweep} className="startup-book-rotor" onAnimationIteration={() => setCompletedCycle(true)} /></div>
    <div className="startup-book-spine-mask"><div className="startup-book-spine" /></div>
    </div>
  </div>;
}
