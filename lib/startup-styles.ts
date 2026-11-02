// 关键样式随首份 HTML 输出，React 加载期间也能绘制轮廓和流光。
export const startupStyles = `
.atlas-startup{position:fixed;inset:0;z-index:200;background:#000;display:grid;place-items:center;pointer-events:none;animation:startup-safety 0s 8s forwards}
.atlas-startup-book{display:block;width:min(36vw,65vh);height:auto;color:#fff;overflow:visible;animation:startup-in .4s ease-out both}
.atlas-startup-book path{vector-effect:non-scaling-stroke;stroke-width:1.6px}
.startup-book-outline{opacity:.65}
.startup-book-light{filter:drop-shadow(0 0 3px #ffffffa6)}
.startup-book-sweep{stroke-dasharray:16 84;stroke-dashoffset:16;animation:startup-book-flow 1.8s linear infinite}
.startup-book-spine{stroke-dasharray:26 74;stroke-dashoffset:26;animation:startup-book-flow 1.8s linear infinite;animation-delay:.75s;opacity:.85}
.atlas-startup[data-ready=true]{animation:startup-out .4s cubic-bezier(.22,1,.36,1) forwards}
@keyframes startup-in{from{opacity:0}to{opacity:1}}
@keyframes startup-book-flow{to{stroke-dashoffset:-84}}
@keyframes startup-out{to{opacity:0;visibility:hidden}}
@keyframes startup-safety{to{opacity:0;visibility:hidden}}
@media(max-width:600px){.atlas-startup-book{width:68vw}}
@media(prefers-reduced-motion:reduce){.atlas-startup-book,.startup-book-sweep,.startup-book-spine{animation:none}.startup-book-light{display:none}.atlas-startup[data-ready=true]{animation-duration:.01s}}
`;

