import type { Analysis } from "./atlas";
export function demoAnalysis(): Analysis {
  return { role: "AI 应用开发工程师", city: "不限城市", experience: "不限经验", retrievedAt: "", demo: true, warnings: ["这是 3 条虚构职位构成的演示样本，用于体验操作，不代表真实招聘需求或市场统计。"], jobs: [
    { id: "d1", title: "AI 应用开发工程师", company: "示例企业 A", city: "上海", experience: "1–3 年", url: "", publishedAt: null },
    { id: "d2", title: "大模型应用工程师", company: "示例企业 B", city: "北京", experience: "经验不限", url: "", publishedAt: null },
    { id: "d3", title: "AI 后端开发工程师", company: "示例企业 C", city: "深圳", experience: "1–3 年", url: "", publishedAt: null },
  ], skills: [
    { id: "python", name: "Python", category: "编程基础", description: "编写清晰、可维护的 Python 程序，理解常用数据结构与异步调用。", evidence: [{ jobId: "d1", quote: "熟练使用 Python，具备良好的代码习惯。", level: "必备" }, { jobId: "d2", quote: "熟悉 Python，能够独立完成接口开发。", level: "未明确" }, { jobId: "d3", quote: "掌握 Python 及常用 Web 框架。", level: "必备" }] },
    { id: "llm", name: "大模型 API 与应用开发", category: "AI 与模型", description: "理解大模型调用流程、上下文管理与流式输出，构建可用的 AI 应用。", evidence: [{ jobId: "d1", quote: "熟悉大模型 API 调用及应用开发流程。", level: "未明确" }, { jobId: "d2", quote: "具备大模型接口集成经验。", level: "必备" }, { jobId: "d3", quote: "具备大模型 API 集成经验者优先。", level: "优先" }] },
    { id: "rag", name: "RAG 检索增强生成", category: "AI 与模型", description: "了解文档处理、向量检索与生成链路，能够搭建知识库问答应用。", evidence: [{ jobId: "d1", quote: "掌握 RAG 应用开发，熟悉向量数据库。", level: "必备" }, { jobId: "d2", quote: "有 RAG 知识库项目经验者优先。", level: "优先" }] },
    { id: "prompt", name: "Prompt 设计与评估", category: "AI 与模型", description: "设计任务指令，通过测试样例检查模型输出的稳定性与质量。", evidence: [{ jobId: "d1", quote: "具备 Prompt 设计和输出效果评估能力。", level: "未明确" }, { jobId: "d2", quote: "熟悉 Prompt 设计，能够评估模型输出。", level: "未明确" }] },
    { id: "api", name: "后端接口开发", category: "工程实践", description: "设计和实现 HTTP 接口，处理校验、异常和服务间调用。", evidence: [{ jobId: "d2", quote: "熟悉 Python，能够独立完成接口开发。", level: "未明确" }, { jobId: "d3", quote: "掌握 Python 及常用 Web 框架。", level: "必备" }] },
    { id: "git", name: "Git 与团队协作", category: "工程实践", description: "使用版本控制管理代码，通过清晰的提交和评审完成协作。", evidence: [{ jobId: "d3", quote: "熟悉 Git 工作流，具备团队协作经验。", level: "未明确" }] },
    { id: "problem", name: "问题分析与沟通", category: "通用能力", description: "理解业务需求，拆解问题，清楚表达技术方案与取舍。", evidence: [{ jobId: "d1", quote: "具备良好的问题分析和沟通能力。", level: "未明确" }] },
  ] };
}
