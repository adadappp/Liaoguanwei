# 真实招聘检索接入

## 本次决定

面向大陆技术岗位求职者，以招聘原文生成可追溯技能清单，再由用户自行选择学习任务。不做能力评分或自动投递。首版维持仅所有者使用、浏览器本地计划、90 秒服务端超时及试用级限流。

用户已有 DeepSeek API，因此优先采用官方 Search API（need_content=true）与模型共用服务端密钥；已有 Tavily 通道保留为备选。无需新增抓取框架或模型 SDK，直接使用 Worker 原生 fetch，避免引入无关依赖。第三方模型端点的密钥不会自动发送给 DeepSeek 官方。

## 配置

服务端填写 MODEL_API_KEY。默认模型为 deepseek-flash，MODEL_API_URL 为 https://api.deepseek.com/chat/completions；可通过 MODEL_NAME 覆盖。SEARCH_PROVIDER=deepseek 时可选独立 DEEPSEEK_API_KEY，否则复用官方模型密钥。SEARCH_PROVIDER=tavily 时必须填写 TAVILY_API_KEY。

本地使用已忽略的 .dev.vars，线上使用 Sites secret 环境变量。禁止把密钥写进前端、提交 Git 或输出到日志。更新线上变量后重新部署才能生效。

## 数据与限制

DeepSeek 一次搜索最多取 30 个候选，应用按既有 HTTPS 来源白名单过滤，最多使用 10 份有效正文。只使用 content，不使用 snippet 或 summary 替代正文；无正文或遇到验证页面时排除。原文校验、去重、筛选和频率分母沿用既有逻辑。搜索内容为空或来源不可读时不会虚构补齐。

官方接口存在不代表每个招聘网站都可读，也不代表已获得数据授权。搜索及模型请求可能产生费用。真实来源质量、网络可达性和账户权限须在配置后实测。

## 验证

离线测试覆盖 DeepSeek 正文映射、摘要排除、来源过滤、Unicode 查询长度、损坏响应及 Tavily 兼容。离线测试不代表供应商或真实招聘链路验收。配置密钥后至少以两个具体岗位检索，人工逐项核对原文、岗位匹配、城市经验、来源链接及样本去重。

参考： https://api-docs.deepseek.com/guides/search/ 、https://api-docs.deepseek.com/guides/json_mode/ 、https://docs.tavily.com/documentation/api-reference/endpoint/search
