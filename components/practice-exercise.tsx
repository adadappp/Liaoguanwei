"use client";
import {useEffect,useRef,useState} from "react";
import {LoaderCircle,ChevronRight,RotateCcw} from "lucide-react";
import type {InterviewQuestion} from "@/lib/interview";
import type {Feedback} from "@/lib/interview-practice";
const DRAFT_KEY="career-atlas-practice-drafts-v1";
export function PracticeExercise({question,topicId,onNext}:{question:InterviewQuestion;topicId:string;onNext?:(()=>void)}){
  const [answer,setAnswer]=useState(""),[feedback,setFeedback]=useState<Feedback|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[reference,setReference]=useState(false),[ready,setReady]=useState(false);
  const controller=useRef<AbortController|null>(null),version=useRef(0);
  useEffect(()=>{try{const drafts=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}");if(typeof drafts[question.id]==="string")setAnswer(drafts[question.id].slice(0,6000));}catch{setError("本地草稿读取失败，请保留自己的答案副本。");}setReady(true);return()=>{controller.current?.abort();};},[question.id]);
  useEffect(()=>{if(!ready)return;try{let drafts:Record<string,string>={};try{const saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}");if(saved&&typeof saved==="object"&&!Array.isArray(saved))drafts=Object.fromEntries(Object.entries(saved).filter(([key,value])=>/^[a-f0-9]{64}$/.test(key)&&typeof value==="string"&&value.length<=6000).slice(-59)) as Record<string,string>;}catch{/* 保留当前有效草稿 */}delete drafts[question.id];drafts[question.id]=answer;localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts));}catch{setError("本地草稿保存失败，请复制答案另存。");}},[answer,ready,question.id]);
  async function submit(){
    if(busy||answer.trim().length<10)return;const abort=new AbortController();controller.current=abort;const revision=version.current;setBusy(true);setError("");setFeedback(null);const timer=setTimeout(()=>abort.abort(),85000);
    try{const response=await fetch("/api/interview/practice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"feedback",topicId,questionId:question.id,answer}),signal:abort.signal});const data=await response.json() as {feedback:Feedback;error?:string};if(!response.ok)throw new Error(data.error||"反馈未完成。");if(version.current===revision)setFeedback(data.feedback);}
    catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:"反馈未完成。");else setError("反馈已取消或超时，答案仍保留。");}
    finally{clearTimeout(timer);setBusy(false);}
  }
  return <div className="practice-exercise">
    {question.material&&<section className="practice-material"><h4>题目材料</h4><p>{question.material}</p></section>}
    {!!question.requirements.length&&<section className="practice-requirements"><h4>交付要求 <span>题目自定，非外部评分标准</span></h4><ul>{question.requirements.map((item,i)=><li key={i}>{item}</li>)}</ul></section>}
    <label className="practice-answer-label" htmlFor={`practice-${question.id}`}>你的答案 <span>可写思路、代码或操作步骤</span></label>
    <textarea id={`practice-${question.id}`} value={answer} maxLength={6000} disabled={busy} onChange={e=>{version.current++;setAnswer(e.target.value);setFeedback(null);}} placeholder="先独立作答，再查看参考思路。实操题可粘贴代码或描述操作过程。" rows={9}/>
    <div className="practice-answer-foot"><span>草稿仅保存在当前浏览器 · {answer.length}/6000</span><span>不运行代码</span></div>
    <div className="practice-actions"><button className="practice-submit" disabled={busy||answer.trim().length<10||!!feedback} onClick={()=>void submit()}>{busy?<><LoaderCircle className="spin" size={14}/>正在反馈…</>:feedback?"本次反馈已获取":"提交并获取反馈"}</button>{busy&&<button onClick={()=>controller.current?.abort()}>取消</button>}<button onClick={()=>setReference(old=>!old)}>{reference?"收起参考思路":"查看参考思路"}</button><button disabled={!onNext} onClick={onNext}>下一题<ChevronRight size={14}/></button></div>
    <p className="practice-privacy">提交时仅将本题与本次答案发送给分析服务，本站不入库保存作答。没有已核验评分标准，本版不打分。</p>
    {error&&<p role="alert" className="inline-error">{error}</p>}
    {feedback&&<section className="practice-feedback"><div className="practice-feedback-heading"><h4>AI 练习反馈</h4><button onClick={()=>{setFeedback(null);setReference(false);}}><RotateCcw size={12}/>修改答案再练</button></div><p>仅依据题面与你的答案提供建议，参考思路可能有误；未运行代码，不代表考试成绩或企业评价。</p>{[["作答观察",feedback.observations],["待补充或核实",feedback.gaps],["改进建议",feedback.suggestions]].map(([title,items])=><section key={title as string}><h5>{title as string}</h5><ul>{(items as string[]).length?(items as string[]).map((item,i)=><li key={i}>{item}</li>):<li>暂无补充建议。</li>}</ul></section>)}{feedback.followUp&&<section><h5>试着再想一步</h5><p>{feedback.followUp}</p></section>}</section>}
    {reference&&<div className="interview-answer"><span>AI 参考思路 · 不是企业或来源网站标准答案</span><p>{question.answer}</p></div>}
  </div>;
}
