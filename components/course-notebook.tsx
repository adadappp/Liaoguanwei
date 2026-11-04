"use client";

import { useState } from "react";
import { ArrowLeft, BookOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { Plan } from "@/lib/atlas";

type Props = { plans: Plan[]; plan?: Plan; initialCourseId: string; saveState: string; onPlanChange: (id: string) => void; onCourseNotesChange: (id: string, notes: string) => void; onLegacyNotesChange: (notes: string) => void; onBack: () => void };

export function CourseNotebook({ plans, plan, initialCourseId, saveState, onPlanChange, onCourseNotesChange, onLegacyNotesChange, onBack }: Props) {
  const [selected, setSelected] = useState(initialCourseId && plan?.tasks.some(t => t.id === initialCourseId) ? initialCourseId : plan?.tasks[0]?.id || "legacy");
  const task = plan?.tasks.find(t => t.id === selected);
  const legacy = selected === "legacy" && !!plan?.notes;
  const notes = task?.notes || (legacy ? plan?.notes || "" : "");
  return <div className="notebook-page content-width page-enter">
    <button className="notebook-back" onClick={onBack}><ArrowLeft size={15} />返回学习计划</button>
    <div className="page-heading"><div><div className="eyebrow muted">按课程记录</div><h1>学习笔记</h1></div>{plan && <div className="notebook-plan-select"><label className="sr-only" htmlFor="notebook-plan">笔记所属计划</label><Select value={plan.id} onValueChange={onPlanChange}><SelectTrigger id="notebook-plan" className="plan-select-trigger"><SelectValue /></SelectTrigger><SelectContent position="popper" className="plan-select-menu">{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.title || "未命名计划"}</SelectItem>)}</SelectContent></Select></div>}</div>
    {!plan || (!plan.tasks.length && !plan.notes) ? <div className="notebook-empty"><BookOpen size={32} strokeWidth={1.3} /><h2>先选一门想学的课程</h2><Button className="primary-button" onClick={onBack}>去添加课程</Button></div> : <div className="notebook-layout"><aside className="notebook-courses" aria-label="笔记课程"><div className="sidebar-label">我的课程</div>{plan.tasks.map(t => <button key={t.id} aria-pressed={selected === t.id} className={selected === t.id ? "active" : ""} onClick={() => setSelected(t.id)}><BookOpen size={16} /><span>{t.name || "未命名课程"}</span>{!!t.notes && <i aria-label="已有笔记" />}</button>)}{!!plan.notes && <button className={legacy ? "active" : ""} aria-pressed={legacy} onClick={() => setSelected("legacy")}><FileText size={16} /><span>原计划笔记</span></button>}</aside>
      <section className="notebook-editor" aria-label={task ? `${task.name}的笔记` : "原计划笔记"}><div className="notebook-editor-heading"><div><BookOpen size={20} strokeWidth={1.5} /><h2>{task?.name || (legacy ? "原计划笔记" : "选择课程")}</h2></div><span role="status">{saveState}</span></div>{(task || legacy) && <><label className="sr-only" htmlFor="course-notes">{task?.name || "原计划"}笔记</label><textarea id="course-notes" key={selected} maxLength={30000} placeholder="记下概念、例题、实践过程，或留一个下次想解决的问题……" value={notes} onChange={e => task ? onCourseNotesChange(task.id, e.target.value) : onLegacyNotesChange(e.target.value)} /><div className="notebook-word-count">{notes.length.toLocaleString()} / 30,000 字</div></>}</section>
    </div>}
  </div>;
}
