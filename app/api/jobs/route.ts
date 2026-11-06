import {env} from "cloudflare:workers";
import {apiJson,sameOrigin,smallJson} from "@/lib/api-utils";
import {MarketInput} from "@/lib/job-market";
import {findMarketJobs,readMarketListings,marketDetail} from "@/lib/job-market-service";
export const dynamic="force-dynamic";
let running=0;const recent=new Map<string,number>();
export async function GET(request:Request){
  if(!env.DB)return apiJson({error:"职位库暂不可用。"},503);
  try{const id=new URL(request.url).searchParams.get("jobId");if(id){if(!/^[a-f0-9]{64}$/.test(id))return apiJson({error:"职位编号无效。"},400);const detail=await marketDetail(env.DB,id);return detail?apiJson(detail):apiJson({error:"该职位暂时无法读取，收藏记录仍保存在本地。"},404);}
    return apiJson({jobs:await readMarketListings(env.DB),warnings:["仅展示近24小时成功读取的职位页面，是否仍可投递请以原站为准。"]});
  }catch{return apiJson({error:"职位资料读取失败，请稍后再试。"},503);}
}
export async function POST(request:Request){
  if(!sameOrigin(request))return apiJson({error:"请求来源无效。"},403);
  if(!env.DB)return apiJson({error:"职位库暂不可用，未发起收费检索。"},503);
  let input;try{input=MarketInput.parse(await smallJson(request));}catch{return apiJson({error:"请输入2至80字岗位名，并选择有效城市、经验和薪资条件。"},400);}
  const key=request.headers.get("oai-authenticated-user-id")||"service",now=Date.now();for(const [id,time] of recent)if(now-time>60000)recent.delete(id);
  if(running>=2||recent.size>5000||now-(recent.get(key)||0)<15000)return apiJson({error:"职位查询较频繁，请稍后再试。"},429);
  recent.set(key,now);running++;const abort=new AbortController(),cancel=()=>abort.abort(),timer=setTimeout(cancel,110000);request.signal.addEventListener("abort",cancel);
  try{return apiJson(await findMarketJobs(env.DB,input,abort.signal));}catch(error){return apiJson({error:abort.signal.aborted?"检索已取消或超时，已收藏的记录保留。":error instanceof Error?error.message:"职位检索未完成。"},502);}finally{running--;clearTimeout(timer);request.signal.removeEventListener("abort",cancel);}
}
