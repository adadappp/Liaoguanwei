"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarDays, GripVertical, Plus, ArrowUpRight, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { type Task, type StudySession, uid } from "@/lib/atlas";
import { WEEKDAYS, TIME_OPTIONS, HOUR_HEIGHT, timeLabel, sessionProblem, placeSession, snappedStart, conflictingIds } from "@/lib/timetable";

type Props = { tasks: Task[]; onChange: (tasks: Task[]) => void; onNotice: (message: string) => void; onAddCourse: () => void };
type Draft = { taskId: string; sessionId?: string; day: number; startMinute: number; endMinute: number };
type Drag = { taskId: string; sessionId?: string; pointerId: number; originX: number; originY: number; x: number; y: number; offset: number; duration: number; active: boolean; target: { day: number; start: number } | null };
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeeklyTimetable({ tasks, onChange, onNotice, onAddCourse }: Props) {
  const [day, setDay] = useState((new Date().getDay() + 6) % 7);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [dragView, setDragView] = useState<Drag | null>(null);
  const [removed, setRemoved] = useState<{ taskId: string; session: StudySession } | null>(null);
  const [trayFilter, setTrayFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef({ tasks, onChange, onNotice });
  useEffect(() => { latest.current = { tasks, onChange, onNotice }; }, [tasks, onChange, onNotice]);
  const sessions = tasks.flatMap(task => (task.sessions || []).map(session => ({ task, session })));
  const conflicts = useMemo(() => conflictingIds(tasks), [tasks]);
  const totalMinutes = sessions.reduce((sum, { session }) => sum + session.endMinute - session.startMinute, 0);

  useEffect(() => {
    return () => { dragRef.current = null; };
  }, []);

  useEffect(() => {
    let frame = 0;
    let edgeSince = 0, edgeDirection = 0;
    function locate(d: Drag) {
      const element = document.elementFromPoint(d.x, d.y)?.closest<HTMLElement>("[data-timetable-day]");
      if (!element || !scrollRef.current?.contains(element)) return null;
      const rect = element.getBoundingClientRect();
      return { day: Number(element.dataset.timetableDay), start: snappedStart((d.y - rect.top) / HOUR_HEIGHT * 60 - d.offset, d.duration) };
    }
    function paint(d: Drag) { d.target = locate(d); setDragView({ ...d }); }
    function autoscroll() {
      const d = dragRef.current, scroll = scrollRef.current;
      if (!d?.active || !scroll) return;
      const rect = scroll.getBoundingClientRect();
      const inside = d.x >= rect.left && d.x <= rect.right;
      const direction = inside ? (d.y > window.innerHeight - 40 ? 1 : d.y < 112 ? -1 : 0) : 0;
      if (!direction) { edgeSince = 0; edgeDirection = 0; }
      else if (direction !== edgeDirection) { edgeDirection = direction; edgeSince = performance.now(); }
      else if (performance.now() - edgeSince > 400) { window.scrollBy(0, direction * 5); paint(d); }
      frame = requestAnimationFrame(autoscroll);
    }
    function move(event: PointerEvent) {
      const d = dragRef.current;
      if (!d || event.pointerId !== d.pointerId) return;
      d.x = event.clientX; d.y = event.clientY;
      if (!d.active && Math.hypot(d.x - d.originX, d.y - d.originY) < 6) return;
      if (!d.active) { d.active = true; frame = requestAnimationFrame(autoscroll); }
      event.preventDefault(); paint(d);
    }
    function cancel() { cancelAnimationFrame(frame); edgeSince = 0; edgeDirection = 0; dragRef.current = null; setDragView(null); }
    function up(event: PointerEvent) {
      const d = dragRef.current;
      if (!d || event.pointerId !== d.pointerId) return;
      if (d.active) {
        suppressClick.current = true;
        d.x = event.clientX; d.y = event.clientY;
        const target = locate(d), current = latest.current;
        if (target) {
          const session = { id: d.sessionId || uid(), day: target.day, startMinute: target.start, endMinute: target.start + d.duration };
          const problem = sessionProblem(current.tasks, d.taskId, session, d.sessionId);
          if (problem) current.onNotice(problem);
          else { current.onChange(placeSession(current.tasks, d.taskId, session, d.sessionId)); current.onNotice(`已${d.sessionId ? "移到" : "安排在"}${WEEKDAYS[target.day]} ${timeLabel(session.startMinute)}–${timeLabel(session.endMinute)}`); }
        } else current.onNotice("未放入课表，原安排保持不变。");
      }
      cancel();
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape" && dragRef.current) { suppressClick.current = true; cancel(); latest.current.onNotice("已取消拖动。"); } }
    function interrupted() { if (dragRef.current) { suppressClick.current = true; cancel(); } }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", interrupted);
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", interrupted);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", interrupted); window.removeEventListener("keydown", escape); window.removeEventListener("blur", interrupted); };
  }, []);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, task: Task, session?: StudySession) {
    if (event.button !== 0 || !event.isPrimary) return;
    suppressClick.current = false;
    const rect = event.currentTarget.closest(".tt-session")?.getBoundingClientRect();
    dragRef.current = { taskId: task.id, sessionId: session?.id, pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY, duration: session ? session.endMinute - session.startMinute : 60, offset: session && rect ? (event.clientY - rect.top) / HOUR_HEIGHT * 60 : 0, active: false, target: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function openEditor(taskId = tasks[0]?.id || "", session?: StudySession, at?: { day: number; start: number }) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!tasks.length) { onNotice("先添加一项学习内容，再安排时间。"); return; }
    setError("");
    setDraft({ taskId, sessionId: session?.id, day: session?.day ?? at?.day ?? day, startMinute: session?.startMinute ?? at?.start ?? 19 * 60, endMinute: session?.endMinute ?? Math.min(1440, (at?.start ?? 19 * 60) + 60) });
  }
  function save() {
    if (!draft) return;
    const session = { id: draft.sessionId || uid(), day: draft.day, startMinute: draft.startMinute, endMinute: draft.endMinute };
    const problem = sessionProblem(tasks, draft.taskId, session, draft.sessionId);
    if (problem) { setError(problem); return; }
    onChange(placeSession(tasks, draft.taskId, session, draft.sessionId)); setDay(draft.day); setDraft(null);
    onNotice(`已保存${WEEKDAYS[draft.day]} ${timeLabel(draft.startMinute)}–${timeLabel(draft.endMinute)}`);
  }
  function remove() {
    if (!draft?.sessionId) return;
    const task = tasks.find(t => t.id === draft.taskId), session = task?.sessions?.find(s => s.id === draft.sessionId);
    if (!task || !session) return;
    setRemoved({ taskId: task.id, session }); onChange(tasks.map(t => t.id === task.id ? { ...t, sessions: t.sessions?.filter(s => s.id !== session.id) } : t)); setDraft(null);
    onNotice("已取消这个课次，课程仍保留在学习清单。");
  }
  function undoRemove() {
    if (!removed) return;
    const problem = sessionProblem(tasks, removed.taskId, removed.session);
    if (problem) { onNotice(problem); return; }
    onChange(placeSession(tasks, removed.taskId, removed.session)); setRemoved(null); onNotice("课次已恢复。");
  }
  const preview = dragView?.target ? { id: dragView.sessionId || "preview", day: dragView.target.day, startMinute: dragView.target.start, endMinute: dragView.target.start + dragView.duration } : null;
  const previewProblem = preview && dragView ? sessionProblem(tasks, dragView.taskId, preview, dragView.sessionId) : null;
  const filteredTasks = tasks.filter(t => t.name.toLowerCase().includes(trayFilter.toLowerCase()));

  return <section className="weekly-timetable" aria-label="每周学习课表">
    <div className="tt-heading"><div><span className="tt-eyebrow"><CalendarDays size={14} />每周安排</span><h2>我的周课表</h2></div><Button className="primary-button tt-add" disabled={!tasks.length} onClick={() => openEditor()}><Plus size={15} />安排时间</Button></div>
    <div className="tt-summary"><span><strong>{sessions.length}</strong> 个课次</span><span><strong>{Number((totalMinutes / 60).toFixed(2))}</strong> 小时 / 周</span><span>{tasks.filter(t => !t.sessions?.length).length} 门课程待安排</span></div>
    <div className="tt-tray"><div className="tt-tray-heading"><span>课程清单</span><button type="button" onClick={onAddCourse}><Plus size={14} />添加课程</button></div>{tasks.length > 6 && <input className="tt-course-filter" aria-label="查找待排课程" placeholder="查找课程…" value={trayFilter} onChange={e => setTrayFilter(e.target.value)} />}
      <div className="tt-courses">{filteredTasks.map(task => <div className={`tt-course ${task.sessions?.length ? "is-scheduled" : ""}`} key={task.id}><button type="button" className="tt-grip" aria-label={`拖动排课 ${task.name || "未命名课程"}`} title="拖动排课；点击设置时间" onPointerDown={e => beginDrag(e, task)} onClick={() => openEditor(task.id)}><GripVertical size={16} /></button><button type="button" className="tt-course-name" onClick={() => openEditor(task.id)}><span>{task.name || "未命名课程"}</span><small>{task.sessions?.length ? `${task.sessions.length}课次` : "待安排"}</small></button></div>)}{!tasks.length && <p className="tt-tray-empty">先添加课程，或从岗位图鉴挑选想学的技能。</p>}{tasks.length > 0 && !filteredTasks.length && <p className="tt-tray-empty">没有匹配的课程。</p>}</div>
    </div>
    <div className="tt-mobile-days" role="group" aria-label="查看星期">{WEEKDAYS.map((label, i) => <button type="button" key={label} aria-pressed={day === i} className={day === i ? "active" : ""} onClick={() => setDay(i)}>{label}<span>{sessions.filter(s => s.session.day === i).length || "·"}</span></button>)}</div>
    {conflicts.size > 0 && <p className="tt-conflict-note" role="alert">有 {conflicts.size} 个课次时间重叠，点击标记课程调整；原资料已保留。</p>}
    <div className={`tt-scroll ${dragView ? "is-dragging" : ""}`} ref={scrollRef} aria-label="全天周课表">
      <div className="tt-grid-header"><div>时间</div>{WEEKDAYS.map((label, i) => <div key={label} className={day === i ? "tt-day-heading is-current" : "tt-day-heading"} data-selected={day === i}>{label}<small>{sessions.filter(s => s.session.day === i).length} 课次</small></div>)}</div>
      <div className="tt-grid-body"><div className="tt-time-axis">{HOURS.map(h => <span key={h} style={{ top: h * HOUR_HEIGHT }}>{timeLabel(h * 60)}</span>)}<span className="tt-last-time" style={{ top: 24 * HOUR_HEIGHT }}>24:00</span></div>
        {WEEKDAYS.map((label, i) => <div key={label} className="tt-column" data-timetable-day={i} data-selected={day === i} style={{ height: HOUR_HEIGHT * 24 }}>
          {Array.from({ length: 48 }, (_, slot) => <button type="button" key={slot} className="tt-slot" aria-label={`在${label} ${timeLabel(slot * 30)}安排课程`} onClick={() => { suppressClick.current = false; openEditor(tasks[0]?.id, undefined, { day: i, start: slot * 30 }); }} />)}
          {sessions.filter(s => s.session.day === i).map(({ task, session }) => <div key={session.id} className={`tt-session ${conflicts.has(session.id) ? "has-conflict" : ""} ${dragView?.sessionId === session.id ? "is-moving" : ""} ${(session.endMinute - session.startMinute) < 60 ? "is-short" : ""}`} style={{ top: session.startMinute / 60 * HOUR_HEIGHT, height: (session.endMinute - session.startMinute) / 60 * HOUR_HEIGHT }}>
            <button type="button" className="tt-session-edit" aria-label={`编辑课次 ${task.name || "未命名课程"} ${label} ${timeLabel(session.startMinute)}–${timeLabel(session.endMinute)}`} title={`${task.name || "未命名课程"} · ${timeLabel(session.startMinute)}–${timeLabel(session.endMinute)}`} onClick={() => openEditor(task.id, session)}><strong>{task.name || "未命名课程"}</strong><span>{timeLabel(session.startMinute)}–{timeLabel(session.endMinute)}</span>{conflicts.has(session.id) && <small>时间重叠</small>}</button>
            <button type="button" className="tt-session-grip tt-grip" aria-label={`移动课次 ${task.name || "未命名课程"} ${label} ${timeLabel(session.startMinute)}`} title="拖动调整；点击编辑" onPointerDown={e => beginDrag(e, task, session)} onClick={() => openEditor(task.id, session)}><GripVertical size={13} /></button>
          </div>)}
          {preview?.day === i && <div className={`tt-drop-preview ${previewProblem ? "is-invalid" : ""}`} style={{ top: preview.startMinute / 60 * HOUR_HEIGHT, height: (preview.endMinute - preview.startMinute) / 60 * HOUR_HEIGHT }}><span>{timeLabel(preview.startMinute)}–{timeLabel(preview.endMinute)}</span><small>{previewProblem ? "时间不可用" : "松开排课"}</small></div>}
        </div>)}
      </div>
    </div>
    {removed && <div className="tt-bottom"><button type="button" onClick={undoRemove}><Undo2 size={14} />撤销取消排课</button></div>}
    {sessions.length > 0 && <details className="tt-agenda"><summary>查看全部 {sessions.length} 个课次</summary><div>{[...sessions].sort((a, b) => a.session.day - b.session.day || a.session.startMinute - b.session.startMinute).map(({ task, session }) => <button type="button" key={session.id} onClick={() => { suppressClick.current = false; openEditor(task.id, session); }}><span>{WEEKDAYS[session.day]} {timeLabel(session.startMinute)}–{timeLabel(session.endMinute)}</span><strong>{task.name || "未命名课程"}{conflicts.has(session.id) && <small>时间重叠</small>}</strong><ArrowUpRight size={14} /></button>)}</div></details>}
    {dragView && <div className="tt-drag-ghost" style={{ left: dragView.x + 16, top: dragView.y + 12 }} aria-hidden="true"><GripVertical size={14} /><span>{tasks.find(t => t.id === dragView.taskId)?.name || "学习课程"}</span><ArrowUpRight size={13} /></div>}
    <div className="sr-only" role="status" aria-live="polite">{preview ? `${WEEKDAYS[preview.day]} ${timeLabel(preview.startMinute)}，${previewProblem || "可以放置"}` : ""}</div>
    <Dialog open={!!draft} onOpenChange={open => { if (!open) { setDraft(null); setError(""); } }}><DialogContent className="atlas-dialog tt-dialog"><DialogHeader><DialogTitle>{draft?.sessionId ? "调整学习时间" : "留一段时间，开始学习"}</DialogTitle><DialogDescription>每周在这个时间学习。可随时调整或取消课次。</DialogDescription></DialogHeader>{draft && <form onSubmit={e => { e.preventDefault(); save(); }} className="tt-form">
      <div className="field-label"><label htmlFor="tt-course">课程</label><Select value={draft.taskId} onValueChange={taskId => { setDraft({ ...draft, taskId }); setError(""); }}><SelectTrigger id="tt-course" className="plan-select-trigger"><SelectValue /></SelectTrigger><SelectContent position="popper" className="plan-select-menu tt-select-menu">{tasks.map(task => <SelectItem key={task.id} value={task.id}>{task.name || "未命名课程"}</SelectItem>)}</SelectContent></Select></div>
      <fieldset className="tt-day-field"><legend>每周几</legend><div>{WEEKDAYS.map((label, i) => <button type="button" key={label} className={draft.day === i ? "active" : ""} aria-pressed={draft.day === i} onClick={() => { setDraft({ ...draft, day: i }); setError(""); }}>{label}</button>)}</div></fieldset>
      <div className="tt-time-fields">{(["startMinute", "endMinute"] as const).map(field => <div key={field} className="field-label"><label htmlFor={`tt-${field}`}>{field === "startMinute" ? "开始时间" : "结束时间"}</label><Select value={String(draft[field])} onValueChange={value => { setDraft({ ...draft, [field]: Number(value) }); setError(""); }}><SelectTrigger id={`tt-${field}`} className="plan-select-trigger"><SelectValue /></SelectTrigger><SelectContent position="popper" className="plan-select-menu tt-select-menu">{TIME_OPTIONS.filter(m => field === "startMinute" ? m < 1440 : m > 0).map(m => <SelectItem key={m} value={String(m)}>{timeLabel(m)}</SelectItem>)}</SelectContent></Select></div>)}</div>
      <p className="tt-duration">{draft.endMinute > draft.startMinute ? `每次 ${draft.endMinute - draft.startMinute} 分钟` : "结束时间需要晚于开始时间"} · 不跨午夜，24:00为当天结束</p>
      {error && <p className="tt-form-error" role="alert">{error}</p>}
      <div className="tt-form-actions">{draft.sessionId && <button type="button" className="tt-remove" onClick={remove}><Trash2 size={14} />取消这个课次</button>}<Button className="primary-button" type="submit">保存到课表<ArrowUpRight size={15} /></Button></div>
    </form>}</DialogContent></Dialog>
  </section>;
}
