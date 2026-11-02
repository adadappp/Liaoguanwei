"use client";
import { useEffect, useRef } from "react";

/** 只观察进入视口的节点，不监听逐帧滚动，也不接管用户滚动。 */
export function useAtlasMotion(view: string) {
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current, sentinel = topRef.current;
    if (!root || !sentinel || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => { root.dataset.scrolled = String(!entry.isIntersecting); });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
    let observer: IntersectionObserver | undefined;
    function configure() {
      observer?.disconnect();
      if (preference.matches) { root!.dataset.motion = "reduced"; targets.forEach(node => { node.dataset.reveal = "visible"; }); return; }
      root!.dataset.motion = "ready";
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.reveal = "visible";
          observer?.unobserve(entry.target);
        }
      }, { rootMargin: "0px 0px -28px 0px", threshold: 0.08 });
      for (const node of targets) {
        // 页面内查找、键盘聚焦及浏览器恢复滚动时，已在视口中的内容始终可见。
        if (node.getBoundingClientRect().top < window.innerHeight - 28) node.dataset.reveal = "visible";
        else { node.dataset.reveal = "waiting"; observer.observe(node); }
      }
    }
    configure(); preference.addEventListener("change", configure);
    return () => { observer?.disconnect(); preference.removeEventListener("change", configure); targets.forEach(node => { node.dataset.reveal = "visible"; }); };
  }, [view]);
  return { rootRef, topRef };
}
