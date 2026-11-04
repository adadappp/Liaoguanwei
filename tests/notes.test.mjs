import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backup, parseBackup } from '../lib/atlas.ts';

const plan={id:'p',title:'课程计划',goal:'',notes:'旧计划里的笔记原文',updatedAt:'2026-11-05',tasks:[{id:'py',name:'Python',description:'',start:'',end:'',status:'done',notes:'变量与列表\n练习：处理数据',sessions:[{id:'s',day:0,startMinute:540,endMinute:600}]},{id:'rag',name:'RAG',description:'',start:'',end:'',status:'todo',notes:'检索与切分'}]};
test('课程笔记彼此独立，备份保留换行、旧计划笔记和兼容状态',()=>{
  const b=backup([plan]);assert.equal(b.version,3);
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(b))),[plan]);
});
test('兼容第1与第2版旧备份，不自动搬移或丢弃旧计划笔记',()=>{
  const old=structuredClone(plan);for(const t of old.tasks)delete t.notes;
  for(const version of [1,2]) assert.deepEqual(parseBackup({format:'career-atlas',version,plans:[old]}),[old]);
});
test('笔记损坏或超长时拒绝读取，空字符串有效',()=>{
  for(const notes of [null,{},[],42,'a'.repeat(30001)]) assert.throws(()=>parseBackup(backup([{...plan,tasks:[{...plan.tasks[0],notes}]}])),/课程笔记/);
  const empty={...plan,tasks:[{...plan.tasks[0],notes:''}]};assert.deepEqual(parseBackup(backup([empty])),[empty]);
});
