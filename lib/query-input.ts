import { z } from "zod";
export const QueryInput=z.object({ role:z.string().trim().min(2).max(80), city:z.enum(["","北京","上海","深圳","杭州","广州","成都","武汉","南京","西安","苏州","全国远程"]), experience:z.enum(["","实习 / 应届","1–3 年","3–5 年","5 年以上"]) });
