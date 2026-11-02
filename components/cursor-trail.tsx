"use client";
import { useEffect, useRef } from "react";

type Point = { x: number; y: number; time: number };
const LIFETIME = 170;
const MAX_LENGTH = 62;

/** 短距离白色荧光，仅在鼠标移动及淡出期间绘制，闲置时停止动画帧。 */
export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const ctx = context;
    const surface = canvas;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let points: Point[] = [];
    let frame = 0, width = 0, height = 0, enabled = false;

    function clear() {
      cancelAnimationFrame(frame); frame = 0; points = [];
      ctx.clearRect(0, 0, width, height);
    }
    function resize() {
      clear();
      if (!enabled) return;
      width = window.innerWidth; height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.round(width * ratio); surface.height = Math.round(height * ratio);
      surface.style.width = `${width}px`; surface.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function configure() {
      enabled = finePointer.matches && !reducedMotion.matches;
      resize();
    }
    function draw(now: number) {
      frame = 0;
      ctx.clearRect(0, 0, width, height);
      points = points.filter(point => now - point.time < LIFETIME);
      if (!enabled || !points.length) return;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (let i = 1; i < points.length; i++) {
        const from = points[i - 1], to = points[i];
        const freshness = Math.max(0, 1 - (now - to.time) / LIFETIME);
        const taper = i / Math.max(points.length - 1, 1);
        const opacity = freshness * taper * 0.56;
        ctx.strokeStyle = `rgba(245,248,255,${opacity})`;
        ctx.lineWidth = 0.5 + taper * 1.1;
        ctx.shadowColor = `rgba(255,255,255,${opacity * 0.8})`; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      }
      const head = points[points.length - 1];
      const strength = Math.max(0, 1 - (now - head.time) / LIFETIME);
      ctx.shadowBlur = 0;
      const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 6);
      glow.addColorStop(0, `rgba(255,255,255,${strength * 0.48})`);
      glow.addColorStop(0.3, `rgba(245,248,255,${strength * 0.18})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow; ctx.fillRect(head.x - 6, head.y - 6, 12, 12);
      frame = requestAnimationFrame(draw);
    }
    function move(event: PointerEvent) {
      if (!enabled || event.pointerType !== "mouse" || document.hidden) return;
      const now = performance.now();
      if (points.length && now - points[points.length - 1].time > 85) points = [];
      points.push({ x: event.clientX, y: event.clientY, time: now });
      // 即便快速移动或指针跳跃，尾迹总长度也不会超过 62 CSS 像素。
      let length = 0;
      for (let i = points.length - 2; i >= 0; i--) {
        const older = points[i], newer = points[i + 1];
        const distance = Math.hypot(newer.x - older.x, newer.y - older.y);
        if (length + distance > MAX_LENGTH) {
          const fraction = (MAX_LENGTH - length) / distance;
          points[i] = { x: newer.x + (older.x - newer.x) * fraction, y: newer.y + (older.y - newer.y) * fraction, time: newer.time + (older.time - newer.time) * fraction };
          points = points.slice(i); break;
        }
        length += distance;
      }
      if (points.length > 48) points = points.slice(-48);
      if (!frame) frame = requestAnimationFrame(draw);
    }
    function leave(event: PointerEvent) { if (!event.relatedTarget) clear(); }
    function visibility() { if (document.hidden) clear(); }
    configure();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("blur", clear);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    finePointer.addEventListener("change", configure); reducedMotion.addEventListener("change", configure);
    return () => {
      clear();
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerout", leave);
      window.removeEventListener("blur", clear); window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      finePointer.removeEventListener("change", configure); reducedMotion.removeEventListener("change", configure);
    };
  }, []);
  return <canvas ref={canvasRef} className="cursor-trail" aria-hidden="true" />;
}
