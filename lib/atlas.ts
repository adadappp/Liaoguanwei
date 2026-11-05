export type Evidence = { jobId: string; quote: string; level: "必备" | "优先" | "未明确" };
export type Skill = { id: string; name: string; category: string; description: string; evidence: Evidence[] };
export type Job = { id: string; title: string; company: string; city: string; experience: string; url: string; publishedAt: string | null; verifiedAt?: string; evidenceStatus?: "historical" | "current" };
export type Validation = { extractedJobs:number; metadataRejected:number; roleRejected:number; filterRejected:number; duplicateRejected:number; evidenceRejected:number };
export type Coverage = { candidates: number; invalidUrl: number; offSource: number; notDetail: number; noBody: number; blocked: number; duplicate: number; overLimit: number; searchRequests: number; failedSearches: number; bodyFetches: number; failedFetches: number; candidateDocuments: number; verifiedDocuments: number; unverifiedDocuments: number; validDocuments: number; acceptedJobs: number; modelJobs?:number; modelRoleRejected?:number; missingRoleMatch?:number; invalidRoleProof?:number; roleInterpretation?:{title:string;aliases:string[]}; reviewedTitles?:string[] };
export type Analysis = { role: string; city: string; experience: string; retrievedAt: string; demo: boolean; jobs: Job[]; skills: Skill[]; warnings: string[]; validation?: Validation; coverage?: Coverage; refresh?: { status: "completed" | "deferred" | "failed"; persisted: boolean; reason?: string }; storage?: { mode: "database" | "mixed" | "live"; cachedJobs: number; liveJobs: number; topicId: string } };
export type StudySession = { id: string; day: number; startMinute: number; endMinute: number };
export type Task = { id: string; name: string; description: string; start: string; end: string; status: "todo" | "doing" | "done"; notes?: string; sessions?: StudySession[]; source?: { role: string; demo: boolean; evidence: { quote: string; url: string; title: string }[] } };
export type Plan = { id: string; title: string; goal: string; notes: string; tasks: Task[]; updatedAt: string };
export const STORAGE_KEY = "career-atlas-plans-v1";
export const uid = () => crypto.randomUUID();
export function blankPlan(title = "我的学习计划"): Plan { return { id: uid(), title, goal: "", notes: "", tasks: [], updatedAt: new Date().toISOString() }; }
export function blankTask(name = "新的学习内容"): Task { return { id: uid(), name, description: "", start: "", end: "", status: "todo" }; }
export function backup(plans: Plan[]) { return { format: "career-atlas", version: 3, exportedAt: new Date().toISOString(), plans }; }
const text = (s: unknown, max: number) => typeof s === "string" && s.length <= max;
function validDate(s: unknown) { if (s === "") return true; if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s; }
export function safeUrl(value: string) { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hostname.includes(":") && !/^\d/.test(u.hostname) && u.hostname.includes(".") && !/\.(local|localhost|internal|test)$/.test(u.hostname) ? u.href : null; } catch { return null; } }
export function parseBackup(value: unknown): Plan[] {
  if (!value || typeof value !== "object") throw new Error("备份格式不正确。");
  const data = value as ReturnType<typeof backup>;
  if (data.format !== "career-atlas" || ![1, 2, 3].includes(data.version) || !Array.isArray(data.plans) || data.plans.length > 100) throw new Error("请选择图鉴导出的第 1 至第 3 版备份，最多支持 100 份计划。");
  const ids = new Set<string>();
  for (const p of data.plans) {
    if (!p || !text(p.id, 100) || !p.id || ids.has(p.id) || !text(p.title, 150) || !text(p.goal, 10000) || !text(p.notes, 30000) || !text(p.updatedAt, 100) || !Array.isArray(p.tasks) || p.tasks.length > 200) throw new Error("计划数据不完整或超过大小限制。");
    ids.add(p.id); const taskIds = new Set<string>(); const sessionIds = new Set<string>();
    for (const t of p.tasks) {
      if (!t || !text(t.id, 100) || !t.id || taskIds.has(t.id) || !text(t.name, 150) || !text(t.description, 10000) || !["todo", "doing", "done"].includes(t.status) || !validDate(t.start) || !validDate(t.end) || (t.start && t.end && t.end < t.start)) throw new Error("任务格式或日期不正确。");
      taskIds.add(t.id);
      if (t.notes !== undefined && !text(t.notes, 30000)) throw new Error("课程笔记格式不正确或超过30000字。");
      if (t.sessions !== undefined) {
        if (!Array.isArray(t.sessions) || t.sessions.length > 100) throw new Error("每项课程最多安排100个课次。");
        for (const s of t.sessions) {
          if (!s || !text(s.id, 100) || !s.id || sessionIds.has(s.id) || !Number.isInteger(s.day) || s.day < 0 || s.day > 6 || !Number.isInteger(s.startMinute) || !Number.isInteger(s.endMinute) || s.startMinute < 0 || s.endMinute > 1440 || s.endMinute - s.startMinute < 15 || s.startMinute % 15 || s.endMinute % 15) throw new Error("课表时间不正确：请选择星期及15分钟间隔的起止时间。");
          sessionIds.add(s.id);
          if (sessionIds.size > 500) throw new Error("每份计划最多安排500个课次。");
        }
      }
      if (t.source && (!text(t.source.role, 100) || typeof t.source.demo !== "boolean" || !Array.isArray(t.source.evidence) || t.source.evidence.length > 50 || t.source.evidence.some(e => !e || !text(e.quote, 1000) || !text(e.title, 300) || !text(e.url, 2000) || (e.url !== "" && !safeUrl(e.url))))) throw new Error("任务来源数据不正确。");
    }
  }
  return data.plans.map(p => ({ id: p.id, title: p.title, goal: p.goal, notes: p.notes, updatedAt: p.updatedAt, tasks: p.tasks.map(t => ({ id: t.id, name: t.name, description: t.description, start: t.start, end: t.end, status: t.status, ...(t.notes !== undefined ? { notes: t.notes } : {}), ...(t.sessions !== undefined ? { sessions: t.sessions.map(s => ({ id: s.id, day: s.day, startMinute: s.startMinute, endMinute: s.endMinute })) } : {}), ...(t.source ? { source: { role: t.source.role, demo: t.source.demo, evidence: t.source.evidence.map(e => ({ quote: e.quote, title: e.title, url: e.url })) } } : {}) })) }));
}
