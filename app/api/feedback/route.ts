import { env } from "cloudflare:workers";
import { z } from "zod";
import { apiJson, sameOrigin, smallJson, userId } from "@/lib/api-utils";
import { claimBudget, iso } from "@/lib/job-store";
export const dynamic="force-dynamic";
const Input=z.object({kind:z.enum(["incorrect","unavailable","missing","suggestion"]),message:z.string().trim().min(5).max(2000),jobId:z.string().regex(/^[a-f0-9]{64}$/).optional(),topicId:z.string().regex(/^[a-f0-9]{64}$/).optional()});
export async function GET(request: Request) {
  const user=userId(request); if(!user) return apiJson({error:"请在已登录的网站中查看自己的反馈。"},401);
  if(!env.DB) return apiJson({error:"反馈数据库暂不可用。"},503);
  const rows=await env.DB.prepare("SELECT id,kind,message,status,resolution,created_at,updated_at FROM user_feedback WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(user).all();
  return apiJson({feedback:rows.results});
}
export async function POST(request: Request) {
  if(!sameOrigin(request)) return apiJson({error:"请求来源无效。"},403);
  let data; try { data=Input.parse(await smallJson(request,12000)); } catch { return apiJson({error:"请填写 5–2000 字的反馈。"},400); }
  const user=userId(request); if(!user) return apiJson({error:"请在已登录的网站中提交反馈。"},401);
  if(!env.DB) return apiJson({error:"反馈数据库暂不可用，请稍后再试。"},503);
  if(data.jobId && !await env.DB.prepare("SELECT id FROM job_documents WHERE id=?").bind(data.jobId).first()) return apiJson({error:"该职位尚未入库，请改为一般建议。"},400);
  if(data.topicId && !await env.DB.prepare("SELECT id FROM search_topics WHERE id=?").bind(data.topicId).first()) return apiJson({error:"查询记录暂不可用，请稍后重试。"},400);
  if(!await claimBudget(env.DB,`feedback:${user}`,20)) return apiJson({error:"今日反馈数量已达上限，请明日再试。"},429);
  const id=crypto.randomUUID(),now=iso();
  const statements=[env.DB.prepare("INSERT INTO user_feedback(id,user_id,job_id,topic_id,kind,message,status,resolution,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending','',?,?)").bind(id,user,data.jobId||null,data.topicId||null,data.kind,data.message,now,now)];
  if(data.jobId && data.kind!=="suggestion") statements.push(env.DB.prepare("UPDATE job_documents SET state='needs_review',next_review_at=? WHERE id=?").bind(now,data.jobId));
  if(data.topicId && data.kind==="missing") statements.push(env.DB.prepare("UPDATE search_topics SET next_search_at=? WHERE id=?").bind(now,data.topicId));
  await env.DB.batch(statements);
  return apiJson({id,status:"pending",message:"反馈已保存，涉及职位的内容将核查原文；不会直接按反馈改写事实。"},201);
}
export async function DELETE(request: Request) {
  if(!sameOrigin(request)) return apiJson({error:"请求来源无效。"},403);
  let id; try { id=z.object({id:z.string().uuid()}).parse(await smallJson(request)).id; } catch { return apiJson({error:"反馈编号无效。"},400); }
  const user=userId(request); if(!user) return apiJson({error:"请先登录。"},401);
  if(!env.DB) return apiJson({error:"数据库暂不可用。"},503);
  // 撤回文本，但保留已触发的复核任务，避免因撤回而跳过真实性检查。
  await env.DB.prepare("UPDATE user_feedback SET message='',status='withdrawn',resolution='已撤回',updated_at=? WHERE id=? AND user_id=?").bind(iso(),id,user).run();
  return apiJson({ok:true});
}
