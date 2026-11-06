import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {salaryRange,matchesSalary,postingFresh,MarketInput} from '../lib/job-market.ts';
import {TRACKER_KEY,writeTracked,parseTrackerBackup,trackerBackup,mergeTracked} from '../lib/job-tracker.ts';
globalThis.__marketEnv={SEARCH_PROVIDER:'deepseek',MODEL_API_KEY:'test-key',MODEL_NAME:'deepseek-flash',MODEL_API_URL:'https://api.deepseek.com/chat/completions'};
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__marketEnv',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);return next(specifier,context);}});
const {marketDetails,findMarketJobs,readMarketListings,marketDetail}=await import('../lib/job-market-service.ts');
const {claimBudget}=await import('../lib/job-store.ts');
const api=await import('../app/api/jobs/route.ts');
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));return {sqlite,db:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}}};}
const title='Python 后端工程师',company='测试样本企业',city='上海',url='https://www.liepin.com/job/1985000123.shtml';
const quote='熟练掌握 Python，负责后端接口开发及测试。',body=`${title}\n${company}\n${city}\n薪资：20-30K/月\n本科及以上\n经验不限\n立即投递\n任职要求：${quote}\n`+'负责服务端模块设计、维护与问题排查，参与接口测试和系统改进。'.repeat(15);
const input={role:title,city:'',experience:'',salary:'不限薪资'};
const analysis={...input,retrievedAt:new Date().toISOString(),demo:false,jobs:[{id:'j1',title,company,city,experience:'经验不限',url,publishedAt:null}],skills:[{id:'s1',name:'Python',category:'编程基础',description:'编程',evidence:[{jobId:'j1',quote,level:'必备'}]}],warnings:[]};
const draft={documentId:'j1',salaryQuote:'薪资：20-30K/月',educationQuote:'本科及以上',descriptionQuote:quote,applyQuote:'立即投递'};
function mockedFetch(counters){return async(urlValue,options)=>{const request=JSON.parse(options.body),path=String(urlValue);if(path.endsWith('/tools/search')){counters.search++;return Response.json({results:[{url,title,raw_content:body}]});}if(path.endsWith('/tools/fetch')){counters.read++;return Response.json({content:body});}if(path.endsWith('/chat/completions')){counters.model++;const user=JSON.parse(request.messages[1].content),id=user.documents[0].id;if(request.messages[0].content.includes('展示信息提取器'))return Response.json({choices:[{message:{content:JSON.stringify({jobs:[{...draft,documentId:id}]})},finish_reason:'stop'}]});return Response.json({choices:[{message:{content:JSON.stringify({jobs:[{documentId:id,title,company,city,experience:'经验不限',publishedAt:null,roleMatch:{relevant:true,duty:'后端接口开发',quote},metadataQuotes:{title,company,city,experience:'经验不限',publishedAt:''},skills:[{name:'Python',category:'编程基础',description:'编程',quote}]}]})},finish_reason:'stop'}]});}throw new Error('未预期请求');};}
test('薪资范围只按原文明示周期解析，缺失和面议不猜测',()=>{
  assert.deepEqual(salaryRange('薪资20-30K/月'),[20000,30000]);assert.deepEqual(salaryRange('年薪24—36万'),[20000,30000]);assert.deepEqual(salaryRange('15000-25000元/月'),[15000,25000]);
  for(const text of ['20-30K','面议，最高30K/月','100-200元/天','20000元/月','30-20K/月'])assert.equal(salaryRange(text),null);
  const posting=marketDetails(analysis,[{id:'j1',url,title,body,verified:true}],[draft],title)[0];assert.equal(matchesSalary(posting,'20–30k'),true);assert.equal(matchesSalary(posting,'10k以下'),false);assert.equal(matchesSalary({...posting,salaryMin:null,salaryMax:null},'20–30k'),false);
});
test('岗位薪资、学历和入口须来自正文；关闭信号优先且不是历史JD直接搬运',()=>{
  const doc={id:'j1',url,title,body,verified:true};const [good]=marketDetails(analysis,[doc],[draft],title);assert.equal(good.availability,'apply_signal');assert.equal(good.salary,'薪资：20-30K/月');
  const [forged]=marketDetails(analysis,[doc],[{...draft,salaryQuote:'50-80K/月',educationQuote:'博士',applyQuote:'立即申请这个虚构入口'}],title);assert.equal(forged.salary,'');assert.equal(forged.education,'');assert.equal(forged.availability,'unknown');
  const [closed]=marketDetails(analysis,[{...doc,body:body+'\n该职位已停止招聘'}],[draft],title);assert.equal(closed.availability,'closed');assert.equal(postingFresh(closed),false);
  assert.equal(marketDetails(analysis,[{...doc,verified:false}],[draft],title).length,0);assert.equal(postingFresh({...good,expiresAt:'2000-01-01'}),false);
});
test('真实检索模块→详情重读→稳定ID→行情缓存→技能桥接→重复不联网',async()=>{
  const {db,sqlite}=database();globalThis.__marketEnv.DB=db;const old=globalThis.fetch,counters={search:0,read:0,model:0};globalThis.fetch=mockedFetch(counters);
  try{const first=await findMarketJobs(db,input,new AbortController().signal);assert.equal(first.jobs.length,1);assert.match(first.jobs[0].id,/^[a-f0-9]{64}$/);assert.equal(first.jobs[0].salaryMin,20000);assert.equal(counters.read,1);assert.equal(counters.model,2);assert.equal(sqlite.prepare('SELECT count(*) n FROM market_listings').get().n,1);const second=await findMarketJobs(db,{...input,salary:'20–30k'},new AbortController().signal);assert.equal(second.mode,'database');assert.equal(second.jobs[0].id,first.jobs[0].id);assert.equal(counters.model,2);
    const detail=await marketDetail(db,first.jobs[0].id);assert.equal(detail.analysis.jobs[0].id,first.jobs[0].id);assert.equal(detail.analysis.skills[0].name,'Python');assert.equal((await readMarketListings(db)).length,1);
    sqlite.exec("UPDATE market_listings SET expires_at='2000-01-01',availability='needs_review'");assert.equal((await readMarketListings(db)).length,0);assert.equal((await marketDetail(db,first.jobs[0].id)).posting.availability,'needs_review');
    const filtered=await findMarketJobs(db,input,new AbortController().signal);assert.equal(filtered.jobs.length,0);assert.equal(counters.model,2);
  }finally{globalThis.fetch=old;}
});
test('找工作预算耗尽不调用供应商，空库不拿历史JD冒充在招',async()=>{
  const {db}=database();globalThis.__marketEnv.DB=db;for(let i=0;i<10;i++)await claimBudget(db,'market-search',10);const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('不应联网');};try{const result=await findMarketJobs(db,input,new AbortController().signal);assert.equal(result.jobs.length,0);assert.match(result.warnings.join(''),/额度/);assert.equal((await readMarketListings(db)).length,0);}finally{globalThis.fetch=old;}
});
test('本地收藏/阶段/面试/备注备份往返，跨窗口冲突与错误备份拒绝覆盖',()=>{
  const posting={...marketDetails(analysis,[{id:'j1',url,title,body,verified:true}],[draft],title)[0],id:'a'.repeat(64)};
  const records=[{posting,stage:'面试中',note:'准备项目复盘',interviewAt:'2026-11-09T10:30',updatedAt:new Date().toISOString()}];let value=null;const storage={getItem(key){assert.equal(key,TRACKER_KEY);return value;},setItem(key,next){value=next;}};
  const saved=writeTracked(storage,records,null);assert.deepEqual(parseTrackerBackup(trackerBackup(records)),records);assert.equal(mergeTracked(records,records).length,1);assert.throws(()=>writeTracked(storage,[],null),/其他窗口/);assert.equal(value,saved);assert.throws(()=>parseTrackerBackup({format:'career-atlas',version:3,records}));assert.throws(()=>parseTrackerBackup({...trackerBackup(records),records:[{...records[0],posting:{...posting,url:'javascript:alert(1)'}}]}));
});
test('找工作接口拒绝跨站、任意URL/强制刷新字段和无效筛选',async()=>{
  const {db}=database();globalThis.__marketEnv.DB=db;
  assert.equal(MarketInput.safeParse({...input,url:'https://evil.example'}).success,false);assert.equal(MarketInput.safeParse({...input,force:true}).success,false);
  assert.equal((await api.POST(new Request('https://atlas.example/api/jobs',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}))).status,403);
  assert.equal((await api.POST(new Request('https://atlas.example/api/jobs',{method:'POST',body:JSON.stringify({...input,salary:'所有工资都可'})}))).status,400);
  assert.equal((await api.GET(new Request('https://atlas.example/api/jobs?jobId=invalid'))).status,400);
});
test('后续JD更新不继续沿用旧薪资快照，失效结果与历史详情严格区分',async()=>{
  const {db,sqlite}=database();globalThis.__marketEnv.DB=db;const old=globalThis.fetch;globalThis.fetch=mockedFetch({search:0,read:0,model:0});
  try{const first=await findMarketJobs(db,input,new AbortController().signal),id=first.jobs[0].id;sqlite.prepare("UPDATE job_documents SET verified_at=?,body_hash='changed-document' WHERE id=?").run(new Date(Date.now()+60000).toISOString(),id);assert.equal((await readMarketListings(db)).length,0);assert.equal((await marketDetail(db,id)).posting.availability,'needs_review');}finally{globalThis.fetch=old;}
});
test('找工作保存回读失败不写长期成功退避，不冒称搜索成功',async()=>{
  const {db,sqlite}=database();globalThis.__marketEnv.DB=db;const old=globalThis.fetch;globalThis.fetch=mockedFetch({search:0,read:0,model:0});
  const broken={...db,prepare(sql){const statement=db.prepare(sql);if(sql.includes('m.data_json')&&sql.includes('WHERE m.expires_at'))statement.all=async()=>({results:[]});return statement;}};
  try{await assert.rejects(findMarketJobs(broken,input,new AbortController().signal),/回读未通过/);const query=sqlite.prepare('SELECT * FROM market_queries').get();assert.equal(query.job_ids_json,'[]');assert.ok(Date.parse(query.next_search_at)<Date.now()+20*60000);}finally{globalThis.fetch=old;}
});
test('同一正文的复核时间更新不使已保存职位消失，24小时时效仍保留',async()=>{
  const {db,sqlite}=database();globalThis.__marketEnv.DB=db;const old=globalThis.fetch;globalThis.fetch=mockedFetch({search:0,read:0,model:0});try{const first=await findMarketJobs(db,input,new AbortController().signal),id=first.jobs[0].id;sqlite.prepare('UPDATE job_documents SET verified_at=? WHERE id=?').run(new Date(Date.now()+1000).toISOString(),id);assert.equal((await readMarketListings(db)).length,1);assert.equal((await marketDetail(db,id)).posting.availability,'apply_signal');sqlite.exec("UPDATE market_listings SET expires_at='2000-01-01'");assert.equal((await readMarketListings(db)).length,0);}finally{globalThis.fetch=old;}
});
