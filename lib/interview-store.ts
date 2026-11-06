import {hash,iso,later,readCache,topicId,type Query} from "./job-store.ts";
import {normalizeRole} from "./job-taxonomy.ts";
import {readRoleIntent} from "./role-intent.ts";
import {PRACTICE_CATEGORIES,questionUrl,sourceLicense,type InterviewQuestion,type QuestionDraft,type QuestionDocument} from "./interview.ts";
type Row={id:string;question:string;original_question:string;answer:string;skills_json:string;roles_json:string;difficulty:string;source_url:string;source_title:string;source_kind:InterviewQuestion["sourceKind"];report_quote:string;license:string;verified_at:string;practice_json:string};
export async function interviewContext(db:D1Database,input:Query,jobIds:string[]){
  const analysis=await readCache(db,input),wanted=new Set(jobIds),jobs=analysis.jobs.filter(job=>wanted.has(job.id));
  if(!jobs.length||jobs.length!==wanted.size)throw new Error("相关职位尚未完整入库或已需复核，请重新搜索岗位后再查看面试题。");
  const skills=analysis.skills.filter(skill=>skill.evidence.some(e=>wanted.has(e.jobId))).slice(0,6).map(skill=>skill.name);
  if(!skills.length)throw new Error("该岗位暂时没有可用于面试题检索的已核验技能。");
  const row=await db.prepare("SELECT role_intent_json FROM search_topics WHERE id=?").bind(await topicId(input)).first<{role_intent_json:string|null}>();
  const intent=readRoleIntent(row?.role_intent_json,input.role);
  return {...input,skills,jobIds:[...wanted],roleNames:intent?[intent.canonicalTitle,...intent.aliases]:[input.role],id:await hash(JSON.stringify([normalizeRole(input.role),[...skills].sort()]))};
}
export async function readInterviewQuestions(db:D1Database,id:string,role:string,skills:string[]){
  const rows=await db.prepare("SELECT * FROM interview_questions WHERE verified_at>=? ORDER BY EXISTS(SELECT 1 FROM interview_question_links l WHERE l.question_id=interview_questions.id AND l.topic_id=?) DESC,verified_at DESC LIMIT 200").bind(later(-90),id).all<Row>();
  const questions:InterviewQuestion[]=[];
  for(const row of rows.results)try{
    const tags=JSON.parse(row.skills_json) as string[],roles=JSON.parse(row.roles_json) as string[];
    const ai=row.source_kind==="ai_generated";
    if((!ai&&!questionUrl(row.source_url))||!Array.isArray(tags)||!Array.isArray(roles)||!roles.includes(normalizeRole(role))||!tags.some(tag=>skills.includes(tag)))continue;
    const meta=JSON.parse(row.practice_json||"{}");
    const category=PRACTICE_CATEGORIES.includes(meta.category)?meta.category:"基础";
    questions.push({id:row.id,question:row.question,originalQuestion:ai?"":row.original_question,answer:row.answer,skills:tags.filter(tag=>skills.includes(tag)),difficulty:row.difficulty,sourceUrl:ai?"":row.source_url,sourceTitle:ai?"AI 原创练习":row.source_title,sourceKind:row.source_kind,reportQuote:ai?"":row.report_quote,license:row.license,verifiedAt:row.verified_at,category,material:typeof meta.material==="string"?meta.material:"",requirements:Array.isArray(meta.requirements)?meta.requirements.filter((x:unknown)=>typeof x==="string").slice(0,5):[]});
    if(questions.length>=30)break;
  }catch{/* 损坏题目不参与展示 */}
  return questions;
}
export async function saveInterviewQuestions(db:D1Database,context:{id:string;role:string},questions:(QuestionDraft&{doc:QuestionDocument})[]){
  for(const question of questions){
    const id=await hash(normalizeRole(question.sourceQuestion)),now=iso();
    const old=await db.prepare("SELECT skills_json,roles_json FROM interview_questions WHERE id=?").bind(id).first<{skills_json:string;roles_json:string}>();
    let oldSkills:string[]=[],oldRoles:string[]=[];try{if(old){const tags=JSON.parse(old.skills_json),roles=JSON.parse(old.roles_json);if(Array.isArray(tags))oldSkills=tags.filter((x:unknown)=>typeof x==="string");if(Array.isArray(roles))oldRoles=roles.filter((x:unknown)=>typeof x==="string");}}catch{/* 仅保留本轮有效关联 */}
    const skills=[...new Set([...question.skills,...oldSkills])].slice(0,30),roles=[...new Set([normalizeRole(context.role),...oldRoles])].slice(0,30);
    await db.batch([
      db.prepare("INSERT INTO interview_questions(id,question,original_question,answer,skills_json,roles_json,difficulty,source_url,source_title,source_kind,report_quote,license,source_hash,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET question=excluded.question,original_question=excluded.original_question,answer=excluded.answer,skills_json=excluded.skills_json,roles_json=excluded.roles_json,difficulty=excluded.difficulty,source_url=excluded.source_url,source_title=excluded.source_title,source_kind=excluded.source_kind,report_quote=excluded.report_quote,license=excluded.license,source_hash=excluded.source_hash,verified_at=excluded.verified_at").bind(id,question.question,question.sourceQuestion,question.answer,JSON.stringify(skills),JSON.stringify(roles),question.difficulty,question.doc.url,question.doc.title,question.sourceKind,question.reportQuote,sourceLicense(question.doc.url),await hash(question.doc.body),now,now),
      db.prepare("INSERT OR IGNORE INTO interview_question_links(topic_id,question_id) VALUES(?,?)").bind(context.id,id),
    ]);
  }
}
