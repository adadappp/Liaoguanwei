import { env } from "cloudflare:workers";
import { searchAtlas } from "@/lib/atlas-search";
import { QueryInput } from "@/lib/query-input";
import { apiJson, sameOrigin, smallJson } from "@/lib/api-utils";
export const dynamic = "force-dynamic";
const recent = new Map<string, number>(); let running = 0;
export async function POST(request: Request) {
  if(!sameOrigin(request)) return apiJson({error:"请求来源无效。"},403);
  let input;
  try { input=QueryInput.parse(await smallJson(request)); } catch { return apiJson({error:"请输入 2–80 字的岗位名称，并选择有效筛选条件。"},400); }
  const key=request.headers.get("oai-authenticated-user-id") || request.headers.get("cf-connecting-ip") || "local";
  const now=Date.now(); for(const [id,time] of recent) if(now-time>60000) recent.delete(id);
  if(recent.size>5000 || running>=3 || now-(recent.get(key)||0)<15000) return apiJson({error:"检索较频繁，请等待片刻后再试。"},429);
  recent.set(key,now); running++;
  const abort=new AbortController(), cancel=()=>abort.abort(); request.signal.addEventListener("abort",cancel); const timer=setTimeout(cancel,90000);
  try { return apiJson(await searchAtlas(env.DB,input,abort.signal)); }
  catch(error) { return apiJson({error:abort.signal.aborted ? "本次检索已超时或取消，请稍后重试。" : error instanceof Error ? error.message : "检索未完成。"},502); }
  finally { running--;clearTimeout(timer);request.signal.removeEventListener("abort",cancel); }
}
