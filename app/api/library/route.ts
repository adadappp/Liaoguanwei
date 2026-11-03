import { env } from "cloudflare:workers";
import { apiJson, sameOrigin, smallJson } from "@/lib/api-utils";
import { bootstrap, maintain } from "@/lib/database-maintenance";
export const dynamic="force-dynamic";
export async function GET() {
  if(!env.DB) return apiJson({error:"职位数据库尚不可用。"},503);
  const [states,companies,leads,taxonomy,sources,runs,feedback]=await Promise.all([
    env.DB.prepare("SELECT state,count(*) AS count FROM job_documents GROUP BY state").all(),
    env.DB.prepare("SELECT count(DISTINCT company) AS count FROM job_documents WHERE company<>'企业未注明'").first(),
    env.DB.prepare("SELECT state,count(*) AS count FROM import_leads GROUP BY state").all(),
    env.DB.prepare("SELECT t.id,t.parent_id,t.name,t.description,count(j.id) AS jobs FROM job_taxonomy t LEFT JOIN job_documents j ON j.branch=t.id GROUP BY t.id ORDER BY t.id").all(),
    env.DB.prepare("SELECT * FROM data_sources ORDER BY id").all(),
    env.DB.prepare("SELECT * FROM update_runs ORDER BY started_at DESC LIMIT 10").all(),
    env.DB.prepare("SELECT status,count(*) AS count FROM user_feedback GROUP BY status").all(),
  ]);
  return apiJson({states:states.results,companies,leads:leads.results,taxonomy:taxonomy.results,sources:sources.results,runs:runs.results,feedback:feedback.results,policy:{minimumSamples:5,maxHistoricalDays:90,aiReviewDays:7,regularReviewDays:30,maintenanceRunsPerDay:6,liveSearchesPerDay:40}});
}
// 此共享资料写入口依赖现有 owner-private Sites 门禁。不可在未加维护者鉴权时改成公开站点。
export async function POST(request: Request) {
  if(!sameOrigin(request)) return apiJson({error:"请求来源无效。"},403);
  if(!env.DB) return apiJson({error:"职位数据库尚不可用。"},503);
  let mode; try { mode=(await smallJson(request)).mode; } catch { return apiJson({error:"更新参数无效。"},400); }
  if(!["bootstrap","review","leads","topics"].includes(mode)) return apiJson({error:"更新模式无效。"},400);
  const abort=new AbortController(),cancel=()=>abort.abort(); const timer=setTimeout(cancel,85000);request.signal.addEventListener("abort",cancel);
  try { return apiJson(mode==="bootstrap" ? await bootstrap(env.DB) : await maintain(env.DB,abort.signal,mode)); }
  catch(error) { return apiJson({error:error instanceof Error ? error.message : "数据库更新未完成。"},502); }
  finally {clearTimeout(timer);request.signal.removeEventListener("abort",cancel);}
}
