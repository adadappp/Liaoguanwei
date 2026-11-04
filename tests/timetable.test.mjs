import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backup, parseBackup, blankTask } from '../lib/atlas.ts';
import { sessionProblem, placeSession, snappedStart, conflictingIds, timeLabel } from '../lib/timetable.ts';

const session = {id:'s1',day:0,startMinute:540,endMinute:600};
const course = {id:'t1',name:'Python',description:'学习基础',start:'',end:'',status:'todo',sessions:[session]};
const other = {...blankTask('RAG'),id:'t2'};
const plan = {id:'p1',title:'学习',goal:'',notes:'保留笔记',updatedAt:'2026-11-04',tasks:[course,other]};

test('老版备份及没有课次的课程可直接读取，不自动改造旧数据',()=>{
  const oldTask={...course}; delete oldTask.sessions;
  const oldPlan={...plan,tasks:[oldTask]};
  assert.deepEqual(parseBackup({format:'career-atlas',version:1,plans:[oldPlan]}),[oldPlan]);
});
test('第2版备份往返保留多课次、日期、笔记与来源',()=>{
  const p={...plan,tasks:[{...course,sessions:[session,{...session,id:'s2',day:2}],source:{role:'AI',demo:true,evidence:[]}},other]};
  const exported=backup([p]); assert.equal(exported.version,2);
  assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(exported))),[p]);
});
test('拒绝非法星期、时长、粒度、越界和重复课次ID',()=>{
  for(const invalid of [{day:-1},{day:7},{day:1.5},{startMinute:1440,endMinute:1500},{startMinute:-15},{endMinute:540},{endMinute:550},{startMinute:541},{day:'1'},{id:''}]) {
    assert.throws(()=>parseBackup(backup([{...plan,tasks:[{...course,sessions:[{...session,...invalid}]}]}])));
  }
  assert.throws(()=>parseBackup(backup([{...plan,tasks:[course,{...other,sessions:[session]}]}])));
  assert.throws(()=>parseBackup(backup([{...plan,tasks:[{...course,sessions:{}}]}])));
});
test('阻止同日交叉、包含、重复时间，允许相邻时间和不同星期',()=>{
  for (const [startMinute,endMinute] of [[570,630],[525,615],[540,600]]) assert.match(sessionProblem(plan.tasks,other.id,{...session,id:'new',startMinute,endMinute}),/重叠/);
  assert.equal(sessionProblem(plan.tasks,other.id,{...session,id:'new',startMinute:600,endMinute:660}),null);
  assert.equal(sessionProblem(plan.tasks,other.id,{...session,id:'new',day:1}),null);
});
test('移动课次排除自身，保持ID和时长；冲突不会修改输入',()=>{
  const input=structuredClone(plan.tasks), moved={...session,day:2,startMinute:1200,endMinute:1260};
  const next=placeSession(input,course.id,moved,session.id);
  assert.deepEqual(next[0].sessions,[moved]); assert.deepEqual(input,plan.tasks);
  assert.throws(()=>placeSession(input,other.id,{...session,id:'new'}),/重叠/);
  assert.deepEqual(input,plan.tasks);
});
test('编辑时更换课程只移动该课次，保留其他课次和原课程',()=>{
  const next=placeSession(plan.tasks,other.id,session,session.id);
  assert.equal(next[0].sessions.length,0);assert.deepEqual(next[1].sessions,[session]);assert.equal(next[0].name,'Python');
});
test('时间网格吸附及午夜边界正确',()=>{
  assert.equal(snappedStart(558,60),570);assert.equal(snappedStart(-40,60),0);assert.equal(snappedStart(1430,60),1380);
  assert.equal(timeLabel(1440),'24:00');
  assert.equal(sessionProblem(plan.tasks,other.id,{...session,id:'late',day:6,startMinute:1425,endMinute:1440}),null);
  assert.equal(sessionProblem(plan.tasks,other.id,{...session,id:'all',day:6,startMinute:0,endMinute:1440}),null);
});
test('导入冲突资料时保留全部内容并可标出所有冲突课次',()=>{
  const overlap={...plan,tasks:[course,{...other,sessions:[{...session,id:'s2',endMinute:615}]}]};
  const [loaded]=parseBackup(backup([overlap])); assert.deepEqual(loaded,overlap);
  assert.deepEqual([...conflictingIds(loaded.tasks)].sort(),['s1','s2']);
});
test('每项100课次和计划500课次限制同时受保护',()=>{
  const many=Array.from({length:100},(_,i)=>({...session,id:`s${i}`,day:i%7}));
  const ts=[{...course,sessions:many},other];
  assert.match(sessionProblem(ts,course.id,{...session,id:'more',day:6,startMinute:0,endMinute:15}),/100/);
  assert.throws(()=>parseBackup(backup([{...plan,tasks:[{...course,sessions:[...many,{...session,id:'extra'}]}]}])),/100/);
  const total=Array.from({length:5},(_,i)=>({...other,id:`t${i}`,sessions:many.map(s=>({...s,id:`${i}-${s.id}`}))}));
  assert.match(sessionProblem(total,total[0].id,{...session,id:'more',day:6,startMinute:0,endMinute:15}),/100|500/);
  assert.throws(()=>parseBackup(backup([{...plan,tasks:[...total,{...other,id:'six',sessions:[{...session,id:'last'}]}]}])),/500/);
});
