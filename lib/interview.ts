import {z} from "zod";
import {canonicalUrl,normalize,sourceQuote,blockedContent} from "./analysis.ts";
export type InterviewQuestion={id:string;question:string;originalQuestion:string;answer:string;skills:string[];difficulty:string;sourceUrl:string;sourceTitle:string;sourceKind:"public_question"|"reported_interview";reportQuote:string;license:string;verifiedAt:string};
export type InterviewResult={topicId:string;role:string;skills:string[];questions:InterviewQuestion[];storage:"database"|"mixed"|"live";warnings:string[];audit?:{searches:number;read:number;failed:number;accepted:number}};
export const QUESTION_DOMAINS=["github.com","raw.githubusercontent.com","frontendinterviewhandbook.com","techinterviewhandbook.org","nowcoder.com","juejin.cn","csdn.net","zhihu.com","indeed.com","workable.com","betterteam.com"];
export function questionUrl(raw:string){const url=canonicalUrl(raw);if(!url)return null;const u=new URL(url);return QUESTION_DOMAINS.some(host=>u.hostname===host||u.hostname.endsWith(`.${host}`))&&!/\/(?:login|signin|signup|search)(?:[/?]|$)/i.test(u.pathname)?url:null;}
export type QuestionDocument={id:string;url:string;title:string;body:string};
export function questionFetchUrl(url:string){const u=new URL(url);const match=u.hostname==="github.com"&&u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.md)$/i);return match?`https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`:url;}
export function validQuestionPage(body:string){return body.length>=250&&!blockedContent(body)&&/面试|面经|笔试|interview|练习题|招聘测试/i.test(body);}
export function sourceLicense(url:string){return /(?:github\.com|raw\.githubusercontent\.com)\/yangshun\/front-end-interview-handbook\//.test(url)?"MIT · Copyright Yangshun Tay；许可见原仓库 LICENSE":"许可未确认；保留短摘录和原链接";}
export const QuestionExtraction=z.object({questions:z.array(z.object({documentId:z.string().max(20),question:z.string().trim().min(5).max(500),sourceQuestion:z.string().trim().min(5).max(200),answer:z.string().trim().min(10).max(1600),skills:z.array(z.string().min(1).max(100)).min(1).max(4),difficulty:z.enum(["基础","进阶","未分级"]),sourceKind:z.enum(["public_question","reported_interview"]),reportQuote:z.string().max(200).default("")})).max(10)});
export type QuestionDraft=z.infer<typeof QuestionExtraction>["questions"][number];
export function validateQuestions(docs:QuestionDocument[],drafts:QuestionDraft[],skills:string[]){
  const seen=new Set<string>(),displayed=new Set<string>(),perSource=new Map<string,number>();
  return drafts.flatMap(draft=>{
    const doc=docs.find(d=>d.id===draft.documentId);if(!doc||!questionUrl(doc.url)||!validQuestionPage(doc.body))return [];
    const original=sourceQuote(doc.body,draft.sourceQuestion);
    if(!original||!/[?？]|^(?:explain|describe|what|how|why|compare|tell|请|如何|什么|解释|说明|谈谈|描述|你|是否)/i.test(original.trim()))return [];
    const matched=[...new Set(draft.skills.filter(skill=>skills.includes(skill)))];if(!matched.length)return [];
    const key=normalize(original),label=normalize(draft.question);if(seen.has(key)||displayed.has(label)||(perSource.get(doc.url)||0)>=2)return [];
    const report=sourceQuote(doc.body,draft.reportQuote)||"";
    const kind=draft.sourceKind==="reported_interview"&&report&&/我.{0,40}(?:面试|被问|一面)|(?:一面|二面).{0,40}(?:问我|问了我)|\bI (?:was asked|interviewed|had an interview)|my interview/i.test(report)?"reported_interview" as const:"public_question" as const;
    seen.add(key);displayed.add(label);perSource.set(doc.url,(perSource.get(doc.url)||0)+1);
    return [{...draft,sourceQuestion:original,skills:matched,sourceKind:kind,reportQuote:kind==="reported_interview"?report:"",doc}];
  });
}
