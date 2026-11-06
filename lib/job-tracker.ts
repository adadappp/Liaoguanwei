import {z} from "zod";
import {safeUrl} from "./atlas.ts";
import type {JobPosting} from "./job-market.ts";
export const TRACKER_KEY="career-atlas-job-tracker-v1";
export const APPLICATION_STAGES=["收藏","已投递","面试中","已结束"] as const;
export type TrackedJob={posting:JobPosting;stage:typeof APPLICATION_STAGES[number];note:string;interviewAt:string;updatedAt:string;deletedAt?:string};
const date=z.string().max(40).refine(s=>Number.isFinite(Date.parse(s)));
const Posting=z.object({id:z.string().regex(/^[a-f0-9]{64}$/),role:z.string().max(80),title:z.string().min(1).max(150),company:z.string().max(150),city:z.string().max(100),experience:z.string().max(100),url:z.string().refine(s=>!!safeUrl(s)),publishedAt:date.nullable(),checkedAt:date,expiresAt:date,salary:z.string().max(200),salaryMin:z.number().nonnegative().nullable(),salaryMax:z.number().nonnegative().nullable(),education:z.string().max(160),description:z.string().max(6000),skills:z.array(z.string().max(100)).max(12),availability:z.enum(["apply_signal","unknown","closed","needs_review"]),statusQuote:z.string().max(160),documentHash:z.string().regex(/^[a-f0-9]{64}$/).optional()});
const Record=z.object({posting:Posting,stage:z.enum(APPLICATION_STAGES),note:z.string().max(2000),interviewAt:z.string().max(20).refine(s=>s===""||/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))),updatedAt:date,deletedAt:date.optional()});
export function parseTracked(value:unknown):TrackedJob[]{
  const data=z.array(Record).max(1000).parse(value);if(data.filter(r=>!r.deletedAt).length>100)throw new Error("最多保留100条有效求职记录。");if(new Set(data.map(r=>r.posting.id)).size!==data.length)throw new Error("备份包含重复职位。");return data;
}
export function writeTracked(storage:Pick<Storage,"getItem"|"setItem">,records:TrackedJob[],expected:string|null){
  if(storage.getItem(TRACKER_KEY)!==expected)throw new Error("其他窗口已更新求职记录，请重新载入页面后再修改。");
  const raw=JSON.stringify(parseTracked(records));storage.setItem(TRACKER_KEY,raw);return raw;
}
export function trackerBackup(records:TrackedJob[]){return {format:"career-atlas-job-tracker",version:2,exportedAt:new Date().toISOString(),records:parseTracked(records)};}
export function parseTrackerBackup(value:unknown){const data=z.object({format:z.literal("career-atlas-job-tracker"),version:z.union([z.literal(1),z.literal(2)]),records:z.unknown()}).parse(value);return parseTracked(data.records);}
export function mergeTracked(current:TrackedJob[],incoming:TrackedJob[]){const ids=new Set(current.map(r=>r.posting.id));return parseTracked([...current,...incoming.filter(r=>!ids.has(r.posting.id))]);}
export function deleteTracked(records:TrackedJob[],id:string){return parseTracked(records.map(r=>r.posting.id===id&&!r.deletedAt?{...r,deletedAt:new Date().toISOString()}:r));}
export function restoreTracked(records:TrackedJob[],id:string){return parseTracked(records.map(r=>{if(r.posting.id!==id||!r.deletedAt)return r;const {deletedAt,...rest}=r;void deletedAt;return rest;}));}
