import { backup, parseBackup, STORAGE_KEY, type Plan } from "./atlas.ts";

export const STORAGE_CONFLICT = "另一窗口已更改本地计划，已暂停保存以免覆盖。请先导出本窗口内容，再重新载入。";
export function writePlans(storage: Pick<Storage, "getItem"|"setItem">, plans: Plan[], expected: string|null) {
  if (storage.getItem(STORAGE_KEY) !== expected) throw new Error(STORAGE_CONFLICT);
  if(expected!==null){try{if(JSON.stringify(parseBackup(JSON.parse(expected)))===JSON.stringify(plans))return expected;}catch{/* 明确恢复时允许替换损坏原值 */}}
  const raw=JSON.stringify(backup(plans));
  storage.setItem(STORAGE_KEY,raw);
  return raw;
}
