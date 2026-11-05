import type { Analysis, Evidence, Job, Skill } from "./atlas";
import { matchesRole as jobMatchesRole } from "./job-taxonomy.ts";
import { candidateRoleScore, roleKey, usefulDuty, type RoleIntent, type RoleEvidence } from "./role-intent.ts";
export type Document = { id: string; url: string; title: string; body: string; verified?: boolean };
type ExtractedJob = { documentId: string; title: string; company: string; city: string; experience: string; publishedAt: string | null; metadataQuotes: { title: string; company: string; city: string; experience: string; publishedAt: string }; skills: { name: string; category: string; description: string; quote: string }[]; roleEvidence?: RoleEvidence[] };
export type Extraction = { jobs: ExtractedJob[] };
export const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
export function levelForQuote(quote: string): Evidence["level"] {
  if (/优先|加分|prefer|nice.to.have|a plus/i.test(quote)) return "优先";
  if (/或|任选|任一|之一|one of|either/i.test(quote)) return "未明确";
  if (/必须|必备|要求掌握|熟练|精通|掌握|must|required/i.test(quote)) return "必备";
  return "未明确";
}
export function canonicalUrl(input: string) {
  try { const u = new URL(input); if (u.protocol !== "https:" || u.username || u.password || u.port || !u.hostname.includes(".") || /^\d/.test(u.hostname) || u.hostname.includes(":") || /\.(local|internal|test)$/.test(u.hostname)) return null;
    u.hash = ""; for (const key of [...u.searchParams.keys()]) if (/^(utm_|from$|source$|ref$|tracking|spm$|pgRef$|recomId$|sourceJobId$)/i.test(key)) u.searchParams.delete(key);
    if (/(^|\.)liepin\.com$/.test(u.hostname) && /^\/(?:job|a)\/\d+\.shtml$/.test(u.pathname)) u.hostname = "www.liepin.com";
    if (/(^|\.)zhaopin\.com$/.test(u.hostname) && /^\/(?:jobs|jobdetail)\/CC[^/]+\.html?$/.test(u.pathname)) { u.hostname = "www.zhaopin.com"; u.pathname = u.pathname.replace(/^\/jobs\//, "/jobdetail/"); }
    u.searchParams.sort(); return u.href.replace(/\/$/, "");
  } catch { return null; }
}
export function isRecruitmentDetailUrl(url: string) {
  const u = new URL(url), host = u.hostname, path = u.pathname;
  if (path === "/" || /\/(?:search|login|signin|passport)(?:[/.]|$)/i.test(path)) return false;
  if (/(^|\.)zhipin\.com$/.test(host)) return /^\/job_detail\/[^/]+\.html$/.test(path);
  if (/(^|\.)liepin\.com$/.test(host)) return /^\/(?:job|a)\/\d+\.shtml$/.test(path);
  if (/(^|\.)zhaopin\.com$/.test(host)) return /^\/(?:jobdetail|jobs)\/[^/]+\.html?$/.test(path);
  if (/(^|\.)lagou\.com$/.test(host)) return /^\/?(?:wn\/)?jobs\/\d+\.html$/.test(path);
  return !/\/(?:position|positions|jobs?|careers?|[^/]*(?:list|search|index|home))(?:\.[a-z]+)?\/?$/i.test(path);
}
export type DocumentAudit = { candidates: number; invalidUrl: number; offSource: number; notDetail: number; noBody: number; blocked: number; duplicate: number; overLimit: number };
export const blockedContent = (body: string) => /验证码.{0,12}(访问|验证)|请完成安全验证|访问过于频繁|滑动.{0,8}验证|访问受限/.test(body);
export function inspectDocuments(results: { url?: string; title?: string; raw_content?: string | null; verified?: boolean }[], domains: string[], input?: { role: string; city: string; experience: string }, intent?:RoleIntent|null) {
  const audit: DocumentAudit = { candidates: results.length, invalidUrl: 0, offSource: 0, notDetail: 0, noBody: 0, blocked: 0, duplicate: 0, overLimit: 0 };
  const urls = new Set<string>(), bodies = new Set<string>(); const docs: Document[] = [];
  for (const result of results) {
    const url = canonicalUrl(result.url || ""); if (!url) { audit.invalidUrl++; continue; }
    const host = new URL(url).hostname;
    if (!domains.some(d => host === d || host.endsWith(`.${d}`))) { audit.offSource++; continue; }
    if (!isRecruitmentDetailUrl(url)) { audit.notDetail++; continue; }
    const body = typeof result.raw_content === "string" ? result.raw_content.trim() : undefined;
    if (body && blockedContent(body)) { audit.blocked++; continue; }
    if (!body || body.length < 250 || !/任职要求|职位要求|岗位要求|任职资格|职位描述|Qualifications|Requirements/i.test(body)) { audit.noBody++; continue; }
    const fingerprint = normalize(body); if (urls.has(url) || bodies.has(fingerprint)) { audit.duplicate++; continue; }
    urls.add(url); bodies.add(fingerprint); docs.push({ id: "", url, title: (result.title || "").slice(0, 300), body: body.slice(0, 10000), ...(result.verified ? { verified: true } : {}) });
  }
  // 来源轮换，防止第一家网站占满全部正文名额；不放宽真实性条件。
  const groups = new Map<string, Document[]>();
  for (const doc of docs) { const host = new URL(doc.url).hostname; const source = domains.find(d => host === d || host.endsWith(`.${d}`))!; if (!groups.has(source)) groups.set(source, []); groups.get(source)!.push(doc); }
  if (input) {
    const score = (doc: Document) => {
      const text = normalize(doc.body).replace(/[–—~至]/g, "-");
      const core = normalize(input.role).replace(/工程师|高级|开发/g, "");
      return candidateRoleScore(input.role,doc.title,doc.body,intent)+(core && normalize(doc.title).includes(core) ? 6 : 0) + (jobMatchesRole(input.role, doc.title,doc.body) ? 10 : 0) + (input.city && text.includes(normalize(input.city)) ? 4 : 0) + (input.experience && text.includes(normalize(input.experience).replace(/[–—~至]/g, "-")) ? 4 : 0);
    };
    for (const group of groups.values()) group.sort((a, b) => score(b) - score(a));
  }
  const selected: Document[] = [];
  // 先轮换有职业相关信号的来源，再补不确定候选，避免无关技术公司占满读取名额。
  const relevant=(doc:Document)=>!!input&&(jobMatchesRole(input.role,doc.title,doc.body)||candidateRoleScore(input.role,doc.title,doc.body,intent)>0);
  const pools=input ? [[...groups.values()].map(group=>group.filter(relevant)),[...groups.values()].map(group=>group.filter(doc=>!relevant(doc)))] : [[...groups.values()]];
  for(const pool of pools)while(selected.length<10&&pool.some(group=>group.length))for(const group of pool){const doc=group.shift();if(doc&&selected.length<10)selected.push({...doc,id:`j${selected.length+1}`});}
  audit.overLimit = docs.length - selected.length;
  return { documents: selected, audit };
}
export function prepareDocuments(results: { url?: string; title?: string; raw_content?: string | null }[], domains: string[]): Document[] { return inspectDocuments(results, domains).documents; }
const aliases: Record<string, string> = { python3: "Python", python: "Python", javascript: "JavaScript", js: "JavaScript", typescript: "TypeScript", ts: "TypeScript", reactjs: "React", "react.js": "React", react: "React", "vue.js": "Vue", vuejs: "Vue", vue: "Vue", golang: "Go", go: "Go", rag: "RAG", 检索增强生成: "RAG", "rag检索增强生成": "RAG", git: "Git", docker: "Docker", pytorch: "PyTorch" };
const cleanName = (s: string) => aliases[normalize(s)] || s.trim();
function attested(value: string, quote: string, body: string) { return !!value && !!quote && normalize(body).includes(normalize(quote)) && normalize(quote).includes(normalize(value)); }
export function sourceQuote(body: string, quote: string) {
  if (body.includes(quote)) return quote;
  const target = normalize(quote); if (!target || !normalize(body).includes(target)) return null;
  let normalized = "", offset = 0; const starts: number[] = [], ends: number[] = [];
  for (const char of body) {
    const value = normalize(char);
    for (let i = 0; i < value.length; i++) { starts.push(offset); ends.push(offset + char.length); }
    normalized += value; offset += char.length;
  }
  const index = normalized.indexOf(target); if (index < 0) return null;
  const original = body.slice(starts[index], ends[index + target.length - 1]);
  return normalize(original) === target ? original : null;
}
export function skillSupported(name: string, quote: string) {
  const canonical = normalize(cleanName(name));
  const terms = [name, ...Object.keys(aliases).filter(key => normalize(aliases[key]) === canonical)];
  const text = normalize(quote);
  return terms.some(term => {
    const token = normalize(term); if (!token) return false;
    let at = text.indexOf(token);
    while (at >= 0) {
      // 技术缩写须独立出现，例如 Java 不可匹配 JavaScript，Go 不可匹配 Django。
      if (!/^[a-z0-9]/.test(token) || ((!at || !/[a-z0-9_]/.test(text[at - 1])) && !/[a-z0-9_]/.test(text[at + token.length] || ""))) return true;
      at = text.indexOf(token, at + 1);
    }
    return false;
  });
}
export { jobMatchesRole };
export function roleEvidenceMatches(role:string,body:string,evidence:RoleEvidence){
  return evidence&&typeof evidence.role==="string"&&evidence.role===roleKey(role)&&typeof evidence.duty==="string"&&usefulDuty(evidence.duty)&&typeof evidence.quote==="string"&&evidence.quote.trim().length>=8&&evidence.quote.length<=500&&!!sourceQuote(body,evidence.quote)&&normalize(evidence.quote).includes(normalize(evidence.duty));
}
export function assembleAnalysis(input: { role: string; city: string; experience: string }, docs: Document[], extraction: Extraction): Analysis {
  const jobs: Job[] = [], skills = new Map<string, Skill>(), fingerprints = new Set<string>(); const usedDocuments = new Set<string>();
  for (const candidate of extraction.jobs) {
    const doc = docs.find(d => d.id === candidate.documentId); if (!doc || usedDocuments.has(doc.id)) continue;
    const m = candidate.metadataQuotes;
    // 岗位名必须出现在职位正文；搜索引擎标题不单独作为原文证据。
    const roleMatched=jobMatchesRole(input.role,candidate.title,doc.body)||(Array.isArray(candidate.roleEvidence)&&candidate.roleEvidence.some(evidence=>roleEvidenceMatches(input.role,doc.body,evidence)));
    if (!attested(candidate.title, m.title, doc.body) || !roleMatched) continue;
    const company = attested(candidate.company, m.company, doc.body) ? candidate.company : "企业未注明";
    const city = attested(candidate.city, m.city, doc.body) ? candidate.city : "城市未注明";
    const experience = attested(candidate.experience, m.experience, doc.body) ? candidate.experience : "经验未注明";
    // 筛选条件需有正文支撑；未知不能当作匹配。
    if (input.city && input.city !== "全国远程" && !city.includes(input.city)) continue;
    if (input.city === "全国远程" && !/远程|remote/i.test(doc.body)) continue;
    if (input.experience) {
      const key = input.experience.replace(/\s/g, "");
      const exp = experience.replace(/[–—~至]/g, "-").replace(/\s/g, "");
      if (key === "实习/应届" ? !/实习|应届|校招|毕业生/.test(`${candidate.title}${experience}`) : key === "5年以上" ? !/(?:[5-9]|\d{2})年(?:以上|及以上)|(?:[5-9])-\d+年/.test(exp) : !exp.includes(key.replace("–", "-"))) continue;
    }
    const fingerprint = company === "企业未注明" ? normalize(doc.body) : normalize(`${company}|${candidate.title}|${city}`);
    if (fingerprints.has(fingerprint)) continue;
    const validSkills = candidate.skills.flatMap(s => {
      const quote = s.quote.trim().length >= 5 ? sourceQuote(doc.body, s.quote) : null;
      return quote && skillSupported(s.name, quote) ? [{ ...s, quote }] : [];
    });
    if (!validSkills.length) continue;
    // 明确指定技术的岗位不能仅凭通用岗位名混入另一技术栈。
    const requiredTechnology = ["Python", "Java", "JavaScript", "TypeScript", "React", "Vue", "Golang"].find(technology => new RegExp(`(?:^|[^a-z])${technology}(?:$|[^a-z])`, "i").test(input.role));
    if (requiredTechnology && !validSkills.some(skill => normalize(cleanName(skill.name)) === normalize(cleanName(requiredTechnology)))) continue;
    fingerprints.add(fingerprint); usedDocuments.add(doc.id);
    const rawDate = candidate.publishedAt;
    const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate)) && new Date(rawDate).toISOString().slice(0, 10) === rawDate && rawDate <= new Date().toISOString().slice(0, 10) && attested(rawDate, m.publishedAt, doc.body) ? rawDate : null;
    jobs.push({ id: doc.id, title: candidate.title, company, city, experience, url: doc.url, publishedAt: date });
    for (const s of validSkills) {
      const name = cleanName(s.name), key = normalize(name); if (!name) continue;
      let skill = skills.get(key); if (!skill) { skill = { id: `s${skills.size + 1}`, name, category: s.category, description: s.description, evidence: [] }; skills.set(key, skill); }
      if (!skill.evidence.some(e => e.jobId === doc.id)) skill.evidence.push({ jobId: doc.id, quote: s.quote, level: levelForQuote(s.quote) });
    }
  }
  const warnings = ["搜索引擎收录可能有延迟；本次结果不保证职位仍在招聘。技能分类和描述经 AI 整理，请结合原文判断。"];
  if (jobs.length < 5) warnings.unshift("有效样本较少，当前清单仅供了解本次职位要求，无法代表岗位的完整技能范围。");
  const companies = new Set(jobs.filter(j => j.company !== "企业未注明").map(j => j.company));
  if (jobs.length > 0 && companies.size < 3) warnings.push("样本企业覆盖有限，可能偏向少数企业的要求。");
  if (docs.length > jobs.length) warnings.push("部分页面因岗位不符、筛选条件无依据、重复或缺少有效技能证据而排除。");
  return { ...input, retrievedAt: new Date().toISOString(), demo: false, jobs, skills: [...skills.values()].sort((a, b) => b.evidence.length - a.evidence.length), warnings };
}
