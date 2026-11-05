import {acquireLease,releaseLease,claimBudget,iso,later,type Query} from "./job-store.ts";
import {interviewContext,readInterviewQuestions,saveInterviewQuestions} from "./interview-store.ts";
import {retrieveInterviewQuestions} from "./interview-retrieval.ts";
import type {InterviewResult} from "./interview.ts";
export async function findInterviewQuestions(db:D1Database,input:Query,jobIds:string[],signal:AbortSignal){
  const context=await interviewContext(db,input,jobIds);
  await db.prepare("INSERT INTO interview_topics(id,role,skills_json,job_ids_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET job_ids_json=excluded.job_ids_json,updated_at=excluded.updated_at").bind(context.id,input.role,JSON.stringify(context.skills),JSON.stringify(context.jobIds),iso()).run();
  const cached=await readInterviewQuestions(db,context.id,input.role,context.skills);
  if(cached.length)await db.batch(cached.map(question=>db.prepare("INSERT OR IGNORE INTO interview_question_links(topic_id,question_id) VALUES(?,?)").bind(context.id,question.id)));
  const result=(questions:InterviewResult["questions"],storage:InterviewResult["storage"],warnings:string[]=[],audit?:InterviewResult["audit"]):InterviewResult=>({topicId:context.id,role:input.role,skills:context.skills,questions,storage,warnings,audit});
  if(cached.length>=5)return result(cached,"database");
  const token=await acquireLease(db,`interview:${context.id}`,100);
  if(!token){if(cached.length)return result(cached,"database",["同岗位题目正在检索，先展示已有题目。"]);throw new Error("同岗位面试题正在查找，请稍后再试。");}
  try{
    const topic=await db.prepare("SELECT next_search_at FROM interview_topics WHERE id=?").bind(context.id).first<{next_search_at:string|null}>();
    if(topic?.next_search_at&&topic.next_search_at>iso())return result(cached,"database",[cached.length?"近期已查找，先复用已入库题目。":"近期已查找但未取得合格题目；为避免重复付费，请稍后再试。"]);
    if(!await claimBudget(db,"interview-search",10))return result(cached,"database",["今日面试题联网额度已用完，请明日再试。"]);
    await db.prepare("UPDATE interview_topics SET next_search_at=? WHERE id=?").bind(new Date(Date.now()+15*60000).toISOString(),context.id).run();
    const found=await retrieveInterviewQuestions(context,signal);
    if(signal.aborted)throw new Error("面试题检索已取消。");
    await saveInterviewQuestions(db,context,found.questions);
    const questions=await readInterviewQuestions(db,context.id,input.role,context.skills);
    if(found.questions.length&&!questions.length)throw new Error("题目保存后的回读未通过，请稍后重试；本次未标记为成功题库。");
    await db.prepare("UPDATE interview_topics SET next_search_at=?,updated_at=? WHERE id=?").bind(questions.length>=5?later(1):new Date(Date.now()+6*3600000).toISOString(),iso(),context.id).run();
    return result(questions,cached.length?"mixed":"live",questions.length?[]:["没有取得可核验的相关公开面试题，没有用AI自行出题填充。"],found.audit);
  }catch(error){if(cached.length&&!signal.aborted)return result(cached,"database",[`联网补充未完成：${error instanceof Error?error.message:"来源暂不可用"}，已有题目保留。`]);throw error;}
  finally{await releaseLease(db,`interview:${context.id}`,token).catch(()=>{});}
}
