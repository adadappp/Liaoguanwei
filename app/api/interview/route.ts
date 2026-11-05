import {env} from "cloudflare:workers";
import {z} from "zod";
import {QueryInput} from "@/lib/query-input";
import {apiJson,sameOrigin,smallJson} from "@/lib/api-utils";
import {findInterviewQuestions} from "@/lib/interview-service";
import {readInterviewQuestions} from "@/lib/interview-store";
import {later} from "@/lib/job-store";
export const dynamic="force-dynamic";
const Input=QueryInput.extend({jobIds:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(10)});
const recent=new Map<string,number>();let running=0;
export async function GET(request:Request){
  if(!env.DB)return apiJson({error:"题库暂不可用。"},503);
  const id=new URL(request.url).searchParams.get("topic");
  if(id){
    if(!/^[a-f0-9]{64}$/.test(id))return apiJson({error:"题库编号无效。"},400);
    const topic=await env.DB.prepare("SELECT id,role,skills_json FROM interview_topics WHERE id=?").bind(id).first<{id:string;role:string;skills_json:string}>();
    if(!topic)return apiJson({error:"该岗位暂未建立题库。"},404);
    const skills=JSON.parse(topic.skills_json) as string[];
    return apiJson({topicId:id,role:topic.role,skills,questions:await readInterviewQuestions(env.DB,id,topic.role,skills),storage:"database",warnings:[]});
  }
  const topics=await env.DB.prepare("SELECT t.id,t.role,t.updated_at,count(q.id) AS count FROM interview_topics t LEFT JOIN interview_question_links l ON l.topic_id=t.id LEFT JOIN interview_questions q ON q.id=l.question_id AND q.verified_at>=? GROUP BY t.id ORDER BY t.updated_at DESC LIMIT 30").bind(later(-90)).all();
  return apiJson({topics:topics.results});
}
// 共享题库写入依赖原owner-private门禁；不接受浏览器传来的题目或来源正文。
export async function POST(request:Request){
  if(!sameOrigin(request))return apiJson({error:"请求来源无效。"},403);
  if(!env.DB)return apiJson({error:"题库暂不可用，未触发联网。"},503);
  let input;try{input=Input.parse(await smallJson(request));}catch{return apiJson({error:"请从已入库的真实职位结果进入面试题库。"},400);}
  const key=request.headers.get("oai-authenticated-user-id")||"service",now=Date.now();
  for(const [id,time] of recent)if(now-time>60000)recent.delete(id);
  if(recent.size>5000||running>=2||now-(recent.get(key)||0)<15000)return apiJson({error:"面试题查询较频繁，请等待片刻。"},429);
  recent.set(key,now);running++;
  const abort=new AbortController(),cancel=()=>abort.abort();request.signal.addEventListener("abort",cancel);const timer=setTimeout(cancel,80000);
  try{return apiJson(await findInterviewQuestions(env.DB,input,input.jobIds,abort.signal));}
  catch(error){const message=abort.signal.aborted?"检索已取消或超时，已入库题目不会丢失。":error instanceof Error?error.message:"面试题查找未完成。";return apiJson({error:message},/重新搜索|已核验技能/.test(message)?400:502);}
  finally{running--;clearTimeout(timer);request.signal.removeEventListener("abort",cancel);}
}
