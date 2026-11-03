// 关键样式随首份 HTML 输出，React 加载期间也能绘制轮廓和流光。
export const startupStyles = `
html{background:#000;color-scheme:dark}
body{margin:0;background:#000;color:#f5f5f7}
.atlas-startup{position:fixed;inset:0;z-index:200;background:#000;display:grid;place-items:center;pointer-events:none;animation:startup-safety 0s 8s forwards}
.atlas-startup-book{display:block;width:min(36vw,65vh);height:auto;color:#fff;overflow:visible;animation:startup-in .4s ease-out both}
.atlas-startup-book path{vector-effect:non-scaling-stroke;stroke-width:3px}
.startup-book-shadow{stroke:#bfc8d8;opacity:.16;transform:translateY(12px);filter:blur(8px)}
.startup-book-outline{opacity:.72;filter:drop-shadow(0 0 6px #ffffff38)}
.startup-book-light{filter:drop-shadow(0 0 7px #ffffffc0)}
.atlas-startup-book .startup-book-light path{stroke-width:3.8px}
.startup-book-sweep{stroke-dasharray:18 82;stroke-dashoffset:18;animation:startup-book-flow 2.2s cubic-bezier(.3,.2,.7,.8) infinite}
.startup-book-spine{stroke-dasharray:28 72;stroke-dashoffset:28;animation:startup-spine-flow 2.2s cubic-bezier(.3,.2,.7,.8) infinite;animation-delay:-.55s;opacity:.9}
.atlas-startup[data-ready=true]{animation:startup-out .4s cubic-bezier(.22,1,.36,1) forwards}
@keyframes startup-in{from{opacity:0}to{opacity:1}}
@keyframes startup-book-flow{from{stroke-dashoffset:18}to{stroke-dashoffset:-82}}
@keyframes startup-spine-flow{from{stroke-dashoffset:28}to{stroke-dashoffset:-72}}
@keyframes startup-out{to{opacity:0;visibility:hidden}}
@keyframes startup-safety{to{opacity:0;visibility:hidden}}
@media(max-width:600px){.atlas-startup-book{width:68vw}}
@media(prefers-reduced-motion:reduce){.atlas-startup-book,.startup-book-sweep,.startup-book-spine{animation:none}.startup-book-light{display:none}.atlas-startup[data-ready=true]{animation-duration:.01s}}
`;

