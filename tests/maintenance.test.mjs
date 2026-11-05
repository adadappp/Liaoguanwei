import {test} from 'node:test';
import assert from 'node:assert/strict';
import {topicRefreshResult,maintenanceStatus} from '../lib/maintenance-result.ts';

test('旧资料回退与入库失败不能关闭待核查反馈',()=>{
  for(const refresh of [undefined,{status:'deferred',persisted:false},{status:'failed',persisted:false},{status:'completed',persisted:false}]) {
    const result=topicRefreshResult({refresh,storage:{mode:'mixed'}});
    assert.equal(result.status,'partial');assert.equal(result.resolveFeedback,false);assert.ok(result.reason);
  }
});
test('完整核验并入库后才处理反馈，零结果也保留真实核验结论',()=>{
  const result=topicRefreshResult({jobs:[],refresh:{status:'completed',persisted:true}});
  assert.equal(result.status,'completed');assert.equal(result.resolveFeedback,true);
});
test('空操作、全失败和部分成功分别报告',()=>{
  assert.equal(maintenanceStatus([]),'completed');
  assert.equal(maintenanceStatus([{status:'retry'},{status:'retry'}]),'failed');
  assert.equal(maintenanceStatus([{status:'verified'},{status:'retry'}]),'partial');
  assert.equal(maintenanceStatus([{status:'verified'}]),'completed');
});
