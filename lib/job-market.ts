import {z} from "zod";
import {QueryInput} from "./query-input.ts";
import type {Analysis} from "./atlas.ts";
export const SALARY_FILTERS=["不限薪资","10k以下","10–20k","20–30k","30k以上","薪资未公开"] as const;
export const MarketInput=QueryInput.extend({salary:z.enum(SALARY_FILTERS).default("不限薪资")}).strict();
export type MarketQuery=z.infer<typeof MarketInput>;
export type JobPosting={id:string;role:string;title:string;company:string;city:string;experience:string;url:string;publishedAt:string|null;checkedAt:string;expiresAt:string;salary:string;salaryMin:number|null;salaryMax:number|null;education:string;description:string;skills:string[];availability:"apply_signal"|"unknown"|"closed"|"needs_review";statusQuote:string;documentHash?:string};
export type MarketResult={query:MarketQuery;jobs:JobPosting[];mode:"database"|"live";warnings:string[];checkedAt:string|null};
export type MarketDetail={posting:JobPosting;analysis:Analysis|null};
export function salaryRange(text:string):[number,number]|null{
  // 周期不明确的薪资仅展示原文，不猜测为月薪；年薪按12个月折算，不计奖金。
  const period=/月|monthly|per month/i.test(text)?1:/年|annual|year/i.test(text)?12:0;
  if(!period||/面议|日薪|时薪|每天|小时/.test(text))return null;
  const match=text.match(/(\d+(?:\.\d+)?)\s*([kK千万元]?)\s*[-–—~至]\s*(\d+(?:\.\d+)?)\s*([kK千万元])/);
  if(!match)return null;
  const unit=(s:string)=>/[kK千]/.test(s)?1000:s==="万"?10000:1;
  const low=Number(match[1])*unit(match[2]||match[4])/period,high=Number(match[3])*unit(match[4])/period;
  return low>0&&high>=low&&high<=1000000?[Math.round(low),Math.round(high)]:null;
}
export function matchesSalary(job:JobPosting,filter:MarketQuery["salary"]){
  if(filter==="不限薪资")return true;if(filter==="薪资未公开")return !job.salary;
  if(job.salaryMin===null||job.salaryMax===null)return false;
  const [min,max]=filter==="10k以下"?[0,10000]:filter==="10–20k"?[10000,20000]:filter==="20–30k"?[20000,30000]:[30000,Infinity];
  return job.salaryMax>=min&&job.salaryMin<max;
}
export const postingFresh=(job:JobPosting)=>Date.parse(job.expiresAt)>Date.now()&&["apply_signal","unknown"].includes(job.availability);
