import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {assembleAnalysis,inspectDocuments,roleEvidenceMatches} from '../lib/analysis.ts';
import {RoleIntentSchema,readRoleIntent,storeRoleIntent,roleKey} from '../lib/role-intent.ts';
import {recruitmentQueries} from '../lib/recruitment-search.ts';

globalThis.__generalEnv={SEARCH_PROVIDER:'deepseek',MODEL_API_KEY:'test-key',MODEL_NAME:'deepseek-flash',MODEL_API_URL:'https://api.deepseek.com/chat/completions'};
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__generalEnv',shortCircuit:true};
  if(specifier.endsWith('lagou-leads.json'))return {url:'data:text/javascript,export default []',shortCircuit:true};
  return next(specifier,context);
}});
const {searchAtlas}=await import('../lib/atlas-search.ts');
const {readCache}=await import('../lib/job-store.ts');
function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  return {sqlite,db:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
}
const examples=[
  ['Motion Designer','动态视觉设计师','动态图形','After Effects'],
  ['Compositor','视效合成师','镜头合成','Nuke'],
  ['Colorist','调色师','调色','DaVinci Resolve'],
  ['Technical Artist','技术美术','材质制作','Unreal Engine'],
  ['Environment Artist','场景美术师','场景建模','Blender'],
  ['Storyboard Artist','分镜师','分镜绘制','Photoshop'],
  ['Sound Designer','游戏音效设计师','音效制作','Wwise'],
  ['Industrial Designer','工业设计师','产品造型','Rhino'],
];
for(const [role,title,duty,skill] of examples)test(`通用真实流程（模拟外部响应）：${role} → ${title}`,async()=>{
  const {db,sqlite}=database();globalThis.__generalEnv.DB=db;
  const input={role,city:'上海',experience:'1–3 年'},intent={canonicalTitle:title,aliases:[title,role],duties:[duty],excludedRoles:['销售经理'],sector:'creative'};
  const quote=`负责${duty}工作，熟练使用 ${skill} 完成项目制作与交付。`;
  const body=`${title}\n本地模拟企业\n上海\n1-3年\n职位描述：${quote}\n任职要求：${quote}\n`+'参与项目制作，整理素材与文件，遵循项目交付规范。'.repeat(15);
  const oldFetch=globalThis.fetch;let models=0,searches=0,reads=0;
  globalThis.fetch=async(url,options)=>{
    const data=JSON.parse(options.body);
    if(String(url).endsWith('/chat/completions')){
      models++;const content=data.messages[0].content.includes('名称解释器') ? intent : {jobs:[{documentId:'j1',title,company:'本地模拟企业',city:'上海',experience:'1-3年',publishedAt:null,metadataQuotes:{title,company:'本地模拟企业',city:'上海',experience:'1-3年',publishedAt:''},roleMatch:{relevant:true,duty,quote},skills:[{name:skill,category:'工具与软件',description:'岗位工具',quote}]}]};
      return Response.json({choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}]});
    }
    if(String(url).endsWith('/tools/search')){searches++;return Response.json({results:[{url:'https://www.liepin.com/job/12345.shtml',title,content:body}]});}
    if(String(url).endsWith('/tools/fetch')){reads++;return Response.json({content:body});}
    throw new Error('未预期的外部地址');
  };
  try{
    const first=await searchAtlas(db,input,new AbortController().signal);
    assert.equal(first.jobs.length,1);assert.equal(first.refresh.persisted,true);assert.equal(first.skills[0].category,'工具与软件');
    const second=await searchAtlas(db,input,new AbortController().signal);
    assert.equal(second.jobs[0].id,first.jobs[0].id);assert.equal(models,2);assert.equal(searches,3);assert.equal(reads,1);
    const stored=sqlite.prepare('SELECT role_intent_json FROM search_topics').get();assert.ok(readRoleIntent(stored.role_intent_json,role));
    const raw=JSON.parse(sqlite.prepare('SELECT extraction_json FROM job_documents').get().extraction_json);assert.equal(raw.roleEvidence[0].role,roleKey(role));
    if(role==='Compositor'){
      sqlite.exec("UPDATE search_topics SET next_search_at='2000-01-01'");
      const refreshed=await searchAtlas(db,input,new AbortController().signal);assert.equal(refreshed.jobs.length,1);assert.equal(models,3,'再次补充只提取正文，复用已缓存的职业理解');
      await searchAtlas(db,{...input,role:title},new AbortController().signal);
      assert.equal((await readCache(db,input)).jobs.length,1,'同正文被另一查询复核后，原查询职责依据仍保留');
      sqlite.prepare('UPDATE job_documents SET body=?').run(body.replaceAll(quote,'职责已改变，当前不再提供原来的核心工作。'));
      assert.equal((await readCache(db,input)).jobs.length,0,'正文已变且引文不成立时，旧职责依据失效');
    }
  }finally{globalThis.fetch=oldFetch;}
});

test('职业理解有版本/期限/原查询约束，拒绝搜索指令与链接',()=>{
  const intent={canonicalTitle:'视效合成师',aliases:['Compositor'],duties:['镜头合成'],excludedRoles:[],sector:'creative'};
  const stored=storeRoleIntent(intent,'Compositor');assert.ok(readRoleIntent(JSON.stringify(stored),'Compositor'));assert.equal(readRoleIntent(JSON.stringify(stored),'Colorist'),null);
  assert.equal(readRoleIntent(JSON.stringify({...stored,createdAt:'2000-01-01'}),'Compositor'),null);
  for(const alias of ['site:evil.com','https://evil.com','合成师 OR 销售'])assert.equal(RoleIntentSchema.safeParse({...intent,aliases:[alias]}).success,false);
  const queries=recruitmentQueries({role:'Compositor',city:'北京',experience:'3–5 年'},['zhipin.com','liepin.com'],intent);
  assert.equal(queries.length,3);for(const q of queries){assert.ok(q.includes('北京'));assert.ok(q.includes('3–5 年'));assert.ok(Array.from(q).length<=128);}
});
test('专项匹配不能借用其他查询、改写引文或通用素质',()=>{
  const quote='负责镜头合成工作，熟练使用 Nuke 完成项目制作与交付。',proof={role:roleKey('Compositor'),duty:'镜头合成',quote};
  assert.equal(roleEvidenceMatches('Compositor',quote,proof),true);
  assert.equal(roleEvidenceMatches('Colorist',quote,proof),false);
  assert.equal(roleEvidenceMatches('Compositor',quote,{...proof,quote:'虚构的镜头合成岗位要求'}),false);
  assert.equal(roleEvidenceMatches('Compositor','具备沟通能力，重视团队合作。',{...proof,duty:'沟通能力',quote:'具备沟通能力，重视团队合作。'}),false);
});
test('有职责信号的非技术来源先进入读取名额，仍保留原文门槛',()=>{
  const intent={canonicalTitle:'视效合成师',aliases:['Compositor'],duties:['镜头合成'],excludedRoles:['后端工程师'],sector:'creative'};
  const make=(url,title,extra)=>({url,title,raw_content:`${title}\n任职要求：${extra}\n`+'参与项目工作，完成素材整理与项目交付。'.repeat(20)});
  const results=[...Array.from({length:12},(_,i)=>make(`https://careers.tencent.com/position/${i}.html`,'Java后端工程师',`服务开发${i}`)),make('https://www.liepin.com/job/12345.shtml','影视合成师','负责镜头合成')];
  const docs=inspectDocuments(results,['careers.tencent.com','liepin.com'],{role:'Compositor',city:'',experience:''},intent).documents;
  assert.equal(docs[0].title,'影视合成师');assert.ok(docs.some(d=>d.url.includes('/12345.shtml')));
});
