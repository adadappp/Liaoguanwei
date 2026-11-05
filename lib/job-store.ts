import { assembleAnalysis, canonicalUrl, normalize, roleEvidenceMatches, type Document, type Extraction } from "./analysis.ts";
import type { Analysis } from "./atlas.ts";
import { classifyRole, normalizeRole, reviewDays } from "./job-taxonomy.ts";
export type Query = { role: string; city: string; experience: string };
export type StoredJob = { id: string; url: string; title: string; company: string; city: string; experience: string; body: string; body_hash: string; extraction_json: string; verified_at: string; state: string; next_review_at: string; stable_rounds: number; branch: string };
export const iso = () => new Date().toISOString();
export const later = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
export async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(n => n.toString(16).padStart(2, "0")).join(""); }
export async function topicId(input: Query) { return hash(JSON.stringify([normalizeRole(input.role), input.city, input.experience])); }
export async function recordTopic(db: D1Database, input: Query, countHit = true) {
  const id = await topicId(input);
  await db.prepare(`INSERT INTO search_topics (id,role,city,experience,family,hits,last_seen_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET hits=hits+?,last_seen_at=CASE WHEN ?=1 THEN excluded.last_seen_at ELSE last_seen_at END`).bind(id,input.role,input.city,input.experience,classifyRole(input.role).family,countHit ? 1 : 0,iso(),countHit ? 1 : 0,countHit ? 1 : 0).run();
  return id;
}
export const budgetDay = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export async function claimBudget(db: D1Database, kind: string, limit: number) {
  const day = budgetDay();
  const row = await db.prepare(`INSERT INTO request_budgets(id,used,updated_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET used=used+1,updated_at=excluded.updated_at WHERE used<? RETURNING used`).bind(`${kind}:${day}`,iso(),limit).first();
  return !!row;
}
export async function acquireLease(db: D1Database, id: string, seconds = 100) {
  const token = crypto.randomUUID();
  const row = await db.prepare(`INSERT INTO maintenance_leases(id,token,until_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,until_at=excluded.until_at WHERE until_at<? RETURNING token`).bind(id,token,new Date(Date.now()+seconds*1000).toISOString(),iso()).first<{token:string}>();
  return row?.token === token ? token : null;
}
export async function releaseLease(db: D1Database, id: string, token: string) { await db.prepare("DELETE FROM maintenance_leases WHERE id=? AND token=?").bind(id,token).run(); }
export async function rememberQueryMatches(db:D1Database,topic:string,jobIds:string[]) {
  if(jobIds.length)await db.batch(jobIds.map(id=>db.prepare("INSERT OR IGNORE INTO query_job_matches(topic_id,job_id,matched_at) VALUES(?,?,?)").bind(topic,id,iso())));
}
export async function readCache(db: D1Database, input: Query, includeStale = false): Promise<Analysis> {
  const eligibility=`state='verified' AND extraction_version=1 AND verified_at>=? ${includeStale ? "" : "AND next_review_at>?"}`;
  const args=[new Date(Date.now()-90*86400000).toISOString(),...(!includeStale ? [iso()] : [])];
  // 查询关联单独读取，不被通用候选的300条上限或主分类遮掉；仍走相同的正文/筛选校验。
  const linked=await db.prepare(`SELECT * FROM job_documents WHERE ${eligibility} AND id IN (SELECT job_id FROM query_job_matches WHERE topic_id=?) ORDER BY verified_at DESC,id LIMIT 100`).bind(...args,await topicId(input)).all<StoredJob>();
  const rows=await db.prepare(`SELECT * FROM job_documents WHERE ${eligibility} ${input.city && input.city !== "全国远程" ? "AND city LIKE ?" : ""} ORDER BY verified_at DESC,id LIMIT 300`).bind(...args,...(input.city && input.city !== "全国远程" ? [`%${input.city}%`] : [])).all<StoredJob>();
  const candidates=new Map<string,StoredJob>();for(const row of [...linked.results,...rows.results])if(!candidates.has(row.id))candidates.set(row.id,row);
  return assembleStored(input,[...candidates.values()]);
}
export function assembleStored(input: Query, rows: StoredJob[]): Analysis {
  const docs: Document[] = [], extracted: Extraction = {jobs:[]}; const times = new Map<string,StoredJob>();
  for (const row of rows) {
    try { const job = JSON.parse(row.extraction_json) as Extraction["jobs"][number]; docs.push({id:row.id,url:row.url,title:row.title,body:row.body}); extracted.jobs.push({...job,documentId:row.id}); times.set(row.id,row); } catch { /* 损坏记录不参与结果 */ }
  }
  const result = assembleAnalysis(input,docs,extracted);
  result.jobs = result.jobs.slice(0,10).map(job=>({...job,verifiedAt:times.get(job.id)!.verified_at,evidenceStatus:"historical" as const}));
  const ids = new Set(result.jobs.map(job=>job.id));
  result.skills = result.skills.map(skill=>({...skill,evidence:skill.evidence.filter(e=>ids.has(e.jobId))})).filter(skill=>skill.evidence.length);
  result.warnings = result.warnings.filter(w=>!w.startsWith("部分页面"));
  if (result.jobs.length) result.warnings.unshift("复用历史已核验正文；本轮未重新打开这些页面。核验日期见各职位，不能据此确认当前仍在招聘。");
  result.storage = {mode:"database",cachedJobs:result.jobs.length,liveJobs:0,topicId:""};
  return result;
}
export async function saveVerified(db: D1Database, input: Query, docs: Document[], extraction: Extraction, result: Analysis) {
  const now = iso(); const saved = new Map<string,string>();
  const topic=result.jobs.length ? await recordTopic(db,input,false) : await topicId(input);
  for (const job of result.jobs) {
    const doc = docs.find(d=>d.id===job.id), raw = extraction.jobs.find(j=>j.documentId===job.id);
    if (!doc?.verified || !raw) continue;
    const url = canonicalUrl(job.url); if (!url) continue;
    const existing = await db.prepare("SELECT id,body_hash,stable_rounds,verified_at FROM job_documents WHERE url=?").bind(url).first<{id:string;body_hash:string;stable_rounds:number;verified_at:string}>();
    const id = existing?.id || await hash(job.company === "企业未注明" ? url : normalize(`${job.company}|${job.title}|${job.city}`));
    const bodyHash = await hash(doc.body), stable = existing?.body_hash === bodyHash ? Math.min(existing.stable_rounds+(Date.now()-Date.parse(existing.verified_at)>86400000?1:0),5) : 0;
    const category = classifyRole(job.title);
    const previous=await db.prepare("SELECT body_hash,extraction_json FROM job_documents WHERE id=?").bind(id).first<{body_hash:string;extraction_json:string}>();
    let oldEvidence:NonNullable<Extraction["jobs"][number]["roleEvidence"]>=[];
    if(previous?.body_hash===bodyHash)try{const stored=JSON.parse(previous.extraction_json);if(Array.isArray(stored.roleEvidence))oldEvidence=stored.roleEvidence.filter((e:NonNullable<Extraction["jobs"][number]["roleEvidence"]>[number])=>e&&typeof e.role==="string"&&roleEvidenceMatches(e.role,doc.body,e));}catch{/* 损坏的历史匹配依据不复用 */}
    const proof=new Map<string,NonNullable<Extraction["jobs"][number]["roleEvidence"]>[number]>();
    for(const evidence of [...raw.roleEvidence||[],...oldEvidence])if(!proof.has(evidence.role)&&roleEvidenceMatches(evidence.role,doc.body,evidence))proof.set(evidence.role,evidence);
    const payload = JSON.stringify({...raw,documentId:id,...proof.size?{roleEvidence:[...proof.values()].slice(0,20)}:{}});
    const hot = await db.prepare("SELECT hits FROM search_topics WHERE id=?").bind(await topicId(input)).first<{hits:number}>();
    const review = later(reviewDays(category.branch,stable,(hot?.hits || 0)>=10));
    await db.batch([
      db.prepare("INSERT INTO data_sources(id,name,url,license,status,notes,checked_at) VALUES(?,?,?,?,'verified_reference',?,?) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at").bind(new URL(url).hostname,new URL(url).hostname,new URL(url).origin,"招聘正文权利归原发布方","通过实时检索读取的来源；保留原链接和核验记录，不保证职位仍在招聘。",now),
      db.prepare(`INSERT INTO job_documents(id,url,title,company,city,experience,family,branch,source_id,body,body_hash,extraction_json,extraction_version,state,published_at,first_seen_at,verified_at,last_attempt_at,next_review_at,stable_rounds,failures) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,'verified',?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,company=excluded.company,city=excluded.city,experience=excluded.experience,family=excluded.family,branch=excluded.branch,source_id=excluded.source_id,body=excluded.body,body_hash=excluded.body_hash,extraction_json=excluded.extraction_json,extraction_version=1,state='verified',published_at=excluded.published_at,verified_at=excluded.verified_at,last_attempt_at=excluded.last_attempt_at,next_review_at=excluded.next_review_at,stable_rounds=excluded.stable_rounds,failures=0`).bind(id,url,job.title,job.company,job.city,job.experience,category.family,category.branch,new URL(url).hostname,doc.body,bodyHash,payload,job.publishedAt,now,now,now,review,stable),
      db.prepare("INSERT OR IGNORE INTO job_revisions(id,job_id,body_hash,body,extraction_json,verified_at) VALUES(?,?,?,?,?,?)").bind(await hash(id+bodyHash),id,bodyHash,doc.body,payload,now),
      db.prepare("INSERT INTO query_job_matches(topic_id,job_id,matched_at) VALUES(?,?,?) ON CONFLICT(topic_id,job_id) DO UPDATE SET matched_at=excluded.matched_at").bind(topic,id,now),
      db.prepare("UPDATE import_leads SET state='verified',last_attempt_at=? WHERE url=?").bind(now,url),
      db.prepare("UPDATE user_feedback SET status='reviewed',resolution=?,updated_at=? WHERE job_id=? AND status IN ('pending','retry')").bind(existing?.body_hash===bodyHash ? "已重新读取原文，正文未变化；反馈保留供继续核查。" : "已重新读取并提取原文，资料已更新；反馈保留。",now,id),
    ]);
    saved.set(job.id,id);
  }
  return saved;
}
export function mergeAnalysis(input: Query, cached: Analysis, live: Analysis): Analysis {
  const identity=(job:Analysis["jobs"][number])=>job.company === "企业未注明" ? job.url : normalize(`${job.company}|${job.title}|${job.city}`);
  const liveIdentities=new Set(live.jobs.map(identity));
  const retainedCachedIds=new Set(cached.jobs.filter(job=>!liveIdentities.has(identity(job))).map(job=>job.id));
  const jobs = new Map<string,Analysis["jobs"][number]>();
  for (const job of [...cached.jobs,...live.jobs]) {
    const key = job.company === "企业未注明" ? job.url : normalize(`${job.company}|${job.title}|${job.city}`);
    jobs.set(key,job);
  }
  const selected = [...jobs.values()].slice(0,10), ids = new Set(selected.map(j=>j.id));
  const skills = new Map<string,Analysis["skills"][number]>();
  const retainedCachedSkills=cached.skills.map(skill=>({...skill,evidence:skill.evidence.filter(e=>retainedCachedIds.has(e.jobId))}));
  for(const skill of [...retainedCachedSkills,...live.skills]) {
    const key=normalize(skill.name), old=skills.get(key) || {...skill,evidence:[]};
    for(const e of skill.evidence) if(ids.has(e.jobId) && !old.evidence.some(v=>v.jobId===e.jobId)) old.evidence.push(e);
    if(old.evidence.length) skills.set(key,old);
  }
  return {...input,retrievedAt:iso(),demo:false,jobs:selected,skills:[...skills.values()].sort((a,b)=>b.evidence.length-a.evidence.length),warnings:[...new Set([...cached.jobs.length ? cached.warnings : [],...live.warnings])],coverage:live.coverage,validation:live.validation,storage:{mode:cached.jobs.length ? "mixed" : "live",cachedJobs:selected.filter(j=>j.evidenceStatus==="historical").length,liveJobs:selected.filter(j=>j.evidenceStatus!=="historical").length,topicId:""}};
}
