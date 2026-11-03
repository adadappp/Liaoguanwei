export const apiHeaders = { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
export const apiJson = (data: unknown,status=200) => Response.json(data,{status,headers:apiHeaders});
export function sameOrigin(request: Request) { const origin=request.headers.get("origin"); return !origin || origin===new URL(request.url).origin; }
export function userId(request: Request) { return request.headers.get("oai-authenticated-user-id"); }
export async function smallJson(request: Request,limit=4096) {
  if(Number(request.headers.get("content-length"))>limit) throw new Error("提交内容过长。");
  const body=await request.text(); if(body.length>limit) throw new Error("提交内容过长。"); return JSON.parse(body);
}
