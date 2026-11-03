"use client";

import { useEffect, useRef, useState } from "react";

const bookOutline = "M300 100C220 51 120 45 30 75V330C120 300 220 311 300 360C380 311 480 300 570 330V75C480 45 380 51 300 100Z";

export function StartupTransition() {
  const sweep = useRef<SVGPathElement>(null);
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
  if (dismissed) return null;
  return <div className="atlas-startup" data-ready={ready} aria-hidden="true"
    onAnimationEnd={event => {
      if (event.target === event.currentTarget && (event.animationName === "startup-out" || event.animationName === "startup-safety")) setDismissed(true);
    }}>
    <svg className="atlas-startup-book" viewBox="0 0 600 420" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g className="startup-book-shadow"><path d={bookOutline}/><path d="M300 100V360"/></g>
      <g className="startup-book-outline"><path d={bookOutline}/><path d="M300 100V360"/></g>
      <g className="startup-book-light">
        <path ref={sweep} className="startup-book-sweep" d={bookOutline} pathLength="100"
          onAnimationIteration={() => setCompletedCycle(true)} />
        <path className="startup-book-spine" d="M300 100V360" pathLength="100"/>
      </g>
    </svg>
  </div>;
}
