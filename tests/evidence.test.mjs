import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectDocuments,skillSupported,canonicalUrl,assembleAnalysis,jobMatchesRole,sourceQuote} from '../lib/analysis.ts';
const body='AI 开发工程师\n测试企业\n岗位要求：必须掌握 Python 进行后端开发。'+'完成企业知识库开发与维护，负责接口设计和测试。'.repeat(18);
const doc={id:'j1',url:'https://www.liepin.com/job/123.shtml',title:'AI 开发工程师',body};
const job={documentId:'j1',title:'AI 开发工程师',company:'测试企业',city:'',experience:'',publishedAt:null,metadataQuotes:{title:'AI 开发工程师',company:'测试企业',city:'',experience:'',publishedAt:''},skills:[{name:'Docker',category:'工程实践',description:'容器',quote:'必须掌握 Python 进行后端开发。'}]};
const input={role:'AI 开发工程师',city:'',experience:''};
test('搜索标题不能代替正文中的岗位名证据',()=>{
  const j={...job,skills:[{name:'Python',category:'编程基础',description:'开发',quote:'必须掌握 Python 进行后端开发。'}]};
  assert.equal(assembleAnalysis(input,[{...doc,body:body.replace('AI 开发工程师','另一种职位')}],{jobs:[j]}).jobs.length,0);
});
test('证据展示恢复原文字形、大小写与换行，非连续改写不得通过',()=>{
  const original='要求熟悉 PYTHON\n 和\tDocker 开发';
  assert.equal(sourceQuote(original,'熟悉 python和Docker'), '熟悉 PYTHON\n 和\tDocker');
  assert.equal(sourceQuote(original,'熟悉 Docker 和 Python'),null);
  assert.equal(sourceQuote('熟悉Ｐｙｔｈｏｎ开发','熟悉Python开发'),'熟悉Ｐｙｔｈｏｎ开发');
});
test('同一来源内优先选择符合城市与经验的正文，但不篡改筛选条件',()=>{
  const results=[{url:'https://www.liepin.com/job/1.shtml',title:'AI 开发工程师',raw_content:body+'上海5-10年'}, {url:'https://www.liepin.com/job/2.shtml',title:'AI 开发工程师',raw_content:body+'北京1-3年'}];
  assert.ok(inspectDocuments(results,['liepin.com'],{role:'AI 开发工程师',city:'北京',experience:'1–3 年'}).documents[0].url.endsWith('/2.shtml'));
});
test('已知岗位方向不能混入明显无关职位，指定语言必须有技能证据',()=>{
  assert.equal(jobMatchesRole('前端工程师','Java后端开发工程师'),false);
  assert.equal(jobMatchesRole('数据工程师','数据分析师'),false);
  assert.equal(jobMatchesRole('数据工程师','大数据开发工程师'),true);
  assert.equal(jobMatchesRole('大模型应用开发工程师','销售经理'),false);
  const valid={...job,title:'后端开发工程师',metadataQuotes:{...job.metadataQuotes,title:'后端开发工程师'},skills:[{name:'Python',category:'编程基础',description:'开发',quote:'必须掌握 Python 进行后端开发。'}]};
  assert.equal(assembleAnalysis({role:'Java 后端工程师',city:'',experience:''},[{...doc,title:'后端开发工程师'}],{jobs:[valid]}).jobs.length,0);
});
test('真实原文引用不能为不相关技能背书，缩写不误匹配',()=>{
  assert.equal(assembleAnalysis(input,[doc],{jobs:[job]}).jobs.length,0);
  assert.equal(skillSupported('Java','熟练使用 JavaScript 开发网页'),false);
  assert.equal(skillSupported('Go','使用 Django 开发后端'),false);
  assert.equal(skillSupported('Python3','熟练使用 Python 开发后端'),true);
  assert.equal(skillSupported('RAG','熟悉检索增强生成技术'),true);
});
test('剔除聚合页及验证页面，保留详情页并说明排除计数',()=>{
  const result=inspectDocuments([
    {url:'https://www.liepin.com/zhaopin/python/',raw_content:body},
    {url:doc.url,raw_content:body},
    {url:'https://www.liepin.com/job/456.shtml',raw_content:'请完成安全验证'+body},
  ],['liepin.com']);
  assert.equal(result.documents.length,1);assert.equal(result.audit.notDetail,1);assert.equal(result.audit.blocked,1);
});
test('移动与桌面同职位ID规范化去重',()=>{
  assert.equal(canonicalUrl('https://m.liepin.com/job/123.shtml?pgRef=test'),doc.url);
  assert.equal(canonicalUrl('https://m.zhaopin.com/jobs/CC123.htm'),'https://www.zhaopin.com/jobdetail/CC123.htm');
  assert.equal(inspectDocuments([{url:'https://www.liepin.com/a/79301661.shtml',raw_content:body}],['liepin.com']).documents.length,1);
});
test('多来源轮换而非单一网站填满10个名额',()=>{
  const results=Array.from({length:12},(_,i)=>({url:`https://www.liepin.com/job/${100+i}.shtml`,raw_content:body+i}));
  results.push({url:'https://www.zhipin.com/job_detail/abc.html',raw_content:body+'BOSS'});
  const result=inspectDocuments(results,['liepin.com','zhipin.com']);
  assert.equal(result.documents.length,10);assert.equal(new URL(result.documents[1].url).hostname,'www.zhipin.com');assert.equal(result.audit.overLimit,3);
});
test('无效日历日期和未来日期即使在正文出现也不当作发布日期',()=>{
  for(const date of ['2026-02-30','2099-01-01']){
    const d={...doc,body:body+date};const j={...job,publishedAt:date,metadataQuotes:{...job.metadataQuotes,publishedAt:date},skills:[{name:'Python',category:'编程基础',description:'开发',quote:'必须掌握 Python 进行后端开发。'}]};
    assert.equal(assembleAnalysis(input,[d],{jobs:[j]}).jobs[0].publishedAt,null);
  }
});
