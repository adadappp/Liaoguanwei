import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchRecruitment } from '../lib/recruitment-search.ts';
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
    assert.equal(Array.from(data.query).length, 128); return { results: [] };
  });
  await assert.rejects(searchRecruitment('deepseek', 'test', input, [], signal, async () => ({})), /格式异常/);
});
test('Tavily 备选仍请求完整正文并限制来源', async () => {
  const results = await searchRecruitment('tavily', 'test', input, ['zhipin.com'], signal, async (url, _key, data) => {
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(data.include_raw_content, 'text'); assert.deepEqual(data.include_domains, ['zhipin.com']);
    return { results: [{ url: 'https://www.zhipin.com/1', raw_content: body }] };
  });
  assert.equal(results[0].raw_content, body);
});
