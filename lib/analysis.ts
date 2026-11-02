import type { Analysis, Evidence, Job, Skill } from "./atlas";
export type Document = { id: string; url: string; title: string; body: string };
type ExtractedJob = { documentId: string; title: string; company: string; city: string; experience: string; publishedAt: string | null; metadataQuotes: { title: string; company: string; city: string; experience: string; publishedAt: string }; skills: { name: string; category: string; description: string; quote: string }[] };
export type Extraction = { jobs: ExtractedJob[] };
export const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
export function levelForQuote(quote: string): Evidence["level"] {
  if (/优先|加分|prefer|nice.to.have|a plus/i.test(quote)) return "优先";
  if (/必须|必备|要求掌握|熟练|精通|掌握|must|required/i.test(quote)) return "必备";
  return "未明确";
}
export function canonicalUrl(input: string) {
  try { const u = new URL(input); if (u.protocol !== "https:" || u.username || u.password || u.port || !u.hostname.includes(".") || /^\d/.test(u.hostname) || u.hostname.includes(":") || /\.(local|internal|test)$/.test(u.hostname)) return null;
    u.hash = ""; for (const key of [...u.searchParams.keys()]) if (/^(utm_|from$|source$|ref$|tracking|spm$)/i.test(key)) u.searchParams.delete(key); u.searchParams.sort(); return u.href.replace(/\/$/, "");
  } catch { return null; }
}
export function prepareDocuments(results: { url?: string; title?: string; raw_content?: string | null }[], domains: string[]): Document[] {
  const urls = new Set<string>(), bodies = new Set<string>(); const docs: Document[] = [];
  for (const result of results) {
    const url = canonicalUrl(result.url || ""); if (!url) continue;
    const host = new URL(url).hostname;
    if (!domains.some(d => host === d || host.endsWith(`.${d}`))) continue;
    const body = result.raw_content?.trim(); if (!body || body.length < 250 || !/任职要求|职位要求|岗位要求|任职资格|职位描述|Qualifications|Requirements/i.test(body) || /验证码.{0,12}(访问|验证)|请完成安全验证|访问过于频繁/.test(body)) continue;
    const fingerprint = normalize(body); if (urls.has(url) || bodies.has(fingerprint)) continue;
    urls.add(url); bodies.add(fingerprint); docs.push({ id: `j${docs.length + 1}`, url, title: (result.title || "").slice(0, 300), body: body.slice(0, 10000) });
    if (docs.length >= 10) break;
  }
  return docs;
}
const aliases: Record<string, string> = { python3: "Python", python: "Python", javascript: "JavaScript", js: "JavaScript", typescript: "TypeScript", ts: "TypeScript", reactjs: "React", "react.js": "React", react: "React", "vue.js": "Vue", vuejs: "Vue", vue: "Vue", golang: "Go", go: "Go", rag: "RAG", 检索增强生成: "RAG", "rag检索增强生成": "RAG", git: "Git", docker: "Docker", pytorch: "PyTorch" };
const cleanName = (s: string) => aliases[normalize(s)] || s.trim();
function attested(value: string, quote: string, body: string) { return !!value && !!quote && normalize(body).includes(normalize(quote)) && normalize(quote).includes(normalize(value)); }
export function assembleAnalysis(input: { role: string; city: string; experience: string }, docs: Document[], extraction: Extraction): Analysis {
  const jobs: Job[] = [], skills = new Map<string, Skill>(), fingerprints = new Set<string>(); const usedDocuments = new Set<string>();
  for (const candidate of extraction.jobs) {
    const doc = docs.find(d => d.id === candidate.documentId); if (!doc || usedDocuments.has(doc.id)) continue;
    const m = candidate.metadataQuotes;
    // 岗位名称必须在正文或页面标题中有原文依据，其他元信息缺失则展示未知。
    if (!attested(candidate.title, m.title, `${doc.title}\n${doc.body}`)) continue;
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
    const validSkills = candidate.skills.filter(s => s.quote.trim().length >= 5 && normalize(doc.body).includes(normalize(s.quote)));
    if (!validSkills.length) continue;
    fingerprints.add(fingerprint); usedDocuments.add(doc.id);
    const date = candidate.publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(candidate.publishedAt) && attested(candidate.publishedAt, m.publishedAt, doc.body) ? candidate.publishedAt : null;
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
