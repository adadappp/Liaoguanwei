"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Analysis } from "@/lib/atlas";
const statusNames: Record<string,string>={verified_reference:"正文核验来源",partial:"部分待重试",pending:"等待核查",retry:"等待重试",reviewed:"已核查",withdrawn:"已撤回",verified:"历史已核验",needs_review:"待复核",review_failed:"复核未完成",completed:"已完成",running:"进行中",failed:"未完成",awaiting_body:"待补读正文",leads_only:"仅收录线索",awaiting_access:"等待获取文件",pending_review:"待审核",excluded:"未采用"};
const time=(value:string)=>new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Taipei",hour12:false});
type Feedback={id:string;kind:string;message:string;status:string;resolution:string;created_at:string};
export function FeedbackDialog({open,onOpenChange,analysis}:{open:boolean;onOpenChange:(value:boolean)=>void;analysis:Analysis|null}) {
  const [kind,setKind]=useState("incorrect"),[jobId,setJobId]=useState(""),[message,setMessage]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[items,setItems]=useState<Feedback[]>([]);
  async function load() { try {const res=await fetch("/api/feedback");const data=await res.json() as {error?:string;feedback:Feedback[];message:string};if(!res.ok) throw new Error(data.error);setItems(data.feedback);}catch(error){setNotice(error instanceof Error?error.message:"反馈暂不可用。");} }
  useEffect(()=>{if(open){setNotice("");void load();}},[open]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setNotice("");
    try {
      const res=await fetch("/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,message,...jobId?{jobId}:{},...analysis?.storage?.topicId?{topicId:analysis.storage.topicId}:{}})});
      const data=await res.json() as {error?:string;feedback:Feedback[];message:string};if(!res.ok) throw new Error(data.error);setNotice(data.message);setMessage("");await load();
    }catch(error){setNotice(error instanceof Error?error.message:"反馈未保存，请重试。");}finally{setBusy(false);}
  }
  async function withdraw(id:string) {setBusy(true);try{const res=await fetch("/api/feedback",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});if(!res.ok)throw new Error("撤回失败，请重试。");await load();}catch(error){setNotice(error instanceof Error?error.message:"撤回失败。");}finally{setBusy(false);}}
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="atlas-dialog data-dialog"><DialogHeader><DialogTitle>让资料更准确</DialogTitle><DialogDescription>反馈会保存到云端，并进入核查流程。请勿填写手机号、简历、密钥等个人或敏感信息。</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="data-form"><label className="field-label">反馈类型<select value={kind} onChange={e=>setKind(e.target.value)}><option value="incorrect">岗位信息或技能证据有误</option><option value="unavailable">来源失效或职位已下架</option><option value="missing">样本不足，希望补充</option><option value="suggestion">使用建议</option></select></label>
      <label className="field-label">相关职位<select value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">本次结果 / 一般建议</option>{!analysis?.demo&&analysis?.jobs.filter(j=>/^[a-f0-9]{64}$/.test(j.id)).map(j=><option key={j.id} value={j.id}>{j.title} · {j.company}</option>)}</select></label>
      <label className="field-label">具体情况<textarea minLength={5} maxLength={2000} rows={4} required value={message} onChange={e=>setMessage(e.target.value)} placeholder="例如：原文没有要求这项技能，或该链接已无法打开。" /></label><Button disabled={busy||message.trim().length<5} className="primary-button" type="submit">{busy?"正在保存…":"提交反馈"}</Button>
    </form>{notice&&<p className="data-notice" role="status">{notice}</p>}<section className="feedback-history"><h3>我的反馈</h3>{!items.length&&<p>还没有反馈记录。反馈只对你和本站维护流程可见。</p>}{items.map(item=><article key={item.id}><div><strong>{statusNames[item.status]||item.status}</strong><time>{time(item.created_at)}</time></div><p>{item.message||"反馈内容已撤回"}</p>{item.resolution&&<small>{item.resolution}</small>}{item.status!=="withdrawn"&&<button disabled={busy} onClick={()=>withdraw(item.id)}>撤回内容</button>}</article>)}</section>
  </DialogContent></Dialog>;
}
type Library={states:{state:string;count:number}[];companies:{count:number};leads:{state:string;count:number}[];taxonomy:{id:string;name:string;jobs:number;parent_id:string|null}[];sources:{id:string;name:string;url:string;license:string;status:string;notes:string;checked_at:string}[];runs:{id:string;kind:string;status:string;started_at:string;details_json:string}[];feedback:{status:string;count:number}[]};
export function LibraryDialog({open,onOpenChange}:{open:boolean;onOpenChange:(value:boolean)=>void}) {
  const [data,setData]=useState<Library|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  async function load() {try{const res=await fetch("/api/library");const value=await res.json() as Library & {error?:string};if(!res.ok)throw new Error(value.error);setData(value);}catch(error){setNotice(error instanceof Error?error.message:"资料库暂不可用。");}}
  useEffect(()=>{if(open)void load();},[open]);
  async function update(mode:string) {setBusy(true);setNotice("正在小批量读取与核查，请稍候…");try{const res=await fetch("/api/library",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode})});const result=await res.json() as {error?:string};if(!res.ok)throw new Error(result.error);setNotice("本批处理已完成，请查看更新记录；未通过核验的内容不会计入有效职位。");await load();}catch(error){setNotice(error instanceof Error?error.message:"更新未完成。");}finally{setBusy(false);}}
  const total=data?.states.reduce((sum,row)=>sum+row.count,0)||0;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="atlas-dialog data-dialog library-dialog"><DialogHeader><DialogTitle>逐渐积累的职位资料</DialogTitle><DialogDescription>有匹配资料时优先复用，不足时联网补充。核验时间与职位是否仍在招聘分别判断。</DialogDescription></DialogHeader>
    {data&&<><div className="library-counts"><div><strong>{total}</strong><span>已存职位正文</span></div><div><strong>{data.companies.count}</strong><span>已确认企业</span></div><div><strong>{data.leads.reduce((n,r)=>n+r.count,0)}</strong><span>外部职位线索</span></div></div>
    <p className="data-note">外部线索不计入有效 JD。资料被反馈或复核失败后暂停用于搜索；历史已核验资料也不保证当前仍招。</p><div className="library-states">{data.states.map(s=><span key={s.state}>{statusNames[s.state]||s.state} {s.count}</span>)}</div>
    <section><h3>岗位方向</h3><div className="taxonomy-grid">{data.taxonomy.filter(t=>t.id.includes(".")||t.id==="other").map(t=><div key={t.id}><span>{t.name}</span><strong>{t.jobs}</strong></div>)}</div><p className="data-note">方向下保留原始职位名、公司、城市、经验与技术证据；分类不代替筛选核验。</p></section>
    <section><h3>小批量更新</h3><p className="data-note">先处理反馈和到期资料，再结合查询热度补充。不全库重爬；正文稳定时延长周期，变化时缩短。</p><div className="library-actions"><Button variant="outline" disabled={busy} onClick={()=>update("review")}>核查到期资料与反馈</Button><Button variant="outline" disabled={busy} onClick={()=>update("topics")}>补充近期查询</Button><Button variant="outline" disabled={busy} onClick={()=>update("leads")}>核验外部线索</Button></div></section>
    <section><h3>更新记录</h3>{!data.runs.length&&<p className="data-note">尚无更新记录。</p>}{data.runs.map(run=><details className="library-run" key={run.id}><summary>{statusNames[run.status]||run.status} · {run.kind==="review"?"正文复核":run.kind==="topics"?"查询补充":"线索核验"}<time>{time(run.started_at)}</time></summary><p>{describeRun(run.details_json)}</p></details>)}</section>
    <section><h3>数据来源与采用情况</h3>{data.sources.map(source=><article className="source-audit" key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name} ↗</a><small>{source.license} · {statusNames[source.status]||source.status}</small><p>{source.notes}</p></article>)}</section></>}{notice&&<p className="data-notice" role="status">{notice}</p>}
  </DialogContent></Dialog>;
}
function describeRun(text:string) {try{const data=JSON.parse(text);if(data.error)return data.error;if(data.message)return data.message;if(data.outcomes)return data.outcomes.map((r:{status:string;reason?:string})=>r.status==="verified"?"通过正文核验并保存":r.reason||"待重试").join("；")||"没有到期条目。";return `本轮返回 ${data.accepted||0} 条职位资料。`;}catch{return "记录暂不可读。";}}

