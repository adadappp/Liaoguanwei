import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {saveVerified,readCache,recordTopic,claimBudget,topicId} from '../lib/job-store.ts';
import {assembleAnalysis} from '../lib/analysis.ts';

registerHooks({resolve(specifier,context,next){
  if(specifier.endsWith('/recruitment-service.ts')||specifier==='./recruitment-service.ts')return {url:'data:text/javascript,export const runRecruitment=(...args)=>globalThis.__refreshRecruitment(...args)',shortCircuit:true};
  if(specifier.endsWith('lagou-leads.json'))return {url:'data:text/javascript,export default []',shortCircuit:true};
  return next(specifier,context);
}});
const {maintain}=await import('../lib/database-maintenance.ts');
const {searchAtlas}=await import('../lib/atlas-search.ts');
function database(){
  const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
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

for(const title of ['VR场景模型师','三维场景美术师','VR场景建模师（Python工具开发）'])test(`VR重复搜索保留首次结果且不重复调用：${title}`,async()=>{
  const {db}=database(),query={role:'vr场景建模师',city:'',experience:''};let calls=0;
  const body=`${title}\n样本企业\n上海\n职位描述：负责虚拟现实 VR 场景建模与环境制作。\n任职要求：熟练掌握 Blender，制作三维场景模型与贴图。`;
  const doc={id:'j1',url:'https://www.liepin.com/job/321.shtml',title,body,verified:true};
  const extraction={jobs:[{documentId:'j1',title,company:'样本企业',city:'上海',experience:'',publishedAt:null,metadataQuotes:{title,company:'样本企业',city:'上海',experience:'',publishedAt:''},skills:[{name:'Blender',category:'工程实践',description:'场景建模',quote:'熟练掌握 Blender，制作三维场景模型与贴图。'}]}]};
  globalThis.__refreshRecruitment=async()=>{calls++;return {docs:[doc],extraction,analysis:assembleAnalysis(query,[doc],extraction)};};
  const first=await searchAtlas(db,query,new AbortController().signal);assert.equal(first.jobs.length,1);
  const second=await searchAtlas(db,query,new AbortController().signal);assert.equal(second.jobs.length,1);assert.equal(second.skills[0].name,'Blender');assert.equal(second.jobs[0].id,first.jobs[0].id);assert.equal(calls,1);
});
test('零结果退避不冒充已有资料，也不重复触发收费调用',async()=>{
  const {db}=database(),query={role:'vr场景建模师',city:'',experience:''};let calls=0;
  globalThis.__refreshRecruitment=async()=>{calls++;return {docs:[],extraction:{jobs:[]},analysis:assembleAnalysis(query,[],{jobs:[]})};};
  await searchAtlas(db,query,new AbortController().signal);
  const second=await searchAtlas(db,query,new AbortController().signal);
  assert.equal(second.jobs.length,0);assert.match(second.refresh.reason,/没有可复用/);assert.doesNotMatch(second.refresh.reason,/暂用已有资料/);assert.equal(calls,1);
});

const repeatCases=[
  ['Java 后端工程师','Java 全栈开发工程师','Java'],
  ['前端工程师','AI 前端研发工程师','React'],
  ['数据工程师','ETL 工程师','SQL'],
  ['机器学习工程师','推荐算法工程师','PyTorch'],
  ['大模型应用开发','智能体研发工程师','RAG'],
  ['数据分析师','商业智能工程师','SQL'],
  ['测试开发工程师','QA 工程师','Python'],
  ['运维工程师','SRE 工程师','Linux'],
  ['安全工程师','应用安全工程师','Python'],
  ['Android开发工程师','Android研发工程师','Kotlin'],
  ['全栈工程师','全栈开发工程师','JavaScript'],
  ['产品经理','高级产品经理','需求分析'],
  ['Foley拟音师','影视拟音师','Pro Tools'],
  ['Foley Artist','动效Foley录音/编辑','Pro Tools'],
  ['Foley拟音师','游戏音效设计师','Pro Tools','负责Foley拟音录制与声音编辑。'],
];
for(const [role,title,skill,specialty=''] of repeatCases)test(`通用往返：${role} → ${title}`,async()=>{
  const {db,sqlite}=database(),query={role,city:'上海',experience:'1–3 年'};let calls=0;
  const quote=`熟练掌握 ${skill}，负责相关项目实践与交付。`;
  const body=`${title}\n样本企业\n上海\n1-3年\n${specialty}\n任职要求：${quote}`;
  const doc={id:'j1',url:'https://www.liepin.com/job/987.shtml',title,body,verified:true};
  const extraction={jobs:[{documentId:'j1',title,company:'样本企业',city:'上海',experience:'1-3年',publishedAt:null,metadataQuotes:{title,company:'样本企业',city:'上海',experience:'1-3年',publishedAt:''},skills:[{name:skill,category:'工程实践',description:'练习',quote}]}]};
  globalThis.__refreshRecruitment=async()=>{calls++;return {docs:[doc],extraction,analysis:assembleAnalysis(query,[doc],extraction)};};
  const first=await searchAtlas(db,query,new AbortController().signal);assert.equal(first.jobs.length,1);assert.equal(first.refresh.persisted,true);
  const second=await searchAtlas(db,query,new AbortController().signal);assert.equal(second.jobs[0].id,first.jobs[0].id);assert.equal(second.skills[0].name,skill);assert.equal(calls,1);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM query_job_matches').get().n,1);
  assert.equal((await readCache(db,{...query,city:'北京'})).jobs.length,0);
  assert.equal((await readCache(db,{...query,experience:'5 年以上'})).jobs.length,0);
});

test('已关联职位不被300条更新候选挤掉；待复核/超期仍不可复用',async()=>{
  const {db,sqlite}=database();await seed(db);const id=sqlite.prepare('SELECT id FROM job_documents').get().id;
  const cols=sqlite.prepare('PRAGMA table_info(job_documents)').all().map(c=>c.name);
  const select=cols.map(c=>['id','url','verified_at'].includes(c)?'?':c).join(',');
  const clone=sqlite.prepare(`INSERT INTO job_documents(${cols.join(',')}) SELECT ${select} FROM job_documents WHERE id=?`);
  for(let i=0;i<330;i++)clone.run(`noise-${i}`,`https://www.liepin.com/job/${i+10000}.shtml`,new Date(Date.now()+1000).toISOString(),id);
  const cached=await readCache(db,input);assert.equal(cached.jobs[0].id,id);
  sqlite.prepare("UPDATE job_documents SET state='needs_review' WHERE id=?").run(id);
  assert.ok(!(await readCache(db,input)).jobs.some(j=>j.id===id));
  sqlite.prepare("UPDATE job_documents SET state='verified',verified_at='2000-01-01',next_review_at='2000-01-02' WHERE id=?").run(id);
  assert.ok(!(await readCache(db,input)).jobs.some(j=>j.id===id));
});

test('数据库回读异常不报完整入库、不延长成功退避，仍保留本轮结果',async()=>{
  const {db,sqlite}=database();let calls=0;const prepare=db.prepare;
  db.prepare=function(sql){if(sql.startsWith('SELECT * FROM job_documents')&&sqlite.prepare('SELECT count(*) n FROM job_documents').get().n>0)throw new Error('模拟回读故障');return prepare.call(this,sql);};
  const title='Python 后端工程师',quote='熟练掌握 Python，负责服务端接口开发与测试。';
  const doc={id:'j1',url:'https://www.liepin.com/job/456.shtml',title,body:`${title}\n样本企业\n任职要求：${quote}`,verified:true};
  const extraction={jobs:[{documentId:'j1',title,company:'样本企业',city:'',experience:'',publishedAt:null,metadataQuotes:{title,company:'样本企业',city:'',experience:'',publishedAt:''},skills:[{name:'Python',category:'编程基础',description:'练习',quote}]}]};
  globalThis.__refreshRecruitment=async()=>{calls++;return {docs:[doc],extraction,analysis:assembleAnalysis(input,[doc],extraction)};};
  const result=await searchAtlas(db,input,new AbortController().signal);
  assert.equal(result.jobs.length,1);assert.equal(result.refresh.persisted,false);assert.match(result.warnings.join(''),/回读未完成/);assert.equal(calls,1);
  const topic=sqlite.prepare('SELECT next_search_at FROM search_topics').get();assert.ok(Date.parse(topic.next_search_at)-Date.now()<16*60000);
});
