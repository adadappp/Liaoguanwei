import type { Analysis } from "./atlas.ts";
import { runRecruitment } from "./recruitment-service.ts";
import { acquireLease, claimBudget, iso, later, mergeAnalysis, readCache, recordTopic, releaseLease, saveVerified, topicId, type Query } from "./job-store.ts";
export async function searchAtlas(db: D1Database | undefined, input: Query, signal: AbortSignal, force = false): Promise<Analysis> {
  let cached: Analysis | undefined, topic = await topicId(input), databaseFailed = false;
  if(db) {
    try { topic = await recordTopic(db,input,!force); cached = await readCache(db,input); }
    catch { databaseFailed = true; }
  }
  const decorate = (result: Analysis) => { if(result.storage) result.storage.topicId=topic; return result; };
  if(!force && cached && cached.jobs.length>=5) return decorate(cached);
  let lease: string | null = null;
  if(db && !databaseFailed) {
    try { lease=await acquireLease(db,`query:${topic}`); } catch { databaseFailed=true; }
    if(!lease && !databaseFailed) {
      if(cached?.jobs.length) { cached.warnings.unshift("同条件的补充检索正在进行，先展示库内资料。"); return decorate(cached); }
      throw new Error("相同条件正在检索，请稍后再试。");
    }
  }
  try {
    if(db && !databaseFailed) {
      const recent = await db.prepare("SELECT next_search_at FROM search_topics WHERE id=?").bind(topic).first<{next_search_at:string|null}>();
      if(!force && recent?.next_search_at && recent.next_search_at>iso()) {
        if(cached) { cached.warnings.unshift("该条件近期已补充检索；为避免重复付费，暂用已有资料。资料不足不代表市场没有招聘。"); return decorate(cached); }
      }
      if(!await claimBudget(db,"live-search",40)) {
        if(cached?.jobs.length) { cached.warnings.unshift("今日检索预算已用完，先展示历史已核验资料。"); return decorate(cached); }
        throw new Error("今日实时检索预算已用完，请明日再试。");
      }
      // 失败也保留短退避，避免同一失败查询连续付费。
      await db.prepare("UPDATE search_topics SET last_search_at=?,next_search_at=? WHERE id=?").bind(iso(),new Date(Date.now()+15*60000).toISOString(),topic).run();
    }
    const live=await runRecruitment(input,signal);
    if(db && !databaseFailed) {
      try {
        const ids=await saveVerified(db,input,live.docs,live.extraction,live.analysis);
        live.analysis.jobs=live.analysis.jobs.map(j=>({...j,id:ids.get(j.id)||`live:${j.id}`,verifiedAt:iso(),evidenceStatus:"current"}));
        live.analysis.skills=live.analysis.skills.map(s=>({...s,evidence:s.evidence.map(e=>({...e,jobId:ids.get(e.jobId)||`live:${e.jobId}`}))}));
        await db.prepare("UPDATE search_topics SET next_search_at=? WHERE id=?").bind(live.analysis.jobs.length>=5 ? later(1) : new Date(Date.now()+6*3600000).toISOString(),topic).run();
      } catch { live.analysis.warnings.push("本次资料已核验，但数据库写入未完成，后续查询可能需要重新检索。"); }
    } else live.analysis.warnings.push("职位数据库暂不可用，本次采用实时检索，资料未积累入库。");
    const result=cached ? mergeAnalysis(input,cached,live.analysis) : {...live.analysis,storage:{mode:"live" as const,cachedJobs:0,liveJobs:live.analysis.jobs.length,topicId:topic}};
    return decorate(result);
  } catch(error) {
    if(cached?.jobs.length && !signal.aborted) { cached.warnings.unshift(`补充检索未完成：${error instanceof Error ? error.message : "服务暂不可用"} 当前仅展示库内资料。`); return decorate(cached); }
    throw error;
  } finally { if(db && lease) await releaseLease(db,`query:${topic}`,lease).catch(()=>{}); }
}
