export const TAXONOMY = [
  ["engineering", null, "技术研发", "中国大陆 AI 与互联网技术岗位"],
  ["ai", "engineering", "AI 与算法", "模型、算法及应用研发"],
  ["ai.application", "ai", "大模型应用", "LLM、RAG、Agent 与 AI 应用"],
  ["ai.algorithm", "ai", "算法与机器学习", "机器学习、推荐、视觉与自然语言"],
  ["software", "engineering", "软件开发", "产品与服务软件研发"],
  ["software.frontend", "software", "前端开发", "Web 前端与交互开发"],
  ["software.backend", "software", "后端开发", "Java、Python、Go 等后端服务"],
  ["software.mobile", "software", "移动开发", "Android、iOS 与跨平台移动开发"],
  ["software.fullstack", "software", "全栈开发", "前后端综合研发"],
  ["data", "engineering", "数据技术", "数据平台与分析"],
  ["data.engineering", "data", "数据工程", "数据开发、数仓与大数据平台"],
  ["data.analysis", "data", "数据分析", "数据分析、BI 与数据科学"],
  ["infrastructure", "engineering", "基础设施", "质量、运维与安全"],
  ["infrastructure.platform", "infrastructure", "运维与云平台", "DevOps、SRE、云原生与运维"],
  ["infrastructure.testing", "infrastructure", "测试开发", "测试与质量工程"],
  ["infrastructure.security", "infrastructure", "安全工程", "网络、应用与数据安全"],
  ["other", "engineering", "其他技术岗位", "保留原始岗位名，待完善分类"],
] as const;
export function classifyRole(title: string) {
  const rules: [RegExp, string][] = [
    [/大模型|LLM|RAG|智能体|agent|AI\s*应用/i, "ai.application"],
    [/算法|机器学习|深度学习|计算机视觉|自然语言|NLP|algorithm|machine.?learning/i, "ai.algorithm"],
    [/全栈|full.?stack/i, "software.fullstack"], [/前端|front.?end/i, "software.frontend"],
    [/Android|iOS|移动开发|Flutter/i, "software.mobile"], [/数据工程|大数据|数仓|数据开发|数据平台|ETL/i, "data.engineering"],
    [/数据分析|数据科学|商业智能|data.?analy|data.?scien/i, "data.analysis"],
    [/安全|security/i, "infrastructure.security"], [/测试|test|QA/i, "infrastructure.testing"],
    [/运维|DevOps|SRE|云平台|云原生/i, "infrastructure.platform"],
    [/后端|服务端|Java|Python|Golang|back.?end|软件开发|软件工程/i, "software.backend"],
  ];
  const branch = rules.find(([pattern]) => pattern.test(title))?.[1] || "other";
  return { family: branch.split(".")[0], branch };
}
export const normalizeRole = (role: string) => role.normalize("NFKC").toLowerCase().replace(/[\s·_-]/g, "");
export function cacheRoleMatches(role: string, title: string) {
  const target = classifyRole(role), actual = classifyRole(title);
  // 一个AI应用职位也可能明确承担前/后端职责；主分类不能遮掉已经满足原岗位的证据。
  if(actual.family==="ai" && target.branch==="software.frontend" && /前端|front.?end/i.test(title)) return true;
  if(actual.family==="ai" && target.branch==="software.backend" && /后端|服务端|back.?end|Python|Java|Golang/i.test(title)) return true;
  if (target.branch !== "other") return target.branch === actual.branch || (target.branch === "software.frontend" && actual.branch === "software.fullstack");
  const core = normalizeRole(role).replace(/工程师|高级|开发/g, "");
  return core.length >= 2 && normalizeRole(title).includes(core);
}
export function reviewDays(branch: string, stableRounds = 0, hot = false) {
  const base = branch.startsWith("ai.") ? 7 : 30;
  return Math.min(90, Math.max(3, Math.round(base * (hot ? 0.5 : 1) * Math.pow(1.5, Math.min(stableRounds, 3)))));
}
