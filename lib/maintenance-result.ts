import type { Analysis } from "./atlas.ts";

export function topicRefreshResult(analysis: Analysis) {
  const complete = analysis.refresh?.status === "completed" && analysis.refresh.persisted;
  return {
    status: complete ? "completed" as const : "partial" as const,
    resolveFeedback: complete,
    reason: complete ? undefined : analysis.refresh?.reason || "本轮未完成实时核验与入库，保留反馈等待重试。",
  };
}

export function maintenanceStatus(outcomes: { status: string }[]) {
  if (!outcomes.length) return "completed";
  const failed = outcomes.filter(row => row.status === "retry").length;
  return failed === outcomes.length ? "failed" : failed ? "partial" : "completed";
}
