export const SOURCE_CATALOG = [
  {id:"kaggle-lagou",name:"Lagou Tech Jobs Scraper / logiover",url:"https://www.kaggle.com/datasets/logiover/lagou-tech-jobs-scraper-data",license:"CC BY-SA 4.0",status:"leads_only",notes:"2026-05-15 静态样本100条，全部缺少jobDescription。仅作待补读线索，不计JD，不使用skills标签代替正文证据。署名logiover / https://apify.com/logiover/lagou-tech-jobs-scraper 。保留相同许可。"},
  {id:"tianchi-163746",name:"天池招聘数据集 / 安静的AJ",url:"https://tianchi.aliyun.com/dataset/163746",license:"页面标注GPL 2.0，下载后仍须核查来源",status:"awaiting_access",notes:"2023-10-19；数据分析.csv、可视化.xlsx、only_yun_wei.csv。下载要求登录，尚未获取文件，不计JD。"},
  {id:"tianchi-182419",name:"天池招聘岗位信息数据集（1w4条）",url:"https://tianchi.aliyun.com/dataset/182419",license:"未确认",status:"pending_review",notes:"检索发现，详情未能核实；不导入，不计JD。"},
  {id:"kaggle-china-jobs",name:"China Jobs Data / polartech",url:"https://www.kaggle.com/datasets/polartech/china-jobs-data",license:"Unknown",status:"excluded",notes:"官方接口许可Unknown、更新于2023年；不导入有效库。"},
  {id:"kaggle-scam",name:"Recruitment Scam / EMSCAD",url:"https://www.kaggle.com/datasets/amruthjithrajvr/recruitment-scam",license:"页面标注CC0",status:"excluded",notes:"2012–2014英文招聘且包含866条虚假广告，不适合作为大陆真实JD基础库。"},
];
