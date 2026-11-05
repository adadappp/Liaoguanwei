import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {assembleAnalysis} from '../lib/analysis.ts';
import {saveVerified,readCache,claimBudget,acquireLease,releaseLease,recordTopic,mergeAnalysis} from '../lib/job-store.ts';
import {cacheRoleMatches,reviewDays} from '../lib/job-taxonomy.ts';
function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(readFileSync(new URL('../drizzle/0000_perpetual_lionheart.sql',import.meta.url),'utf8'));
  const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements) result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {db,sqlite};
}
const input={role:'Python 后端开发',city:'北京',experience:'1–3 年'};
function sample(company='样本企业',url='https://www.liepin.com/job/123.shtml'){
 const body=`Python 后端工程师\n${company}\n北京\n1-3年\n任职要求：熟练掌握 Python，负责服务端接口开发与测试。`;
 const doc={id:'j1',url,title:'Python 后端工程师',body,verified:true};
 const raw={documentId:'j1',title:doc.title,company,city:'北京',experience:'1-3年',publishedAt:null,metadataQuotes:{title:doc.title,company,city:'北京',experience:'1-3年',publishedAt:''},skills:[{name:'Python',category:'编程基础',description:'编程',quote:'熟练掌握 Python，负责服务端接口开发与测试。'}]};
 return {doc,extraction:{jobs:[raw]},analysis:assembleAnalysis(input,[doc],{jobs:[raw]})};
}
test('真实SQL迁移、入库、跨URL企业职位去重和历史核验展示',async()=>{
 const {db,sqlite}=database(),one=sample();await recordTopic(db,input);
 await saveVerified(db,input,[one.doc],one.extraction,one.analysis);await saveVerified(db,input,[one.doc],one.extraction,one.analysis);
 const second=sample('样本企业','https://www.liepin.com/job/456.shtml');await saveVerified(db,input,[second.doc],second.extraction,second.analysis);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM job_documents').get().n,1);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM job_revisions').get().n,1);
 const cached=await readCache(db,input);assert.equal(cached.jobs.length,1);assert.equal(cached.jobs[0].evidenceStatus,'historical');assert.match(cached.warnings[0],/本轮未重新/);
 assert.equal((await readCache(db,{...input,city:'苏州'})).jobs.length,0);
 assert.equal((await readCache(db,{...input,role:'Java 后端开发'})).jobs.length,0);
 assert.equal((await readCache(db,{...input,experience:'5 年以上'})).jobs.length,0);
});
test('未核验与待复核资料不入有效缓存，过期与反馈隔离',async()=>{
 const {db,sqlite}=database(),s=sample();await saveVerified(db,input,[{...s.doc,verified:false}],s.extraction,s.analysis);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM job_documents').get().n,0);
 await saveVerified(db,input,[s.doc],s.extraction,s.analysis);
 sqlite.exec("UPDATE job_documents SET state='needs_review'");assert.equal((await readCache(db,input)).jobs.length,0);
 sqlite.exec("UPDATE job_documents SET state='verified',next_review_at='2000-01-01'");assert.equal((await readCache(db,input)).jobs.length,0);
});
test('正文变化追加历史版本并重置稳定周期，不覆盖旧证据',async()=>{
 const {db,sqlite}=database(),s=sample();await saveVerified(db,input,[s.doc],s.extraction,s.analysis);
 await saveVerified(db,input,[{...s.doc,body:s.doc.body+'\n新增职责：维护内部服务。'}],s.extraction,s.analysis);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM job_revisions').get().n,2);
 assert.equal(sqlite.prepare('SELECT stable_rounds n FROM job_documents').get().n,0);
});
test('AI主分类不遮掉有证据的Python后端职责，仍拒绝其他语言和城市',async()=>{
 const {db}=database(),s=sample();
 const title='大模型 Python 后端工程师';s.doc={...s.doc,title,body:s.doc.body.replace('Python 后端工程师',title)};s.extraction.jobs[0]={...s.extraction.jobs[0],title,metadataQuotes:{...s.extraction.jobs[0].metadataQuotes,title}};
 const analysis=assembleAnalysis(input,[s.doc],s.extraction);await saveVerified(db,input,[s.doc],s.extraction,analysis);
 assert.equal((await readCache(db,input)).jobs.length,1);assert.equal((await readCache(db,{...input,role:'Java 后端开发'})).jobs.length,0);assert.equal((await readCache(db,{...input,city:'苏州'})).jobs.length,0);
});
test('持久预算和租约原子限制；后台处理不伪造用户热度',async()=>{
 const {db,sqlite}=database();assert.equal(await claimBudget(db,'test',2),true);assert.equal(await claimBudget(db,'test',2),true);assert.equal(await claimBudget(db,'test',2),false);
 const token=await acquireLease(db,'one');assert.ok(token);assert.equal(await acquireLease(db,'one'),null);await releaseLease(db,'one','wrong');assert.equal(await acquireLease(db,'one'),null);await releaseLease(db,'one',token);assert.ok(await acquireLease(db,'one'));
 await recordTopic(db,input);await recordTopic(db,input,false);assert.equal(sqlite.prepare('SELECT hits FROM search_topics').get().hits,1);
});
test('分类保守匹配、更新周期变化、混合结果不重复职位',()=>{
 assert.equal(cacheRoleMatches('前端工程师','数据工程师'),false);assert.equal(cacheRoleMatches('嵌入式工程师','Python 开发工程师'),false);assert.equal(cacheRoleMatches('前端工程师','前端开发工程师'),true);
 assert.equal(reviewDays('ai.application'),7);assert.equal(reviewDays('software.backend'),30);assert.ok(reviewDays('software.backend',2)>30);assert.ok(reviewDays('ai.application',0,true)<7);
 const s=sample();assert.equal(mergeAnalysis(input,s.analysis,s.analysis).jobs.length,1);
 const changed={...s.analysis,skills:[]};assert.equal(mergeAnalysis(input,s.analysis,changed).skills.length,0);
});
test('VR场景建模别名需有对应正文，不能混入后端/算法/纯角色或无VR证据职位',()=>{
  const role='vr场景建模师';
  for(const title of ['Java 后端工程师','大模型算法工程师','产品经理'])assert.equal(cacheRoleMatches(role,title,'负责VR场景建模'),false);
  assert.equal(cacheRoleMatches(role,'场景模型师','负责传统建筑模型制作'),false);
  assert.equal(cacheRoleMatches(role,'VR角色模型师','负责人物模型制作'),false);
  assert.equal(cacheRoleMatches(role,'三维场景美术师','负责虚拟现实环境模型'),true);
  assert.equal(cacheRoleMatches('VR角色建模师','角色模型师','VR人物制作'),true);
});
