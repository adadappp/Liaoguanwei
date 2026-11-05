import { z } from "zod";
import { normalizeRole } from "./job-taxonomy.ts";

const term=z.string().trim().min(2).max(60).refine(value=>!/[\r\n<>:{}]|https?:|\b(?:site|OR|AND|NOT)\b/i.test(value),"职业词不能包含链接或检索指令");
export const RoleIntentSchema=z.object({canonicalTitle:term,aliases:z.array(term).max(4),duties:z.array(term).min(1).max(5).refine(values=>values.every(usefulDuty),"核心职责不能只写通用素质"),excludedRoles:z.array(term).max(4),sector:z.enum(["technical","creative","other"])});
export type RoleIntent=z.infer<typeof RoleIntentSchema>;
export type StoredRoleIntent=RoleIntent & {version:1;queryKey:string;createdAt:string};
export type RoleEvidence={role:string;duty:string;quote:string;kind?:"title"};
export const roleKey=normalizeRole;
export function usefulDuty(duty:string){return duty.length>=2&&duty.length<=60&&!/^(沟通|沟通能力|团队合作|团队协作|责任心|学习能力|认真负责|执行力|项目交付|项目管理|制作|工作|设计|开发|编辑|处理|参与项目|完成项目|项目制作)$/.test(duty.trim());}
export function usefulRoleQuote(quote:string){return quote.replace(/沟通能力|沟通|团队合作|团队协作|责任心|学习能力|认真负责|执行力|项目交付|项目管理|具备|良好|优秀|重视|能力|和|与|的|等|[\s\p{P}]/gu,"").length>=4;}
export function readRoleIntent(raw:string|null|undefined,role:string):RoleIntent|null {
  if(!raw)return null;
  try{const data=JSON.parse(raw);if(data.version!==1||data.queryKey!==roleKey(role)||!Number.isFinite(Date.parse(data.createdAt))||Date.now()-Date.parse(data.createdAt)>30*86400000||Date.parse(data.createdAt)>Date.now()+60000)return null;return RoleIntentSchema.parse(data);}catch{return null;}
}
export function storeRoleIntent(intent:RoleIntent,role:string):StoredRoleIntent{return {...RoleIntentSchema.parse(intent),version:1,queryKey:roleKey(role),createdAt:new Date().toISOString()};}
export function intentTerms(role:string,intent?:RoleIntent|null){return intent ? [...new Set([intent.canonicalTitle,...intent.aliases,role])].slice(0,5) : [role];}
export function candidateRoleScore(role:string,title:string,body:string,intent?:RoleIntent|null){
  const name=roleKey(title),text=roleKey(body),terms=intentTerms(role,intent);
  const titleMatch=terms.some(term=>name.includes(roleKey(term)));
  const bodyMatch=terms.some(term=>text.includes(roleKey(term)));
  const duties=intent?.duties.filter(duty=>usefulDuty(duty)&&text.includes(roleKey(duty))).length||0;
  const excluded=intent?.excludedRoles.some(term=>name.includes(roleKey(term)));
  return excluded ? -20 : titleMatch ? 20 : bodyMatch ? 10 : duties ? Math.min(9,duties*3) : 0;
}
export async function resolveRoleIntent(db:D1Database|undefined,topic:string,role:string,generate:()=>Promise<unknown>){
  if(db){try{const row=await db.prepare("SELECT role_intent_json FROM search_topics WHERE id=?").bind(topic).first<{role_intent_json:string|null}>();const cached=readRoleIntent(row?.role_intent_json,role);if(cached)return cached;}catch{/* 数据库不可用时本轮仍可理解职业 */}}
  const intent=RoleIntentSchema.parse(await generate());
  if(db)try{await db.prepare("UPDATE search_topics SET role_intent_json=? WHERE id=?").bind(JSON.stringify(storeRoleIntent(intent,role)),topic).run();}catch{/* 不伪报已持久化；本轮仍可使用 */}
  return intent;
}
