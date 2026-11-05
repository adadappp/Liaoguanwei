import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0000_perpetual_lionheart.sql',import.meta.url),'utf8'));
globalThis.__feedbackEnv={DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){return sqlite.prepare(sql).run(...values);}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}}};
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env=globalThis.__feedbackEnv',shortCircuit:true};
  if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
  return next(specifier,context);
}});
const api=await import('../app/api/feedback/route.ts');
function request(method,user,body){return new Request('https://atlas.example/api/feedback',{method,headers:{'content-type':'application/json',...(user?{'oai-authenticated-user-id':user}:{} )},...(body?{body:JSON.stringify(body)}:{})});}

test('真实反馈路由拒绝匿名读写，不接受客户端伪造身份',async()=>{
  assert.equal((await api.GET(request('GET'))).status,401);
  assert.equal((await api.POST(request('POST',null,{kind:'suggestion',message:'本地隔离测试',userId:'other'}))).status,401);
  assert.equal((await api.DELETE(request('DELETE',null,{id:crypto.randomUUID()}))).status,401);
});
test('真实SQLite提交、跨用户隔离、越权撤回无效、本人撤回清空文本',async()=>{
  const posted=await api.POST(request('POST','user-a',{kind:'suggestion',message:'本地隔离测试',userId:'user-b'}));assert.equal(posted.status,201);
  const {id}=await posted.json();
  assert.equal((await (await api.GET(request('GET','user-a'))).json()).feedback.length,1);
  assert.equal((await (await api.GET(request('GET','user-b'))).json()).feedback.length,0);
  await api.DELETE(request('DELETE','user-b',{id}));
  assert.equal(sqlite.prepare('SELECT message FROM user_feedback WHERE id=?').get(id).message,'本地隔离测试');
  await api.DELETE(request('DELETE','user-a',{id}));
  const row=sqlite.prepare('SELECT message,status FROM user_feedback WHERE id=?').get(id);assert.equal(row.message,'');assert.equal(row.status,'withdrawn');
});
test('反馈跨站请求及无效引用被拒绝，按用户限制每日提交',async()=>{
  const cross=request('POST','user-c',{kind:'suggestion',message:'本地隔离测试'});cross.headers.set('origin','https://other.example');assert.equal((await api.POST(cross)).status,403);
  assert.equal((await api.POST(request('POST','user-c',{kind:'incorrect',message:'本地隔离测试',jobId:'a'.repeat(64)}))).status,400);
  for(let i=0;i<20;i++)assert.equal((await api.POST(request('POST','user-limit',{kind:'suggestion',message:'本地限额测试'}))).status,201);
  assert.equal((await api.POST(request('POST','user-limit',{kind:'suggestion',message:'本地限额测试'}))).status,429);
});
