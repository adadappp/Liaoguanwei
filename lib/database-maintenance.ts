import { runRecruitment } from "./recruitment-service.ts";
import { acquireLease, claimBudget, iso, later, releaseLease, saveVerified, type Query, type StoredJob } from "./job-store.ts";
import { searchAtlas } from "./atlas-search.ts";
import { SOURCE_CATALOG } from "./source-catalog.ts";
import { TAXONOMY } from "./job-taxonomy.ts";
import lagouLeads from "../db/lagou-leads.json";
export async function bootstrap(db: D1Database) {
  const now=iso();
  await db.batch(SOURCE_CATALOG.map(s=>db.prepare("INSERT INTO data_sources(id,name,url,license,status,notes,checked_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,license=excluded.license,status=excluded.status,notes=excluded.notes,checked_at=excluded.checked_at").bind(s.id,s.name,s.url,s.license,s.status,s.notes,now)));
  await db.batch(TAXONOMY.map(([id,parent,name,description])=>db.prepare("INSERT INTO job_taxonomy(id,parent_id,name,description) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,description=excluded.description").bind(id,parent,name,description)));
  for(let offset=0;offset<lagouLeads.length;offset+=25) await db.batch(lagouLeads.slice(offset,offset+25).map(row=>db.prepare("INSERT OR IGNORE INTO import_leads(id,source_id,url,title,company,city,state,imported_at,notes) VALUES(?,'kaggle-lagou',?,?,?,?,'awaiting_body',?,?)").bind(row.id,row.url,row.title,row.company,row.city,now,"缺正文；原始skills标签未作为技能证据。CC BY-SA 4.0 / logiover")));
  return {sources:SOURCE_CATALOG.length,taxonomy:TAXONOMY.length,leads:lagouLeads.length};
}
export async function maintain(db: D1Database,signal: AbortSignal,mode:"review"|"leads"|"topics"="review") {
  const token=await acquireLease(db,"maintenance",100); if(!token) throw new Error("已有更新任务正在运行。");
  const id=crypto.randomUUID(),started=iso(); let details: unknown={};
  try {
    if(!await claimBudget(db,"maintenance",6)) throw new Error("今日后台更新预算已用完。");
    await db.prepare("INSERT INTO update_runs(id,kind,status,started_at,details_json) VALUES(?,?,'running',?,'{}')").bind(id,mode,started).run();
    if(mode==="topics") {
      const topic=await db.prepare("SELECT role,city,experience FROM search_topics WHERE (next_search_at IS NULL OR next_search_at<=?) AND last_seen_at>=? ORDER BY EXISTS(SELECT 1 FROM user_feedback f WHERE f.topic_id=search_topics.id AND f.status IN ('pending','retry') AND f.kind='missing') DESC,hits DESC,last_seen_at DESC LIMIT 1").bind(iso(),new Date(Date.now()-30*86400000).toISOString()).first<Query>();
      if(topic) {
        const analysis=await searchAtlas(db,topic,signal,true);
        const {topicId}=await import("./job-store.ts");
        if(analysis.storage?.mode!=="database") await db.prepare("UPDATE user_feedback SET status='reviewed',resolution=?,updated_at=? WHERE topic_id=? AND kind='missing' AND status IN ('pending','retry')").bind(`已按原筛选重新检索，返回${analysis.jobs.length}条资料；不代表市场全部岗位。`,iso(),await topicId(topic)).run();
        details={topic,accepted:analysis.jobs.length,storage:analysis.storage};
      } else details={message:"没有到期且近期被查询的主题。"};
    } else {
      const candidates = mode==="leads"
        ? (await db.prepare("SELECT id,url,title,company,city,'' AS body FROM import_leads WHERE state='awaiting_body' AND (last_attempt_at IS NULL OR last_attempt_at<?) ORDER BY last_attempt_at ASC,id LIMIT 3").bind(later(-7)).all<StoredJob>()).results
        : (await db.prepare("SELECT * FROM job_documents WHERE next_review_at<=? ORDER BY CASE WHEN state IN ('needs_review','review_failed') THEN 0 ELSE 1 END,next_review_at ASC LIMIT 3").bind(iso()).all<StoredJob>()).results;
      const outcomes=[];
      for(const row of candidates) {
        if(signal.aborted) throw new Error("更新超时，请稍后查看日志。");
        try {
          const input={role:row.title.slice(0,80),city:"",experience:""};
          // 历史正文只用来构造待复核候选；verified标记不沿用，每次真正读取来源。
          const result=await runRecruitment(input,signal,[{url:row.url,title:row.title,raw_content:row.body||""}]);
          const saved=await saveVerified(db,input,result.docs,result.extraction,result.analysis);
          if(!saved.size) throw new Error("本轮未获取合格且相关的正文，未更新为有效资料。");
          outcomes.push({id:row.id,status:"verified",accepted:saved.size});
        } catch(error) {
          const reason=error instanceof Error ? error.message : "读取失败";
          if(mode==="leads") await db.prepare("UPDATE import_leads SET last_attempt_at=?,notes=? WHERE id=?").bind(iso(),reason,row.id).run();
          else await db.batch([
            db.prepare("UPDATE job_documents SET state='review_failed',last_attempt_at=?,next_review_at=?,failures=failures+1 WHERE id=?").bind(iso(),later(Math.min(30,Math.max(1,(row as StoredJob & {failures?:number}).failures||1)*2)),row.id),
            db.prepare("UPDATE user_feedback SET status='retry',resolution=?,updated_at=? WHERE job_id=? AND status IN ('pending','retry')").bind(reason,iso(),row.id),
          ]);
          outcomes.push({id:row.id,status:"retry",reason});
          if(/余额|凭据|授权/.test(reason)) break;
        }
      }
      details={processed:outcomes.length,outcomes};
    }
    const outcomes=(details as {outcomes?:{status:string}[]}).outcomes;
    const status=outcomes?.some(row=>row.status==="retry") ? "partial" : "completed";
    await db.prepare("UPDATE update_runs SET status=?,completed_at=?,details_json=? WHERE id=?").bind(status,iso(),JSON.stringify(details),id).run();
    return {id,status,details};
  } catch(error) {
    await db.prepare("UPDATE update_runs SET status='failed',completed_at=?,details_json=? WHERE id=?").bind(iso(),JSON.stringify({error:error instanceof Error ? error.message : "更新失败"}),id).run(); throw error;
  } finally { await releaseLease(db,"maintenance",token); }
}
