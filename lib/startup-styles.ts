// 静态SVG遮罩只栅格化一次；流光只旋转/平移已绘制图层，不逐帧重绘SVG虚线和阴影。
const maskImage = (path: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420"><path d="${path}" fill="none" stroke="white" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`)}")`;
const outlineMask = maskImage("M300 100C220 51 120 45 30 75V330C120 300 220 311 300 360C380 311 480 300 570 330V75C480 45 380 51 300 100Z");
const spineMask = maskImage("M300 100V360");
// 关键样式随首份HTML输出；流光在React接管前已经开始，不依赖JS逐帧计时。
export const startupStyles = `
html{background:#000;color-scheme:dark}
body{margin:0;background:#000;color:#f5f5f7}
.atlas-startup{position:fixed;inset:0;z-index:200;background:#000;display:grid;place-items:center;pointer-events:none;contain:layout paint;animation:startup-safety 0s 8s forwards}
.atlas-startup-book{position:relative;display:block;width:min(36vw,65vh);aspect-ratio:600/420;color:#fff;isolation:isolate;animation:startup-in .4s ease-out both}
.startup-book-static{display:block;width:100%;height:100%;overflow:visible}
.atlas-startup-book path{vector-effect:non-scaling-stroke;stroke-width:3px}
.startup-book-shadow{stroke:#bfc8d8;opacity:.16;transform:translateY(12px);filter:blur(8px)}
.startup-book-outline{opacity:.72;filter:drop-shadow(0 0 6px #ffffff60)}
.startup-book-glint-mask,.startup-book-spine-mask{position:absolute;inset:0;overflow:hidden;contain:paint;transform:translateZ(0);mask-size:100% 100%;mask-repeat:no-repeat;-webkit-mask-size:100% 100%;-webkit-mask-repeat:no-repeat}
.startup-book-glint-mask{mask-image:${outlineMask};-webkit-mask-image:${outlineMask}}
.startup-book-spine-mask{mask-image:${spineMask};-webkit-mask-image:${spineMask};opacity:.9}
.startup-book-rotor{position:absolute;inset:-50%;background:conic-gradient(from 0deg,#fff 0deg 12deg,#ffffff80 28deg,#fff0 64deg 320deg,#ffffffc0 348deg,#fff 360deg);will-change:transform;animation:startup-book-orbit 2.2s cubic-bezier(.3,.2,.7,.8) infinite}
.startup-book-spine{position:absolute;inset:0 0 auto;height:60%;background:linear-gradient(180deg,#fff0,#ffffff50 25%,#fff 75%,#fff0);will-change:transform;animation:startup-spine-slide 2.2s cubic-bezier(.3,.2,.7,.8) -.55s infinite}
body:has(.atlas-startup[data-ready=false]) .atlas-app{visibility:hidden;animation:startup-content-safety 0s 8s forwards}
body:has(.atlas-startup[data-ready=false]) .atlas-app *{animation-play-state:paused!important}
.atlas-startup[data-ready=true]{animation:startup-out .4s cubic-bezier(.22,1,.36,1) forwards}
@keyframes startup-in{from{opacity:0}to{opacity:1}}
@keyframes startup-book-orbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes startup-spine-slide{from{transform:translateY(-100%)}to{transform:translateY(180%)}}
@keyframes startup-out{to{opacity:0;visibility:hidden}}
@keyframes startup-safety{to{opacity:0;visibility:hidden}}
@keyframes startup-content-safety{to{visibility:visible}}
@media(max-width:600px){.atlas-startup-book{width:68vw}}
@media(prefers-reduced-motion:reduce){.atlas-startup{display:none}.atlas-startup-book,.startup-book-rotor,.startup-book-spine{animation:none}.startup-book-glint-mask,.startup-book-spine-mask{display:none}body:has(.atlas-startup[data-ready=false]) .atlas-app{visibility:visible}.atlas-startup[data-ready=true]{animation-duration:.01s}}
`;

