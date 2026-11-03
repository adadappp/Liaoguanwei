// 关键样式随首份 HTML 输出，React 加载期间也能绘制轮廓和流光。
export const startupStyles = `
.atlas-startup{position:fixed;inset:0;z-index:200;background:#000;display:grid;place-items:center;pointer-events:none;animation:startup-safety 0s 8s forwards}
.atlas-startup-book{display:block;width:min(36vw,65vh);height:auto;color:#fff;overflow:visible;animation:startup-in .4s ease-out both}
.atlas-startup-book path{vector-effect:non-scaling-stroke;stroke-width:3px}
.startup-book-shadow{stroke:#bfc8d8;opacity:.16;transform:translateY(12px);filter:blur(12px)}
.startup-book-outline{opacity:.72;filter:drop-shadow(0 1px 1px #ffffff38) drop-shadow(0 0 5px #ffffff24)}
.startup-book-light{filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 7px #ffffffb3) drop-shadow(0 0 18px #dce6ff66)}
.atlas-startup-book .startup-book-light path{stroke-width:3.8px}
.startup-book-sweep{stroke-dasharray:18 82;stroke-dashoffset:18;animation:startup-book-flow 2.2s infinite}
.startup-book-spine{stroke-dasharray:28 72;stroke-dashoffset:28;animation:startup-spine-flow 2.2s infinite;animation-delay:.55s;opacity:.9}
.atlas-startup[data-ready=true]{animation:startup-out .4s cubic-bezier(.22,1,.36,1) forwards}
@keyframes startup-in{from{opacity:0}to{opacity:1}}
@keyframes startup-book-flow{0%{stroke-dashoffset:18;animation-timing-function:cubic-bezier(.42,0,.58,1)}35%{stroke-dashoffset:-12;animation-timing-function:cubic-bezier(.2,.05,.38,1)}72%{stroke-dashoffset:-60;animation-timing-function:cubic-bezier(.42,0,.58,1)}100%{stroke-dashoffset:-82}}
@keyframes startup-spine-flow{0%{stroke-dashoffset:28;animation-timing-function:cubic-bezier(.42,0,.58,1)}45%{stroke-dashoffset:-5;animation-timing-function:cubic-bezier(.2,.05,.38,1)}100%{stroke-dashoffset:-72}}
@keyframes startup-out{to{opacity:0;visibility:hidden}}
@keyframes startup-safety{to{opacity:0;visibility:hidden}}
@media(max-width:600px){.atlas-startup-book{width:68vw}}
@media(prefers-reduced-motion:reduce){.atlas-startup-book,.startup-book-sweep,.startup-book-spine{animation:none}.startup-book-light{display:none}.atlas-startup[data-ready=true]{animation-duration:.01s}}
`;

