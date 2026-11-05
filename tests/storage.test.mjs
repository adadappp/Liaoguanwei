import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writePlans,STORAGE_CONFLICT} from '../lib/plan-storage.ts';
import {STORAGE_KEY,parseBackup} from '../lib/atlas.ts';
function storage(value=null){return {value,getItem(key){assert.equal(key,STORAGE_KEY);return this.value;},setItem(key,next){assert.equal(key,STORAGE_KEY);this.value=next;}};}
test('另一窗口写入或清除后，旧窗口不可覆盖当前存储',()=>{
  for(const current of ['新窗口的原值',null]){const s=storage(current);assert.throws(()=>writePlans(s,[],'旧值'),{message:STORAGE_CONFLICT});assert.equal(s.value,current);}
});
test('成功保存返回精确快照，连续保存可用且备份格式不变',()=>{
  const s=storage();const raw=writePlans(s,[],null);assert.deepEqual(parseBackup(JSON.parse(raw)),[]);assert.equal(s.value,raw);assert.equal(JSON.parse(writePlans(s,[],raw)).version,3);
});
test('容量不足抛出错误，不伪报保存成功',()=>{
  const s=storage('原始资料');s.setItem=()=>{throw new Error('QuotaExceededError');};assert.throws(()=>writePlans(s,[],'原始资料'),/QuotaExceeded/);assert.equal(s.value,'原始资料');
});
test('只打开或关闭未编辑窗口，不重写时间戳或触发其他窗口冲突',()=>{
  const raw=JSON.stringify({format:'career-atlas',version:3,exportedAt:'旧导出时间',plans:[]});const s=storage(raw);
  s.setItem=()=>{throw new Error('未编辑不应写入');};assert.equal(writePlans(s,[],raw),raw);
});
