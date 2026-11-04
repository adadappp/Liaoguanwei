import type { StudySession, Task } from "./atlas.ts";

export const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const MINUTES_PER_DAY = 1440;
export const HOUR_HEIGHT = 40;
export const timeLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const TIME_OPTIONS = Array.from({ length: 97 }, (_, i) => i * 15);

export function sessionProblem(tasks: Task[], taskId: string, session: StudySession, excludeId?: string): string | null {
  const course = tasks.find(t => t.id === taskId);
  if (!course) return "课程已不存在，请重新选择。";
  if (!Number.isInteger(session.day) || session.day < 0 || session.day > 6 || !Number.isInteger(session.startMinute) || !Number.isInteger(session.endMinute) || session.startMinute < 0 || session.endMinute > MINUTES_PER_DAY || session.endMinute - session.startMinute < 15 || session.startMinute % 15 || session.endMinute % 15) return "请选择有效时间，结束时间须晚于开始时间，最短15分钟。";
  if ((course.sessions?.filter(s => s.id !== excludeId).length || 0) >= 100) return "这项课程已达到100个课次上限。";
  if (!excludeId && tasks.reduce((n, t) => n + (t.sessions?.length || 0), 0) >= 500) return "这份计划已达到500个课次上限。";
  for (const task of tasks) {
    const clash = task.sessions?.find(s => s.id !== excludeId && s.day === session.day && s.startMinute < session.endMinute && session.startMinute < s.endMinute);
    if (clash) return `与「${task.name || "未命名课程"}」${WEEKDAYS[clash.day]} ${timeLabel(clash.startMinute)}–${timeLabel(clash.endMinute)} 重叠，请换个时间。`;
  }
  return null;
}

export function placeSession(tasks: Task[], taskId: string, session: StudySession, excludeId?: string): Task[] {
  const problem = sessionProblem(tasks, taskId, session, excludeId);
  if (problem) throw new Error(problem);
  return tasks.map(t => ({ ...t, ...(t.id === taskId || t.sessions?.some(s => s.id === excludeId) ? { sessions: [...(t.sessions || []).filter(s => s.id !== excludeId), ...(t.id === taskId ? [session] : [])] } : {}) }));
}

export function snappedStart(rawMinute: number, duration: number) {
  return Math.max(0, Math.min(MINUTES_PER_DAY - duration, Math.round(rawMinute / 30) * 30));
}

/** 导入允许保留原有冲突，UI标记出来，不以丢失用户资料来修复冲突。 */
export function conflictingIds(tasks: Task[]): Set<string> {
  const sessions = tasks.flatMap(t => t.sessions || []), conflicts = new Set<string>();
  for (let i = 0; i < sessions.length; i++) for (let j = i + 1; j < sessions.length; j++) {
    const a = sessions[i], b = sessions[j];
    if (a.day === b.day && a.startMinute < b.endMinute && b.startMinute < a.endMinute) { conflicts.add(a.id); conflicts.add(b.id); }
  }
  return conflicts;
}
