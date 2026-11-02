// 样式随首份 HTML 输出，加载 React 期间也能显示；只动画化合成属性。
export const startupStyles = `
.atlas-startup{position:fixed;inset:0;z-index:200;background:#000;display:grid;place-items:center;pointer-events:none;animation:startup-safety 0s 8s forwards}
.atlas-startup-content{display:flex;flex-direction:column;align-items:center;gap:24px;animation:startup-in .3s ease-out both}
.atlas-startup-mark{width:48px;height:48px;display:grid;place-items:center;background:#f5f5f7;color:#111;border-radius:13px;animation:startup-breathe 1.6s ease-in-out infinite}
.atlas-startup-track{width:64px;height:2px;overflow:hidden;border-radius:2px;background:#ffffff18}
.atlas-startup-track:after{content:"";display:block;width:32px;height:100%;border-radius:inherit;background:linear-gradient(90deg,transparent,#f5f5f7,transparent);transform:translateX(-32px);animation:startup-flow 1.2s cubic-bezier(.4,0,.2,1) infinite}
.atlas-startup[data-ready=true]{animation:startup-out .24s ease-out forwards}
@keyframes startup-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes startup-breathe{0%,100%{opacity:.72}50%{opacity:1}}
@keyframes startup-flow{to{transform:translateX(64px)}}
@keyframes startup-out{to{opacity:0;visibility:hidden}}
@keyframes startup-safety{to{opacity:0;visibility:hidden}}
@media(prefers-reduced-motion:reduce){.atlas-startup-content,.atlas-startup-mark,.atlas-startup-track:after{animation:none}.atlas-startup-track:after{transform:translateX(16px)}.atlas-startup[data-ready=true]{animation-duration:.01s}}
`;

