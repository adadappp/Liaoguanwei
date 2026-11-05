import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {assembleAnalysis} from '../lib/analysis.ts';
import {saveVerified,claimBudget} from '../lib/job-store.ts';
import {QuestionExtraction,validateQuestions,questionUrl,questionFetchUrl,validQuestionPage} from '../lib/interview.ts';

globalThis.__interviewEnv={SEARCH_PROVIDER:'deepseek',MODEL_API_KEY:'test-key',MODEL_NAME:'deepseek-flash',MODEL_API_URL:'https://api.deepseek.com/chat/completions'};
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__interviewEnv',shortCircuit:true};if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);return next(specifier,context);}});
const {findInterviewQuestions}=await import('../lib/interview-service.ts');
const api=await import('../app/api/interview/route.ts');
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return {sqlite,db:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}}};}
const input={role:'Python 后端工程师',city:'',experience:''};
async function seed(db){const title='Python 后端工程师',quote='熟练掌握 Python，负责服务端接口开发与测试。',body=`${title}\n样本企业\n上海\n任职要求：${quote}`;
  const doc={id:'j1',title,url:'https://www.liepin.com/job/123.shtml',body,verified:true};const extraction={jobs:[{documentId:'j1',title,company:'样本企业',city:'上海',experience:'',publishedAt:null,metadataQuotes:{title,company:'样本企业',city:'上海',experience:'',publishedAt:''},skills:[{name:'Python',category:'编程基础',description:'编程',quote}]}]};const ids=await saveVerified(db,input,[doc],extraction,assembleAnalysis(input,[doc],extraction));return [...ids.values()];}
const questions=['What is Python concept one?','How does Python concept two work?','Explain Python concept three?','Compare Python concept four and five?','Why use Python concept six?','Describe Python concept seven?'];
function page(index){return `Python Interview Questions\n${questions[index*2]}\n${questions[index*2+1]}\nI was asked these questions in my interview.\n`+'Example educational context for mock interview questions. '.repeat(10);}
const draft=(sourceQuestion=questions[0])=>({documentId:'d',question:'请解释这个Python概念？',sourceQuestion,answer:'这是一段AI整理的参考答题思路，不是企业标准答案。',skills:['Python'],difficulty:'基础',sourceKind:'public_question',reportQuote:''});

test('拒绝不安全来源、摘要壳、虚构问句、跨技能注入；每页最多两题',()=>{
  for(const url of ['http://github.com/a/b','https://127.0.0.1/a','https://evil.example/a','https://github.com/login'])assert.equal(questionUrl(url),null);
  assert.equal(questionFetchUrl('https://github.com/owner/repo/blob/main/questions.md'),'https://raw.githubusercontent.com/owner/repo/main/questions.md');
  assert.equal(validQuestionPage('interview summary'),false);
  const docs=[{id:'d',url:'https://github.com/owner/repo/blob/main/questions.md',title:'Questions',body:page(0)}];
  assert.equal(validateQuestions(docs,[draft('What is a fabricated question?')],['Python']).length,0);
  assert.equal(validateQuestions(docs,[{...draft(),skills:['Java']}],['Python']).length,0);
  assert.equal(validateQuestions(docs,[draft(),draft(),{...draft(questions[1]),question:'如何理解另一个Python概念？'}],['Python']).length,2);
});
test('作者自述必须有连续自述依据，网页有面试字样不等于企业真题',()=>{
  const docs=[{id:'d',url:'https://github.com/owner/repo/blob/main/questions.md',title:'Questions',body:page(0)}];
  assert.equal(validateQuestions(docs,[{...draft(),sourceKind:'reported_interview',reportQuote:'Python Interview Questions'}],['Python'])[0].sourceKind,'public_question');
  assert.equal(validateQuestions(docs,[{...draft(),sourceKind:'reported_interview',reportQuote:'I was asked these questions in my interview.'}],['Python'])[0].sourceKind,'reported_interview');
});
test('网页读取、核验、持久化、重复查询复用和历史入口全链路',async()=>{
  const {db,sqlite}=database();globalThis.__interviewEnv.DB=db;const jobIds=await seed(db),originalFetch=globalThis.fetch;let searches=0,reads=0,models=0;
  globalThis.fetch=async(url,options)=>{const data=JSON.parse(options.body);
    if(String(url).endsWith('/tools/search')){searches++;return Response.json({results:Array.from({length:3},(_,i)=>({url:`https://github.com/owner/repo/blob/main/questions-${i}.md`,title:'Python interview questions'}))});}
    if(String(url).endsWith('/tools/fetch')){reads++;const i=Number(data.url.match(/questions-(\d)/)[1]);return Response.json({content:page(i)});}
    if(String(url).endsWith('/chat/completions')){models++;const user=JSON.parse(data.messages[1].content);const out=user.documents.flatMap(d=>{const i=Number(d.url.match(/questions-(\d)/)[1]);return [0,1].map(offset=>({...draft(questions[i*2+offset]),question:`如何理解Python概念${i*2+offset+1}？`,documentId:d.id}));});out.push({...draft('What is a fabricated question?'),documentId:user.documents[0].id});return Response.json({choices:[{message:{content:JSON.stringify({questions:out})},finish_reason:'stop'}]});}
    throw new Error('未预期请求');};
  try{const first=await findInterviewQuestions(db,input,jobIds,new AbortController().signal);assert.equal(first.questions.length,6);assert.equal(sqlite.prepare('SELECT count(*) n FROM interview_questions').get().n,6);assert.equal(searches,2);assert.equal(reads,3);assert.equal(models,1);
    const second=await findInterviewQuestions(db,input,jobIds,new AbortController().signal);assert.equal(second.storage,'database');assert.deepEqual(new Set(second.questions.map(q=>q.id)),new Set(first.questions.map(q=>q.id)));assert.equal(searches,2);assert.equal(models,1);
    const list=await (await api.GET(new Request('https://atlas.example/api/interview'))).json();assert.equal(list.topics[0].count,6);
    const history=await (await api.GET(new Request(`https://atlas.example/api/interview?topic=${first.topicId}`))).json();assert.equal(history.questions.length,6);
    assert.equal(sqlite.prepare("SELECT used FROM request_budgets WHERE id LIKE 'interview-search:%'").get().used,1);
    sqlite.exec("UPDATE interview_questions SET verified_at='2000-01-01'");
    const expired=await (await api.GET(new Request(`https://atlas.example/api/interview?topic=${first.topicId}`))).json();assert.equal(expired.questions.length,0);
  }finally{globalThis.fetch=originalFetch;}
});
test('伪造或不匹配JD不能触发付费；客户端题目与跨站写入不接受',async()=>{
  const {db}=database();globalThis.__interviewEnv.DB=db;const ids=await seed(db);
  await assert.rejects(findInterviewQuestions(db,{...input,role:'Java 后端工程师'},ids,new AbortController().signal),/重新搜索/);
  await assert.rejects(findInterviewQuestions(db,input,['f'.repeat(64)],new AbortController().signal),/重新搜索/);
  const cross=new Request('https://atlas.example/api/interview',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'});assert.equal((await api.POST(cross)).status,403);
  const forged=new Request('https://atlas.example/api/interview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,questions:[draft()]})});assert.equal((await api.POST(forged)).status,400);
});
test('零结果不生成伪题，退避防重复收费',async()=>{
  const {db,sqlite}=database();globalThis.__interviewEnv.DB=db;const ids=await seed(db),old=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({results:[]});};
  try{const first=await findInterviewQuestions(db,input,ids,new AbortController().signal);assert.equal(first.questions.length,0);assert.match(first.warnings.join(''),/没有用AI自行出题/);
    const second=await findInterviewQuestions(db,input,ids,new AbortController().signal);assert.equal(second.questions.length,0);assert.equal(calls,2);assert.equal(sqlite.prepare('SELECT count(*) n FROM interview_questions').get().n,0);
  }finally{globalThis.fetch=old;}
});
test('模型编造格式或省略原题不得通过题目结构校验',()=>{
  assert.equal(QuestionExtraction.safeParse({questions:[{question:'自动编一个题'}]}).success,false);
});
test('题库持久预算耗尽时不调用外部服务',async()=>{
  const {db}=database();globalThis.__interviewEnv.DB=db;const ids=await seed(db);for(let i=0;i<10;i++)await claimBudget(db,'interview-search',10);
  const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('不应联网');};
  try{const result=await findInterviewQuestions(db,input,ids,new AbortController().signal);assert.equal(result.questions.length,0);assert.match(result.warnings.join(''),/额度已用完/);}finally{globalThis.fetch=old;}
});
