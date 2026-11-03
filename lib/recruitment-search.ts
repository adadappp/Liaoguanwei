// 仅使用搜索供应商返回的页面正文，不使用 snippet / summary 代替原文。
export type SearchResult = { url?: string; title?: string; raw_content?: string | null };
export type JsonRequest = (url: string, key: string, data: unknown, signal: AbortSignal) => Promise<unknown>;
export type SearchProvider = "deepseek" | "tavily";

export async function searchRecruitment(
  provider: SearchProvider, key: string, input: { role: string; city: string; experience: string },
  domains: string[], signal: AbortSignal, request: JsonRequest,
): Promise<SearchResult[]> {
  const query = `中国大陆 ${input.role} ${input.city} ${input.experience} 招聘 任职要求 职位详情`;
  if (provider === "tavily") {
    const response = await request("https://api.tavily.com/search", key, {
      query, search_depth: "advanced", max_results: 15, include_raw_content: "text",
      include_answer: false, include_domains: domains,
    }, signal) as { results?: SearchResult[] };
    if (!Array.isArray(response.results)) throw new Error("招聘搜索服务返回格式异常，请稍后重试。");
    return response.results;
  }
  // 官方 Search API 的 query 上限为 128 个 Unicode 字符；多取候选再按来源白名单过滤。
  const response = await request("https://api.deepseek.com/v1/tools/search", key, {
    query: Array.from(query).slice(0, 128).join(""), count: 30, need_content: true,
  }, signal) as { results?: { url?: unknown; title?: unknown; content?: unknown }[] };
  if (!Array.isArray(response.results)) throw new Error("招聘搜索服务返回格式异常，请稍后重试。");
  return response.results.map(result => ({
    url: typeof result.url === "string" ? result.url : "",
    title: typeof result.title === "string" ? result.title : "",
    raw_content: typeof result.content === "string" ? result.content : null,
  }));
}
