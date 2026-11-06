import {env} from "cloudflare:workers";
import {z} from "zod";
import {apiJson,sameOrigin,smallJson} from "@/lib/api-utils";
import {expandPractice,reviewPractice} from "@/lib/interview-practice";
export const dynamic="force-dynamic";
const id=z.string().regex(/^[a-f0-9]{64}$/);
const Input=z.discriminatedUnion("action",[z.object({action:z.literal("expand"),topicId:id}).strict(),z.object({action:z.literal("feedback"),topicId:id,questionId:id,answer:z.string().trim().min(10).max(6000)}).strict()]);
let running=0;const recent=new Map<string,number>();
export async function POST(request:Request){
  if(!sameOrigin(request))return apiJson({error:"请求来源无效。"},403);
  if(!env.DB)return apiJson({error:"题库暂不可用，未调用分析服务。"},503);
  let input;try{input=Input.parse(await smallJson(request,10000));}catch{return apiJson({error:"请提交有效题库与10至6000字的答案。"},400);}
  const key=request.headers.get("oai-authenticated-user-id")||"service",now=Date.now();
  for(const [id,time] of recent)if(now-time>60000)recent.delete(id);
  if(running>=2||recent.size>5000||now-(recent.get(key)||0)<3000)return apiJson({error:"练习请求较频繁，请稍后再试。"},429);
  recent.set(key,now);running++;
  const abort=new AbortController(),cancel=()=>abort.abort(),timer=setTimeout(cancel,80000);request.signal.addEventListener("abort",cancel);
  try{return apiJson(input.action==="expand"?await expandPractice(env.DB,input.topicId,abort.signal):await reviewPractice(env.DB,input.topicId,input.questionId,input.answer,abort.signal));}
  catch(error){return apiJson({error:abort.signal.aborted?"练习请求已取消或超时，已有题目和本地答案保留。":error instanceof Error?error.message:"练习请求未完成。"},502);}
  finally{running--;clearTimeout(timer);request.signal.removeEventListener("abort",cancel);}
}
