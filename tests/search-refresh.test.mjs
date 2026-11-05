import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {saveVerified,recordTopic,claimBudget,topicId} from '../lib/job-store.ts';
import {assembleAnalysis} from '../lib/analysis.ts';

registerHooks({resolve(specifier,context,next){
  if(specifier.endsWith('/recruitment-service.ts')||specifier==='./recruitment-service.ts')return {url:'data:text/javascript,export const runRecruitment=(...args)=>globalThis.__refreshRecruitment(...args)',shortCircuit:true};
  if(specifier.endsWith('lagou-leads.json'))return {url:'data:text/javascript,export default []',shortCircuit:true};
  return next(specifier,context);
}});
const {maintain}=await import('../lib/database-maintenance.ts');
function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_perpetual_lionheart.sql',import.meta.url),'utf8'));
  return {sqlite,db:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
}
const input={role:'Python 后端工程师',city:'',experience:''};
async function seed(db){
  const body='Python 后端工程师\n样本企业\n北京\n任职要求：熟练掌握 Python，负责服务端接口开发与测试。';
  const doc={id:'j1',url:'https://www.liepin.com/job/123.shtml',title:input.role,body,verified:true};
  const extraction={jobs:[{documentId:'j1',title:input.role,company:'样本企业',city:'北京',experience:'',publishedAt:null,metadataQuotes:{title:input.role,company:'样本企业',city:'北京',experience:'',publishedAt:''},skills:[{name:'Python',category:'编程基础',description:'编程',quote:'熟练掌握 Python，负责服务端接口开发与测试。'}]}]};
  await recordTopic(db,input);await saveVerified(db,input,[doc],extraction,assembleAnalysis(input,[doc],extraction));
  await db.prepare("INSERT INTO user_feedback(id,user_id,topic_id,kind,message,status,resolution,created_at,updated_at) VALUES('f','u',?,'missing','本地测试','pending','','2026-11-05','2026-11-05')").bind(await topicId(input)).run();
}
test('维护真实SQL：预算耗尽回退旧资料，保留反馈且日志不报完成',async()=>{
  const {db,sqlite}=database();await seed(db);for(let i=0;i<40;i++)await claimBudget(db,'live-search',40);
  globalThis.__refreshRecruitment=()=>{throw new Error('不应联网');};
  const result=await maintain(db,new AbortController().signal,'topics');
  assert.equal(result.status,'partial');assert.equal(sqlite.prepare("SELECT status FROM user_feedback WHERE id='f'").get().status,'pending');
  assert.equal(sqlite.prepare('SELECT status FROM update_runs').get().status,'partial');
});
test('维护真实SQL：供应商失败回退旧资料，不能核销反馈',async()=>{
  const {db,sqlite}=database();await seed(db);globalThis.__refreshRecruitment=()=>{throw new Error('供应商不可用');};
  const result=await maintain(db,new AbortController().signal,'topics');assert.equal(result.status,'partial');assert.match(result.details.message,/供应商不可用/);
  assert.equal(sqlite.prepare("SELECT status FROM user_feedback WHERE id='f'").get().status,'pending');
});
test('维护真实SQL：成功零结果核验也可完成，保留历史资料并记录真实刷新',async()=>{
  const {db,sqlite}=database();await seed(db);globalThis.__refreshRecruitment=async()=>({docs:[],extraction:{jobs:[]},analysis:{...input,jobs:[],skills:[],warnings:[],demo:false,retrievedAt:new Date().toISOString()}});
  const result=await maintain(db,new AbortController().signal,'topics');assert.equal(result.status,'completed');assert.equal(result.details.refresh.persisted,true);
  assert.equal(sqlite.prepare("SELECT status FROM user_feedback WHERE id='f'").get().status,'reviewed');assert.equal(sqlite.prepare('SELECT count(*) n FROM job_documents').get().n,1);
});
