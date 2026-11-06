import {env} from "cloudflare:workers";
import {z} from "zod";
export async function practiceModel<T>(system:string,input:unknown,schema:z.ZodType<T>,signal:AbortSignal,maxTokens:number,label="练习"){
  const config=env as unknown as Record<string,string|undefined>;
  const endpoint=new URL(config.MODEL_API_URL||process.env.MODEL_API_URL||"https://api.deepseek.com/chat/completions");
  const key=config.MODEL_API_KEY||process.env.MODEL_API_KEY,model=config.MODEL_NAME||process.env.MODEL_NAME||(endpoint.origin==="https://api.deepseek.com"?"deepseek-flash":"");
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||!key||!model)throw new Error(`${label}分析服务配置不完整。`);
  const response=await fetch(endpoint.href,{method:"POST",redirect:"manual",signal,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(input)}],response_format:{type:"json_object"},...(endpoint.origin==="https://api.deepseek.com"?{thinking:{type:"disabled"}}:{}),max_tokens:maxTokens})});
  if(!response.ok)throw new Error(response.status===402?"分析服务余额不足。":`${label}分析暂时失败，请稍后再试。`);
  const data=await response.json() as {choices?:{message?:{content?:string};finish_reason?:string}[]},choice=data.choices?.[0];
  if(!choice?.message?.content||choice.finish_reason==="length")throw new Error(`${label}分析结果不完整，未保存为有效结果。`);
  try{return schema.parse(JSON.parse(choice.message.content));}catch{throw new Error(`${label}分析格式未通过校验，未保存为有效结果。`);}
}
