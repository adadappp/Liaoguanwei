import { ArrowUpRight, BookOpen, Check, ChevronRight, FileText, Layers3, Search } from "lucide-react";

export function AtlasPreview({ onOpen }: { onOpen: () => void }) {
  return <section className="product-showcase" aria-labelledby="showcase-title">
    <div className="showcase-heading" data-reveal="visible"><span className="eyebrow muted">LESS GUESSWORK. MORE DIRECTION.</span><h2 id="showcase-title">看清要求。<br /><span>再决定，下一步。</span></h2><p>把分散的岗位信息，变成一份属于你的学习清单。</p></div>
    <button type="button" className="showcase-stage" data-reveal="visible" onClick={onOpen} aria-label="打开演示技能图鉴，体验完整流程">
      <div className="showcase-ambient" aria-hidden="true" />
      <div className="showcase-device" aria-hidden="true">
        <div className="preview-toolbar"><span className="window-dots"><i /><i /><i /></span><span><BookOpen size={12} />求职学习图鉴</span><span className="preview-demo">功能演示</span></div>
        <div className="preview-workspace"><div className="preview-sidebar"><span className="preview-brand"><BookOpen size={17} /></span><span className="preview-nav selected"><Layers3 size={13} />岗位技能</span><span className="preview-nav"><FileText size={13} />学习计划</span><span className="preview-side-line" /></div>
          <div className="preview-content"><span className="preview-overline">你的技能地图</span><span className="preview-role">AI 应用开发工程师</span><span className="preview-description">了解岗位要求，自主选择学习内容。</span><span className="preview-search"><Search size={12} />发现你想学习的技能</span>
            {[{name:"Python",detail:"编程基础",selected:true},{name:"RAG 检索增强生成",detail:"AI 与模型",selected:true},{name:"后端接口开发",detail:"工程实践",selected:false}].map(s => <span className="preview-skill" key={s.name}><span className={s.selected ? "preview-check checked" : "preview-check"}>{s.selected && <Check size={9} />}</span><span><strong>{s.name}</strong><small>{s.detail}</small></span><span className="preview-source">查看依据<ChevronRight size={9} /></span></span>)}
          </div>
          <div className="preview-plan"><span className="preview-plan-icon"><BookOpen size={19} /></span><span className="preview-overline">由你决定</span><strong>你的学习计划</strong><span className="preview-plan-description">把想学的留下。<br />按自己的节奏，开始。</span><span className="preview-plan-task"><span className="preview-task-dot" />Python 基础练习</span><span className="preview-plan-task"><span className="preview-task-dot" />搭建知识库应用</span><span className="preview-plan-cta">加入学习计划<ArrowUpRight size={11} /></span></div>
        </div>
      </div>
      <span className="showcase-open">体验完整图鉴<span><ArrowUpRight size={17} /></span></span>
    </button>
    <p className="showcase-caption" data-reveal="visible">功能预览 · 演示内容，不代表真实招聘结论</p>
  </section>;
}
