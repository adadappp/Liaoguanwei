import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesRole} from '../lib/job-taxonomy.ts';
import {recruitmentQueries,searchRecruitment} from '../lib/recruitment-search.ts';

test('Foley中英文别名一致，宽泛音效岗位必须有专项正文',()=>{
  for(const role of ['Foley拟音师','Foley Artist','拟音师']) {
    assert.equal(matchesRole(role,'影视拟音师',''),true);
    assert.equal(matchesRole(role,'动效Foley录音/编辑',''),true);
    assert.equal(matchesRole(role,'游戏音效设计师','负责Foley拟音录制与制作。'),true);
    assert.equal(matchesRole(role,'声音设计师','负责音效制作，但不含专项信息。'),false);
    assert.equal(matchesRole(role,'录音助理','协助拟音师完成Foley录音。'),false);
    assert.equal(matchesRole(role,'配音演员','了解Foley录音'),false);
    assert.equal(matchesRole(role,'音频算法工程师','研究Foley生成'),false);
  }
});
test('Foley补搜使用独立中文名与专项职责词，保留城市经验及三次上限',()=>{
  const queries=recruitmentQueries({role:'Foley拟音师',city:'北京',experience:'3–5 年'},['zhipin.com','liepin.com','jobs.bytedance.com']);
  assert.equal(queries.length,3);assert.ok(queries[0].includes('拟音师 Foley'));
  assert.ok(queries[1].includes('拟音师'));assert.ok(queries[2].includes('音效设计师 "Foley"'));
  for(const q of queries){assert.ok(q.includes('北京'));assert.ok(q.includes('3–5 年'));assert.ok(Array.from(q).length<=128);}
});
test('无结果时别名补搜仍最多3次，不调用任意域名',async()=>{
  const queries=[];
  await searchRecruitment('deepseek','test',{role:'Foley拟音师',city:'上海',experience:''},['zhipin.com'],new AbortController().signal,async(_url,_key,data)=>{queries.push(data.query);return {results:[]};});
  assert.equal(queries.length,3);assert.ok(queries.some(q=>q.includes('音效设计师')));
});
