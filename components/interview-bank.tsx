"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowUpRight,Search,BookOpen,LoaderCircle,ExternalLink,ChevronDown,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {safeUrl,type Analysis} from "@/lib/atlas";
import type {InterviewResult} from "@/lib/interview";
type Topic={id:string;role:string;updated_at:string;count:number};
export function InterviewBank({analysis,onExplore}:{analysis:Analysis|null;onExplore:()=>void}){
  const [topics,setTopics]=useState<Topic[]>([]),[result,setResult]=useState<InterviewResult|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[filter,setFilter]=useState(""),[skill,setSkill]=useState("全部"),[opened,setOpened]=useState<string[]>([]);
  const controller=useRef<AbortController|null>(null),sequence=useRef(0);
  async function loadTopics(){try{const response=await fetch("/api/interview");const data=await response.json() as {topics:Topic[];error?:string};if(!response.ok)throw new Error(data.error||"题库暂不可用。");setTopics(data.topics);}catch(error){setNotice(error instanceof Error?error.message:"题库暂不可用。");}}
  useEffect(()=>{void loadTopics();return()=>{sequence.current++;controller.current?.abort();};},[]);
  async function history(id:string){
    controller.current?.abort();const request=++sequence.current;const abort=new AbortController();controller.current=abort;setBusy(true);setNotice("");
    try{const response=await fetch(`/api/interview?topic=${id}`,{signal:abort.signal});const data=await response.json() as InterviewResult & {error?:string};if(!response.ok)throw new Error(data.error);if(request!==sequence.current)return;setResult(data);setSkill("全部");setFilter("");setOpened([]);}catch(error){if(!abort.signal.aborted)setNotice(error instanceof Error?error.message:"题库读取失败。");}finally{if(request===sequence.current)setBusy(false);}
  }
  const eligible=!!analysis&&!analysis.demo&&analysis.jobs.some(job=>/^[a-f0-9]{64}$/.test(job.id));
  async function search(){
    if(!analysis||!eligible||busy)return;const abort=new AbortController();controller.current=abort;const request=++sequence.current;setBusy(true);setNotice("");
    const timer=setTimeout(()=>abort.abort(),90000);
    try{const response=await fetch("/api/interview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:analysis.role,city:analysis.city,experience:analysis.experience,jobIds:analysis.jobs.filter(job=>/^[a-f0-9]{64}$/.test(job.id)).map(job=>job.id)}),signal:abort.signal});const data=await response.json() as InterviewResult & {error?:string};if(!response.ok)throw new Error(data.error||"面试题查找未完成。");if(request!==sequence.current)return;setResult(data);setOpened([]);setSkill("全部");setFilter("");await loadTopics();}
    catch(error){if(request===sequence.current)setNotice(abort.signal.aborted?"检索已取消或超时；已入库题目仍然保留。":error instanceof Error?error.message:"面试题查找未完成。");}
    finally{clearTimeout(timer);if(request===sequence.current)setBusy(false);}
  }
  const questions=result?.questions.filter(q=>(skill==="全部"||q.skills.includes(skill))&&`${q.question} ${q.originalQuestion}`.toLowerCase().includes(filter.toLowerCase()))||[];
  return <div className="interview-page content-width page-enter">
    <button className="notebook-back" onClick={onExplore}><ArrowLeft size={15}/>返回岗位探索</button>
    <div className="page-heading"><div><div className="eyebrow muted">有出处，再练习</div><h1>面试题库</h1><p>从岗位要求出发，练习有公开来源的问题。</p></div></div>
    <section className="interview-target"><div><span className="eyebrow muted">当前目标岗位</span><h2>{analysis?.role||"先探索一个目标岗位"}</h2><p>{eligible?"先复用已核验题目，不足时上网查找；不是每次重新出题。":analysis?.demo?"演示职位不用于建立真实题库。":"需要至少一份已入库的真实职位及技能依据。"}</p></div><div className="interview-target-actions">{eligible?<Button className="primary-button" disabled={busy} onClick={()=>void search()}>{busy?<><LoaderCircle size={16} className="spin"/>正在查找…</>:<><Search size={16}/>查找岗位面试题</>}</Button>:<Button className="primary-button" onClick={onExplore}>去探索岗位<ArrowUpRight size={16}/></Button>}{busy&&<button className="text-button" onClick={()=>controller.current?.abort()}>取消</button>}</div></section>
    {notice&&<p className="inline-error" role="alert">{notice}</p>}
    <div className="interview-layout"><aside className="interview-topics"><div className="sidebar-label">已建立的题库</div>{topics.length?topics.map(topic=><button key={topic.id} className={result?.topicId===topic.id?"active":""} onClick={()=>void history(topic.id)}><BookOpen size={16}/><span>{topic.role}<small>{topic.count} 道已核验题目</small></span></button>):<p>题库会随查找逐渐积累。</p>}</aside>
      <section className="interview-main">{result?<><div className="interview-heading"><h2>{result.role}</h2><span>{result.questions.length} 道题 · {result.storage==="database"?"题库复用":result.storage==="mixed"?"题库与本轮补充":"本轮查找"}</span></div><div className="interview-provenance"><ShieldCheck size={16}/><p>公开题目不等于企业真题。中文题面和参考思路经 AI 整理，原题及来源可核对；不代表目标企业必考。</p></div>{result.warnings.map((warning,i)=><p className="coverage-note" key={i}>{warning}</p>)}
      <div className="category-tabs" aria-label="关联技能筛选">{["全部",...result.skills].map(name=><button key={name} className={skill===name?"active":""} onClick={()=>setSkill(name)}>{name}</button>)}</div><div className="skill-filter"><Search size={16}/><input aria-label="查找面试题" placeholder="查找题目关键词" value={filter} onChange={event=>setFilter(event.target.value)}/></div>
      <div className="interview-questions">{questions.map((question,index)=><article key={question.id}><div className="interview-question-meta"><span>题目 {String(index+1).padStart(2,"0")}</span><span>{question.sourceKind==="reported_interview"?"作者自述面经 · 未独立核实":"公开题目"}</span><span>{question.difficulty} · AI参考</span></div><h3>{question.question}</h3><div className="interview-tags">{question.skills.map(tag=><span key={tag}>{tag}</span>)}</div><details className="interview-source"><summary>原题与来源</summary><blockquote>{question.originalQuestion}</blockquote>{question.reportQuote&&<p>作者自述依据：{question.reportQuote}</p>}{safeUrl(question.sourceUrl)&&<a href={question.sourceUrl} target="_blank" rel="noopener noreferrer">{question.sourceTitle}<ExternalLink size={13}/></a>}<small>核验于 {new Date(question.verifiedAt).toLocaleDateString("zh-CN")} · {question.license}</small></details><button className="interview-answer-toggle" aria-expanded={opened.includes(question.id)} onClick={()=>setOpened(old=>old.includes(question.id)?old.filter(id=>id!==question.id):[...old,question.id])}>{opened.includes(question.id)?"收起参考思路":"查看参考思路"}<ChevronDown size={15}/></button>{opened.includes(question.id)&&<div className="interview-answer"><span>AI 整理 · 不是来源网站或企业标准答案</span><p>{question.answer}</p></div>}</article>)}</div>{!questions.length&&<div className="interview-empty"><Search size={28}/><h3>{result.questions.length?"没有符合筛选的题目":"暂未取得合格的公开题目"}</h3><p>{result.questions.length?"试试其他技能或关键词。":"已保留本次查找状态，不用反复点击；没有自动编题填充。"}</p></div>}</>:<div className="interview-empty"><BookOpen size={32}/><h2>把岗位要求，变成练习方向</h2><p>查找当前岗位的题目，或打开左侧已建立的题库。<br/>先思考，再展开参考思路，最后回到原题核对。</p></div>}</section>
    </div>
  </div>;
}
