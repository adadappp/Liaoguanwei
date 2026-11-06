"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowUpRight,Search,BookOpen,LoaderCircle,ExternalLink,ChevronDown,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {PracticeExercise} from "@/components/practice-exercise";
import {safeUrl,type Analysis} from "@/lib/atlas";
import {PRACTICE_CATEGORIES,type InterviewResult,type InterviewQuestion} from "@/lib/interview";
type Topic={id:string;role:string;updated_at:string;count:number};
export function InterviewBank({analysis,onExplore}:{analysis:Analysis|null;onExplore:()=>void}){
  const [topics,setTopics]=useState<Topic[]>([]),[result,setResult]=useState<InterviewResult|null>(null),[busy,setBusy]=useState(false),[phase,setPhase]=useState(""),[notice,setNotice]=useState(""),[filter,setFilter]=useState(""),[skill,setSkill]=useState("全部"),[category,setCategory]=useState("全部"),[practicing,setPracticing]=useState(false),[selected,setSelected]=useState("");
  const controller=useRef<AbortController|null>(null),sequence=useRef(0);
  const [loadingTopics,setLoadingTopics]=useState(true);
  const eligible=!!analysis&&!analysis.demo&&analysis.jobs.some(job=>/^[a-f0-9]{64}$/.test(job.id));
  function accept(data:InterviewResult){setResult(data);setSkill("全部");setCategory("全部");setFilter("");setPracticing(false);setSelected("");}
  async function loadTopics(){const response=await fetch("/api/interview");const data=await response.json() as {topics:Topic[];error?:string};if(!response.ok)throw new Error(data.error||"题库暂不可用。");setTopics(data.topics);return data.topics;}
  useEffect(()=>{let active=true;const initialSequence=sequence.current;void(async()=>{try{const response=await fetch("/api/interview");const data=await response.json() as {topics:Topic[];error?:string};if(!response.ok)throw new Error(data.error||"题库暂不可用。");if(!active)return;setTopics(data.topics);const key=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");const topic=analysis?data.topics.find(t=>key(t.role)===key(analysis.role)&&t.count>0):data.topics.find(t=>t.count>0);if(topic&&sequence.current===initialSequence)await history(topic.id);}catch(error){if(active)setNotice(error instanceof Error?error.message:"题库暂不可用。");}finally{if(active)setLoadingTopics(false);}})();return()=>{active=false;sequence.current++;controller.current?.abort();};},[]);
  async function history(id:string){
    controller.current?.abort();const request=++sequence.current,abort=new AbortController();controller.current=abort;setBusy(true);setPhase("正在读取题库…");setNotice("");
    try{const response=await fetch(`/api/interview?topic=${id}`,{signal:abort.signal});const data=await response.json() as InterviewResult&{error?:string};if(!response.ok)throw new Error(data.error);if(request===sequence.current)accept(data);}catch(error){if(!abort.signal.aborted)setNotice(error instanceof Error?error.message:"题库读取失败。");}finally{if(request===sequence.current)setBusy(false);}
  }
  async function fetchExpansion(topicId:string,signal:AbortSignal){const response=await fetch("/api/interview/practice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"expand",topicId}),signal});const data=await response.json() as InterviewResult&{error?:string};if(!response.ok)throw new Error(data.error||"练习补充未完成。");return data;}
  async function search(){
    if(!analysis||!eligible||busy)return;const abort=new AbortController();controller.current=abort;const request=++sequence.current;setBusy(true);setPhase("正在查找公开题…");setNotice("");const timer=setTimeout(()=>abort.abort(),180000);
    try{const response=await fetch("/api/interview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:analysis.role,city:analysis.city,experience:analysis.experience,jobIds:analysis.jobs.filter(job=>/^[a-f0-9]{64}$/.test(job.id)).map(job=>job.id)}),signal:abort.signal});const data=await response.json() as InterviewResult&{error?:string};if(!response.ok)throw new Error(data.error||"公开题查找未完成。");if(request!==sequence.current)return;accept(data);setPhase("正在补充四类练习…");const expanded=await fetchExpansion(data.topicId,abort.signal);if(request!==sequence.current)return;accept(expanded);await loadTopics();}
    catch(error){if(request===sequence.current)setNotice(abort.signal.aborted?"请求已取消或超时，已保存的题目仍保留。":error instanceof Error?error.message:"练习建立未完成。");}
    finally{clearTimeout(timer);if(request===sequence.current)setBusy(false);}
  }
  async function expand(){
    if(!result||busy)return;const abort=new AbortController();controller.current=abort;const request=++sequence.current;setBusy(true);setPhase("正在补充四类练习…");setNotice("");const timer=setTimeout(()=>abort.abort(),85000);
    try{const data=await fetchExpansion(result.topicId,abort.signal);if(request!==sequence.current)return;accept(data);await loadTopics();}catch(error){if(request===sequence.current)setNotice(abort.signal.aborted?"补充已取消或超时，已有题目保留。":error instanceof Error?error.message:"补充未完成。");}finally{clearTimeout(timer);if(request===sequence.current)setBusy(false);}
  }
  const questions=result?.questions.filter(q=>(skill==="全部"||q.skills.includes(skill))&&(category==="全部"||q.category===category)&&`${q.question} ${q.originalQuestion}`.toLowerCase().includes(filter.toLowerCase()))||[];
  const activeQuestion=questions.find(q=>q.id===selected)||questions[0];
  const shown=practicing?(activeQuestion?[activeQuestion]:[]):questions;
  return <div className="interview-page content-width page-enter">
    <button className="notebook-back" onClick={onExplore}><ArrowLeft size={15}/>返回岗位探索</button>
    <div className="interview-page-title"><div><span>岗位练习</span><h1>面试题库</h1></div><p>从一道题开始，练思路，也练动手。</p></div>
    <section className="interview-target"><div><h2>{analysis?.role||"选择一个目标岗位"}</h2>{(eligible||analysis?.demo)&&<p>{eligible?"公开题优先，AI 补充四类练习；已有题目直接复用。":"演示职位不用于建立真实题库。"}</p>}</div><div className="interview-target-actions">{eligible?<Button className="primary-button" disabled={busy||loadingTopics} onClick={()=>void search()}>{busy?<><LoaderCircle size={16} className="spin"/>{phase}</>:<><Search size={16}/>建立岗位练习</>}</Button>:<Button className="primary-button" onClick={onExplore}>探索岗位<ArrowUpRight size={16}/></Button>}{busy&&<button className="text-button" onClick={()=>controller.current?.abort()}>取消</button>}</div></section>
    {notice&&<p className="inline-error" role="alert">{notice}</p>}
    <div className="interview-layout"><aside className="interview-topics"><div className="interview-topics-label">岗位题库<span>{topics.length}</span></div>{topics.length?topics.map(topic=><button key={topic.id} aria-pressed={result?.topicId===topic.id} className={result?.topicId===topic.id?"active":""} onClick={()=>void history(topic.id)}><BookOpen size={16}/><span>{topic.role}<small>{topic.count} 道题目</small></span><ChevronDown className="interview-topic-arrow" size={14}/></button>):<p>{loadingTopics?"正在读取题库…":"查找后，你的岗位题库会出现在这里。"}</p>}</aside>
      <section className="interview-main">{result?<>
        <div className="interview-heading"><h2>{result.role}</h2><span>{result.questions.length} 道题 · {result.storage==="database"?"题库复用":"本轮补充"}</span></div>
        <div className="interview-provenance"><ShieldCheck size={16}/><p>公开题保留出处，AI 原创题单独标注，均不代表企业必考。暂无已核验评分标准，只提供练习建议，不打分。</p></div>
        {result.warnings.map((warning,i)=><p className="coverage-note" key={i}>{warning}</p>)}
        <div className="practice-toolbar"><div><button className={!practicing?"active":""} onClick={()=>setPracticing(false)}>浏览题目</button><button className={practicing?"active":""} disabled={!questions.length} onClick={()=>setPracticing(true)}>逐题练习</button></div><button disabled={busy} onClick={()=>void expand()}>{busy?phase:"补齐四类练习（AI）"}</button></div>
        <div className="practice-categories" aria-label="题型筛选">{["全部",...PRACTICE_CATEGORIES].map(name=><button key={name} className={category===name?"active":""} onClick={()=>setCategory(name)}>{name}<span>{result.questions.filter(q=>name==="全部"||q.category===name).length}</span></button>)}</div>
        <div className="category-tabs" aria-label="关联技能筛选">{["全部",...result.skills].map(name=><button key={name} className={skill===name?"active":""} onClick={()=>setSkill(name)}>{name}</button>)}</div>
        <div className="skill-filter"><Search size={16}/><input aria-label="查找面试题" placeholder="查找题目关键词" value={filter} onChange={event=>setFilter(event.target.value)}/></div>
        {practicing&&activeQuestion&&<div className="practice-position"><span>当前筛选 · 第 {questions.findIndex(q=>q.id===activeQuestion.id)+1} / {questions.length} 题</span><button onClick={()=>setPracticing(false)}>返回题目列表</button></div>}
        <div className="interview-questions">{shown.map(question=><QuestionCard key={`${practicing}:${question.id}`} practice={practicing} question={question} index={questions.findIndex(q=>q.id===question.id)}>{practicing?<PracticeExercise topicId={result.topicId} question={question} onNext={questions.length>1?()=>setSelected(questions[(questions.findIndex(q=>q.id===question.id)+1)%questions.length].id):undefined}/>:<button className="practice-start" onClick={()=>{setSelected(question.id);setPracticing(true);}}>开始练习<ArrowUpRight size={14}/></button>}</QuestionCard>)}</div>
        {!questions.length&&<div className="interview-empty"><Search size={24}/><h3>{result.questions.length?"没有符合筛选的题目":"暂未取得题目"}</h3><p>{result.questions.length?"试试其他题型、技能或关键词。":"可以补充 AI 原创练习，已保存的题目会直接复用。"}</p></div>}
      </>:<div className="interview-empty"><span className="interview-empty-icon">{busy||loadingTopics?<LoaderCircle size={24} className="spin"/>:<BookOpen size={24}/>}</span><h2>{busy||loadingTopics?"正在打开题库":"从一个岗位开始练习"}</h2><p>{busy||loadingTopics?phase||"读取已保存的题目。":topics.length?"选择左侧岗位阅读并练习题目。":"探索目标岗位后，建立岗位练习题库。"}</p></div>}</section>
    </div>
  </div>;
}
function QuestionCard({question,index,children,practice}:{question:InterviewQuestion;index:number;children:React.ReactNode;practice:boolean}){
  const [reference,setReference]=useState(false),ai=question.sourceKind==="ai_generated";
  return <article><div className="interview-question-meta"><span className="interview-number">{String(index+1).padStart(2,"0")}</span><span>{ai?"AI 原创练习":question.sourceKind==="reported_interview"?"作者自述面经 · 未独立核实":"公开题目"}</span><span>{question.category} · {question.difficulty}</span></div><h3>{question.question}</h3><div className="interview-tags">{question.skills.map(tag=><span key={tag}>{tag}</span>)}</div>
    <details className="interview-source"><summary>{ai?"出题说明":"原题与来源"}</summary>{ai?<p>根据岗位技能生成的练习，非企业真题，未做外部事实核验。背景与交付要求由 AI 设计；不作为权威评分依据。</p>:<><blockquote>{question.originalQuestion}</blockquote>{question.reportQuote&&<p>作者自述依据：{question.reportQuote}</p>}{safeUrl(question.sourceUrl)&&<a href={question.sourceUrl} target="_blank" rel="noopener noreferrer">{question.sourceTitle}<ExternalLink size={13}/></a>}</>}<small>{ai?"生成于":"核验于"} {new Date(question.verifiedAt).toLocaleDateString("zh-CN")} · {question.license}</small></details>
    {children}
    {/* 浏览列表仍可看参考思路；练习中的答案由练习区单独控制。 */}
    {!practice&&<><button className="interview-answer-toggle" aria-expanded={reference} onClick={()=>setReference(old=>!old)}>{reference?"收起参考思路":"查看参考思路"}<ChevronDown size={15}/></button>{reference&&<div className="interview-answer"><span>AI 参考思路 · 不是来源网站或企业标准答案</span><p>{question.answer}</p></div>}</>}
  </article>;
}
