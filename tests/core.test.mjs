import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backup, parseBackup, safeUrl } from '../lib/atlas.ts';
import { prepareDocuments, assembleAnalysis, levelForQuote, canonicalUrl } from '../lib/analysis.ts';
const p = { id:'p1',title:'学习计划',goal:'学会接口开发',notes:'笔记',updatedAt:'2026-11-02',tasks:[{id:'t1',name:'Python',description:'练习',start:'2026-11-02',end:'2026-11-20',status:'doing',source:{role:'开发',demo:false,evidence:[{quote:'熟练使用 Python',url:'https://jobs.example.com/123',title:'开发'}]}}] };
test('备份往返保留任务、笔记、来源与状态',()=>assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(backup([p])))),[p]));
test('拒绝损坏备份、未知版本、重复ID及不合法日期',()=>{
  for(const change of [{version:3},{plans:[p,p]},{plans:[{...p,tasks:[{...p.tasks[0],end:'2026-02-30'}]}]},{plans:[{...p,tasks:[{...p.tasks[0],end:'2026-01-01'}]}]},{plans:[{...p,tasks:[{...p.tasks[0],status:'anything'}]}]}]) assert.throws(()=>parseBackup({...backup([p]),...change}));
});
test('拒绝脚本链接与内网地址，允许正常HTTPS来源',()=>{for(const s of ['javascript:alert(1)','http://jobs.example.com','https://127.0.0.1/a','https://[::1]/a','https://a.internal/a','https://user:pass@example.com']) assert.equal(safeUrl(s),null); assert.ok(safeUrl('https://jobs.example.com/123'));});
const body = 'AI 应用开发工程师\n示例公司\n上海\n1-3年\n任职要求：熟练使用 Python 进行后端开发。熟悉 Python 者优先。\n' + '负责开发维护企业知识库应用，完成需求分析与接口设计。'.repeat(12);
const doc = {id:'j1',url:'https://jobs.example.com/123',title:'AI 应用开发工程师',body};
const job = {documentId:'j1',title:'AI 应用开发工程师',company:'示例公司',city:'上海',experience:'1-3年',publishedAt:null,metadataQuotes:{title:'AI 应用开发工程师',company:'示例公司',city:'上海',experience:'1-3年',publishedAt:''},skills:[{name:'Python',category:'编程基础',description:'编程',quote:'熟练使用 Python 进行后端开发。'},{name:'Python3',category:'编程基础',description:'编程',quote:'熟悉 Python 者优先。'}]};
const input = {role:'AI 应用开发工程师',city:'',experience:''};
test('只有可信域名的真实正文进入候选，URL及正文重复去除',()=>{
  const docs=prepareDocuments([{url:doc.url+'?utm_source=test',raw_content:body},{url:doc.url,raw_content:body},{url:'https://evil.example/1',raw_content:body},{url:'https://jobs.example.com/short',raw_content:'任职要求：Python'}],['jobs.example.com']);assert.equal(docs.length,1);
  assert.equal(canonicalUrl('https://jobs.example.com/123?utm_source=x#top'),doc.url);
});
test('技能同义词合并，每条职位最多计数一次，虚构引用被剔除',()=>{
  const output=assembleAnalysis(input,[doc],{jobs:[{...job,skills:[...job.skills,{name:'Docker',category:'工程实践',description:'容器',quote:'需要熟悉 Docker 容器部署技能'}]}]});
  assert.equal(output.jobs.length,1);assert.equal(output.skills.length,1);assert.equal(output.skills[0].evidence.length,1);assert.equal(output.skills[0].name,'Python');assert.equal(output.demo,false);
});
test('跨URL同企业岗位去重，城市和经验筛选严格匹配',()=>{
  const d2={...doc,id:'j2',url:'https://jobs.example.com/456'};
  assert.equal(assembleAnalysis(input,[doc,d2],{jobs:[job,{...job,documentId:'j2'}]}).jobs.length,1);
  assert.equal(assembleAnalysis({...input,city:'北京'},[doc],{jobs:[job]}).jobs.length,0);
  assert.equal(assembleAnalysis({...input,experience:'3–5 年'},[doc],{jobs:[job]}).jobs.length,0);
  assert.equal(assembleAnalysis({...input,city:'上海',experience:'1–3 年'},[doc],{jobs:[job]}).jobs.length,1);
});
test('未知元信息不补全，发布日期不能凭模型生成',()=>{
  const result=assembleAnalysis(input,[doc],{jobs:[{...job,company:'假公司',publishedAt:'2026-11-02'}]});assert.equal(result.jobs[0].company,'企业未注明');assert.equal(result.jobs[0].publishedAt,null);
});
test('优先和熟练同时出现时优先处理，普通熟悉不升级必备',()=>{assert.equal(levelForQuote('熟练 Python 者优先'),'优先');assert.equal(levelForQuote('熟悉 Python'),'未明确');assert.equal(levelForQuote('必须掌握 Python'),'必备');});
