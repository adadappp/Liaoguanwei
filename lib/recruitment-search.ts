// 仅使用搜索供应商返回的页面正文，不使用 snippet / summary 代替原文。
import { canonicalUrl, isRecruitmentDetailUrl, prepareDocuments, inspectDocuments, blockedContent, type Document } from "./analysis.ts";
import { roleConcept } from "./role-concepts.ts";
import { candidateRoleScore, intentTerms, type RoleIntent } from "./role-intent.ts";
export type SearchResult = { url?: string; title?: string; raw_content?: string | null; verified?: boolean };
export type JsonRequest = (url: string, key: string, data: unknown, signal: AbortSignal) => Promise<unknown>;
export type SearchProvider = "deepseek" | "tavily";
export type SearchAudit = { searchRequests: number; failedSearches: number; bodyFetches: number; failedFetches: number };
export function recruitmentQueries(input: { role: string; city: string; experience: string }, domains: string[],intent?:RoleIntent|null) {
  const concept=roleConcept(input.role);
  const variants=intentTerms(input.role,intent);
  const terms=intent ? [variants[0],variants[1]||input.role,variants[2]||`${intent.canonicalTitle} ${intent.duties[0]}`] : concept?.searchTerms;
  const makeBase=(role:string)=>{const suffix=` ${input.city} ${input.experience} 中国大陆 招聘 任职要求`;return `${Array.from(role).slice(0,110-Array.from(suffix).length).join("")}${suffix}`.trim();};
  const base = makeBase(terms?.[0]||input.role);
  const groups = [domains.filter(d => /^(zhipin|zhaopin|liepin|51job|lagou)\./.test(d)), domains.filter(d => !/^(zhipin|zhaopin|liepin|51job|lagou)\./.test(d))];
  const targets=terms && intent?.sector!=="technical" ? [groups[0],groups[0]] : groups;
  return [base, ...targets.map((group,index) => {
    const variant=terms ? makeBase(terms[index+1]) : base;
    let suffix = "";
    for (const domain of group) { const next = suffix ? `${suffix} OR site:${domain}` : `site:${domain}`; if (Array.from(`${variant} ${next}`).length <= 128) suffix = next; }
    return suffix ? `${variant} ${suffix}` : terms ? variant : "";
  }).filter(Boolean)];
}

export async function searchRecruitment(
  provider: SearchProvider, key: string, input: { role: string; city: string; experience: string },
  domains: string[], signal: AbortSignal, request: JsonRequest, audit: SearchAudit = { searchRequests: 0, failedSearches: 0, bodyFetches: 0, failedFetches: 0 },intent?:RoleIntent|null,
): Promise<SearchResult[]> {
  const concept=roleConcept(input.role);
  const query = `中国大陆 ${intent ? intentTerms(input.role,intent).slice(0,3).join(" OR ") : concept ? `(${concept.searchTerms.map(term=>`(${term})`).join(" OR ")})` : input.role} ${input.city} ${input.experience} 招聘 任职要求 职位详情`;
  if (provider === "tavily") {
    audit.searchRequests++;
    const response = await request("https://api.tavily.com/search", key, {
      query, search_depth: "advanced", max_results: 15, include_raw_content: "text",
      include_answer: false, include_domains: domains,
    }, signal) as { results?: SearchResult[] };
    if (!Array.isArray(response.results)) throw new Error("招聘搜索服务返回格式异常，请稍后重试。");
    return response.results;
  }
  // 官方 Search API 的 query 上限为 128 个 Unicode 字符；多取候选再按来源白名单过滤。
  async function search(query: string): Promise<SearchResult[]> {
    audit.searchRequests++;
    try {
      const response = await request("https://api.deepseek.com/v1/tools/search", key, { query, count: 30, need_content: true }, signal) as { results?: { url?: unknown; title?: unknown; content?: unknown }[] };
      if (!Array.isArray(response?.results)) throw new Error("招聘搜索服务返回格式异常，请稍后重试。");
      return response.results.map(result => ({ url: typeof result?.url === "string" ? result.url : "", title: typeof result?.title === "string" ? result.title : "", raw_content: typeof result?.content === "string" ? result.content : null }));
    } catch (error) { audit.failedSearches++; throw error; }
  }
  const queries = recruitmentQueries(input, domains,intent);
  const results = await search(queries[0]);
  const primary = intent ? inspectDocuments(results,domains,input,intent).documents.filter(doc=>candidateRoleScore(input.role,doc.title,doc.body,intent)>0) : prepareDocuments(results, domains);
  const sources = new Set(primary.map(doc => { const host = new URL(doc.url).hostname; return domains.find(domain => host === domain || host.endsWith(`.${domain}`)); }));
  if (primary.length < 8 || sources.size < 3) {
    const extra = await Promise.allSettled(queries.slice(1, 3).map(search));
    for (const item of extra) if (item.status === "fulfilled") results.push(...item.value);
  }
  if (signal.aborted) throw new Error("本次招聘检索已取消或超时。");
  // 同一个链接最多补读一次，最多4次；仅访问白名单职位详情，不重试验证页面。
  const seen = new Set<string>(); const missing: SearchResult[] = [];
  for (const item of results) {
    const url = canonicalUrl(item.url || ""); if (!url || seen.has(url)) continue; seen.add(url);
    const host = new URL(url).hostname;
    if ((!item.raw_content || item.raw_content.trim().length < 250) && !blockedContent(item.raw_content || "") && domains.some(d => host === d || host.endsWith(`.${d}`)) && isRecruitmentDetailUrl(url)) missing.push(item);
  }
  await Promise.all(missing.slice(0, 4).map(async item => {
    audit.bodyFetches++;
    try {
      const page = await request("https://api.deepseek.com/v1/tools/fetch", key, { url: canonicalUrl(item.url!) }, signal) as { content?: unknown };
      if (typeof page?.content === "string" && page.content.trim()) { item.raw_content = page.content; item.verified = true; } else audit.failedFetches++;
    } catch { audit.failedFetches++; }
  }));
  if (signal.aborted) throw new Error("本次招聘检索已取消或超时。");
  return results;
}

export async function verifyRecruitmentDocuments(provider: SearchProvider, key: string, docs: Document[], domains: string[], signal: AbortSignal, request: JsonRequest, audit: SearchAudit): Promise<SearchResult[]> {
  const results: SearchResult[] = []; let next = 0;
  const selected = docs.slice(0, 10);
  await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
    while (next < selected.length && !signal.aborted) {
      const doc = selected[next++]; const url = canonicalUrl(doc.url); if (!url) continue;
      const host = new URL(url).hostname;
      if (!domains.some(domain => host === domain || host.endsWith(`.${domain}`)) || !isRecruitmentDetailUrl(url)) continue;
      if (doc.verified) { results.push({ url, title: doc.title, raw_content: doc.body, verified: true }); continue; }
      audit.bodyFetches++;
      try {
        let body: unknown;
        if (provider === "deepseek") {
          const page = await request("https://api.deepseek.com/v1/tools/fetch", key, { url }, signal) as { content?: unknown };
          body = page?.content;
        } else {
          const page = await request("https://api.tavily.com/extract", key, { urls: [url], extract_depth: "advanced", format: "markdown" }, signal) as { results?: SearchResult[] };
          body = page?.results?.find(result => canonicalUrl(result.url || "") === url)?.raw_content;
        }
        const verified = typeof body === "string" ? prepareDocuments([{ url, title: doc.title, raw_content: body }], domains)[0] : undefined;
        if (verified) results.push({ url, title: doc.title, raw_content: verified.body, verified: true }); else audit.failedFetches++;
      } catch (error) {
        if ([401, 402, 403].includes((error as { status?: number })?.status || 0)) throw error;
        audit.failedFetches++;
      }
    }
  }));
  if (signal.aborted) throw new Error("本次招聘正文复核已取消或超时。");
  return results;
}
