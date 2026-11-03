"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Check, ChevronRight, FileText, Layers3, Pause, Play, Search } from "lucide-react";

const HOLD_MS = 3000;
const SLIDE_MS = 900;
const careers = [
  { role: "AI 应用开发工程师", skills: [["Python", "编程基础"], ["RAG 检索增强生成", "AI 与模型"], ["后端接口开发", "工程实践"]], tasks: ["Python 基础练习", "搭建知识库应用"] },
  { role: "前端开发工程师", skills: [["TypeScript", "编程基础"], ["React", "工程实践"], ["交互与性能优化", "工程实践"]], tasks: ["练习 React 组件", "完成交互页面"] },
  { role: "Java 后端工程师", skills: [["Java", "编程基础"], ["Spring Boot", "工程实践"], ["MySQL", "工程实践"]], tasks: ["编写 REST 接口", "练习数据库设计"] },
  { role: "数据工程师", skills: [["SQL", "编程基础"], ["数据仓库", "工程实践"], ["数据质量校验", "工程实践"]], tasks: ["练习 SQL 查询", "搭建数据处理流程"] },
  { role: "机器学习工程师", skills: [["PyTorch", "AI 与模型"], ["模型训练与评估", "AI 与模型"], ["实验与版本管理", "工程实践"]], tasks: ["训练一个小模型", "记录与比较实验"] },
];

export function AtlasPreview({ onOpen }: { onOpen: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [slide, setSlide] = useState({ current: 0, previous: null as number | null, sequence: 0 });
  const [visible, setVisible] = useState(false), [pageVisible, setPageVisible] = useState(true);
  const [paused, setPaused] = useState(false), [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updatePage = () => setPageVisible(!document.hidden);
    updateMotion(); updatePage();
    media.addEventListener("change", updateMotion); document.addEventListener("visibilitychange", updatePage);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.25), { threshold: 0.25 });
    const target = root.current?.querySelector(".preview-carousel-viewport");
    if (target && observer) observer.observe(target); else setVisible(true);
    return () => { observer?.disconnect(); media.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", updatePage); };
  }, []);
  function select(index: number) {
    setSlide(old => index === old.current ? old : { current: index, previous: reducedMotion ? null : old.current, sequence: old.sequence + 1 });
  }
  useEffect(() => {
    if (slide.previous === null) return;
    if (reducedMotion) { setSlide(old => ({ ...old, previous: null })); return; }
    const timer = setTimeout(() => setSlide(old => ({ ...old, previous: null })), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [slide.sequence, slide.previous, reducedMotion]);
  useEffect(() => {
    if (!visible || !pageVisible || paused || reducedMotion || slide.previous !== null) return;
    // 切换结束后再完整停留3秒，切换动画的900ms不占阅读时间。
    const timer = setTimeout(() => setSlide(old => ({ current: (old.current + 1) % careers.length, previous: old.current, sequence: old.sequence + 1 })), HOLD_MS);
    return () => clearTimeout(timer);
  }, [visible, pageVisible, paused, reducedMotion, slide.current, slide.previous, slide.sequence]);
  return <section ref={root} className="product-showcase" aria-labelledby="showcase-title">
    <div className="showcase-heading" data-reveal="visible"><span className="eyebrow muted">LESS GUESSWORK. MORE DIRECTION.</span><h2 id="showcase-title">看清要求。<br /><span>再决定，下一步。</span></h2><p>把分散的岗位信息，变成一份属于你的学习清单。</p></div>
    <button type="button" className="showcase-stage" data-reveal="visible" onClick={onOpen} aria-label="打开演示技能图鉴，体验完整流程">
      <div className="showcase-ambient" aria-hidden="true" />
      <div className="preview-carousel-viewport" aria-hidden="true">
        {slide.previous !== null && <div key={`out-${slide.sequence}`} className="preview-carousel-slide is-leaving"><PreviewCard career={careers[slide.previous]} /></div>}
        <div key={`in-${slide.sequence}`} className={`preview-carousel-slide${slide.previous !== null ? " is-entering" : ""}`}><PreviewCard career={careers[slide.current]} /></div>
      </div>
      <span className="showcase-open">体验完整图鉴<span><ArrowUpRight size={17} /></span></span>
    </button>
    <div className="preview-carousel-controls" role="group" aria-label="职业预览轮播">
      <div className="preview-carousel-dots">{careers.map((career, index) => <button key={career.role} type="button" aria-label={`查看${career.role}预览`} aria-pressed={slide.current === index} className={slide.current === index ? "is-current" : ""} onClick={() => select(index)}><span /></button>)}</div>
      <span className="preview-carousel-label" aria-live="off">{careers[slide.current].role}</span>
      <button type="button" className="preview-carousel-pause" aria-label={paused || reducedMotion ? "播放职业轮播" : "暂停职业轮播"} disabled={reducedMotion} onClick={() => setPaused(value => !value)}>{paused || reducedMotion ? <Play size={12} /> : <Pause size={12} />}</button>
    </div>
    <p className="showcase-caption" data-reveal="visible">功能预览 · 演示内容，不代表真实招聘结论</p>
  </section>;
}

function PreviewCard({ career }: { career: typeof careers[number] }) {
  return <div className="showcase-device">
        <div className="preview-toolbar"><span className="window-dots"><i /><i /><i /></span><span><BookOpen size={12} />求职学习图鉴</span><span className="preview-demo">功能演示</span></div>
        <div className="preview-workspace"><div className="preview-sidebar"><span className="preview-brand"><BookOpen size={17} /></span><span className="preview-nav selected"><Layers3 size={13} />岗位技能</span><span className="preview-nav"><FileText size={13} />学习计划</span><span className="preview-side-line" /></div>
          <div className="preview-content"><span className="preview-overline">你的技能地图</span><span className="preview-role">{career.role}</span><span className="preview-description">了解岗位要求，自主选择学习内容。</span><span className="preview-search"><Search size={12} />发现你想学习的技能</span>
            {career.skills.map(([name, detail], index) => <span className="preview-skill" key={name}><span className={index < 2 ? "preview-check checked" : "preview-check"}>{index < 2 && <Check size={9} />}</span><span><strong>{name}</strong><small>{detail}</small></span><span className="preview-source">查看依据<ChevronRight size={9} /></span></span>)}
          </div>
          <div className="preview-plan"><span className="preview-plan-icon"><BookOpen size={19} /></span><span className="preview-overline">由你决定</span><strong>你的学习计划</strong><span className="preview-plan-description">把想学的留下。<br />按自己的节奏，开始。</span>{career.tasks.map(task => <span className="preview-plan-task" key={task}><span className="preview-task-dot" />{task}</span>)}<span className="preview-plan-cta">加入学习计划<ArrowUpRight size={11} /></span></div>
        </div>
      </div>;
}
