import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchRecruitment, recruitmentQueries, verifyRecruitmentDocuments } from '../lib/recruitment-search.ts';
import { prepareDocuments } from '../lib/analysis.ts';

const input = { role: 'AI 应用开发工程师', city: '上海', experience: '' };
const signal = new AbortController().signal;
const body = '任职要求：熟练使用 Python 开发企业知识库。'.repeat(20);
test('DeepSeek 只采用 content 正文，丢弃摘要及非白名单来源', async () => {
  const results = await searchRecruitment('deepseek', 'test-key', input, ['zhipin.com'], signal, async (url, key, data, passedSignal) => {
    assert.equal(url, 'https://api.deepseek.com/v1/tools/search');
    assert.equal(key, 'test-key'); assert.equal(data.need_content, true); assert.equal(passedSignal, signal);
    return { results: [
      { url: 'https://www.zhipin.com/job_detail/1.html', title: '开发', content: body },
      { url: 'https://www.zhipin.com/job_detail/2.html', summary: body, snippet: body, content: '' },
      { url: 'https://untrusted.example/job', content: body },
    ] };
  });
  const docs = prepareDocuments(results, ['zhipin.com']);
  assert.equal(docs.length, 1); assert.equal(docs[0].body, body);
});
test('DeepSeek 查询遵守 Unicode 长度上限，损坏响应报错而不伪装零结果', async () => {
  await searchRecruitment('deepseek', 'test', { ...input, role: '😀'.repeat(160) }, [], signal, async (_url, _key, data) => {
    assert.ok(Array.from(data.query).length <= 128); return { results: [] };
  });
  await assert.rejects(searchRecruitment('deepseek', 'test', input, [], signal, async () => ({})), /格式异常/);
});

test('缺正文时定向补搜并补读详情，摘要不会进入正文，失败可追踪', async () => {
  const audit={searchRequests:0,failedSearches:0,bodyFetches:0,failedFetches:0};
  const domains=['zhipin.com','jobs.bytedance.com'];
  const calls=[];
  const results=await searchRecruitment('deepseek','test',input,domains,signal,async(url,_key,data)=>{
    calls.push({url,data});
    if(url.endsWith('/fetch')){assert.equal(data.url,'https://www.zhipin.com/job_detail/a.html');return {content:body};}
    if(data.query.includes('site:jobs.bytedance.com')) throw new Error('部分供应商请求失败');
    return {results:[{url:'https://www.zhipin.com/job_detail/a.html',summary:body,content:''},{url:'https://evil.example/a',content:''},{url:'https://www.zhipin.com/web/geek/job',content:''}]};
  },audit);
  assert.equal(audit.searchRequests,3);assert.equal(audit.failedSearches,1);assert.equal(audit.bodyFetches,1);
  assert.equal(prepareDocuments(results,domains).length,1);
  assert.equal(calls.filter(c=>c.url.endsWith('/fetch')).length,1);
});

test('来源查询有上限且保留用户筛选，不自动放宽城市经验',()=>{
  const queries=recruitmentQueries(input,['zhipin.com','liepin.com','jobs.bytedance.com','careers.tencent.com']);
  assert.equal(queries.length,3);
  for(const query of queries){assert.ok(query.includes(input.role));assert.ok(query.includes('上海'));assert.ok(Array.from(query).length<=128);}
  assert.ok(queries[1].includes('site:zhipin.com'));assert.ok(queries[2].includes('site:jobs.bytedance.com'));
});
test('正文补读最多4次且不重试验证页面',async()=>{
  let fetches=0;
  await searchRecruitment('deepseek','test',input,['zhipin.com'],signal,async(url)=>{
    if(url.endsWith('/fetch')){fetches++;return {content:body};}
    return {results:[{url:'https://www.zhipin.com/job_detail/blocked.html',content:'请完成安全验证'},...Array.from({length:8},(_,i)=>({url:`https://www.zhipin.com/job_detail/${i}.html`,content:''}))]};
  });
  assert.equal(fetches,4);
});
test('搜索收录正文必须重新读取，页面外壳不能冒充已复核内容',async()=>{
  const audit={searchRequests:0,failedSearches:0,bodyFetches:0,failedFetches:0};
  const docs=[{id:'j1',url:'https://www.zhipin.com/job_detail/1.html',title:'开发',body},{id:'j2',url:'https://www.zhipin.com/job_detail/2.html',title:'开发',body}];
  const verified=await verifyRecruitmentDocuments('deepseek','test',docs,['zhipin.com'],signal,async(_url,_key,data)=>({content:data.url.includes('/1.html')?body+'重新读取正文':'请登录查看'}),audit);
  assert.equal(verified.length,1);assert.ok(verified[0].raw_content.endsWith('重新读取正文'));assert.equal(verified[0].verified,true);assert.equal(audit.failedFetches,1);
});
test('补读已确认的正文不重复计费，账户问题不能伪装无样本',async()=>{
  const audit={searchRequests:0,failedSearches:0,bodyFetches:0,failedFetches:0};
  const doc={id:'j1',url:'https://www.zhipin.com/job_detail/1.html',title:'开发',body,verified:true};
  const verified=await verifyRecruitmentDocuments('deepseek','test',[doc],['zhipin.com'],signal,async()=>{throw new Error('不应调用');},audit);
  assert.equal(verified.length,1);assert.equal(audit.bodyFetches,0);
  await assert.rejects(verifyRecruitmentDocuments('deepseek','test',[{...doc,verified:false}],['zhipin.com'],signal,async()=>{throw Object.assign(new Error('余额不足'),{status:402});},audit),/余额不足/);
});
test('Tavily 备选仍请求完整正文并限制来源', async () => {
  const results = await searchRecruitment('tavily', 'test', input, ['zhipin.com'], signal, async (url, _key, data) => {
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(data.include_raw_content, 'text'); assert.deepEqual(data.include_domains, ['zhipin.com']);
    return { results: [{ url: 'https://www.zhipin.com/1', raw_content: body }] };
  });
  assert.equal(results[0].raw_content, body);
});
