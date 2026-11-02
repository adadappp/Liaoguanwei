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
      const head = points[points.length - 1];
      const strength = Math.max(0, 1 - (now - head.time) / LIFETIME);
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (points.length > 1) {
        const tail = points[0];
        const path = new Path2D();
        path.moveTo(tail.x, tail.y);
        // 通过相邻采样点的中点连接二次曲线，消除折线接缝。
        for (let i = 1; i < points.length; i++) {
          const previous = points[i - 1], current = points[i];
          path.quadraticCurveTo(previous.x, previous.y, (previous.x + current.x) / 2, (previous.y + current.y) / 2);
        }
        path.lineTo(head.x, head.y);
        for (const layer of [
          { width: 11, opacity: 0.14, blur: 4.5, halo: 18 },
          { width: 6, opacity: 0.3, blur: 2, halo: 10 },
          { width: 3.2, opacity: 0.66, blur: 0.7, halo: 3 },
        ]) {
          const gradient = Math.hypot(head.x - tail.x, head.y - tail.y) < 1
            ? ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, MAX_LENGTH)
            : ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
          gradient.addColorStop(0, "rgba(255,255,255,0)");
          gradient.addColorStop(0.35, `rgba(255,255,255,${strength * layer.opacity * 0.25})`);
          gradient.addColorStop(1, `rgba(255,255,255,${strength * layer.opacity})`);
          ctx.strokeStyle = gradient; ctx.lineWidth = layer.width;
          ctx.filter = `blur(${layer.blur}px)`;
          ctx.shadowColor = `rgba(255,255,255,${strength * layer.opacity})`;
          ctx.shadowBlur = layer.halo;
          ctx.stroke(path);
        }
      }
      ctx.shadowBlur = 0; ctx.filter = "blur(0.7px)";
      const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 12);
      glow.addColorStop(0, `rgba(255,255,255,${strength * 0.55})`);
      glow.addColorStop(0.18, `rgba(255,255,255,${strength * 0.3})`);
      glow.addColorStop(0.55, `rgba(255,255,255,${strength * 0.08})`);
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow; ctx.fillRect(head.x - 12, head.y - 12, 24, 24);
      ctx.restore();
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
