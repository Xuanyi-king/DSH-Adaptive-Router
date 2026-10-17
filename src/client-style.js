// Scoped to this plugin's native SettingsForm; no global theme or DOM changes.
/** @type {string} */
export const settingsCss = `
.ar-settings { --ar-border: var(--dsw-alias-border-l2, #8884); --ar-muted: var(--dsw-alias-label-secondary, inherit); display:grid; gap:18px; min-width:0; font-size:13px; line-height:1.5; }
.ar-settings *, .ar-settings *::before { box-sizing:border-box; }
.ar-settings h3, .ar-settings h4, .ar-settings p { margin:0; }
.ar-settings h3 { font-size:15px; font-weight:600; letter-spacing:-.015em; }
.ar-settings h4 { font-size:13px; font-weight:600; }
.ar-settings small, .ar-note { font-size:12px; color:var(--ar-muted); overflow-wrap:anywhere; }
.ar-card { border:1px solid var(--ar-border); border-radius:12px; padding:16px; display:grid; gap:12px; min-width:0; }
.ar-row { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; min-width:0; }
.ar-stack { display:grid; gap:10px; min-width:0; }
.ar-grid { display:grid; align-items:start; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:12px; min-width:0; }
.ar-settings summary { cursor:pointer; overflow-wrap:anywhere; border-radius:5px; padding:3px 0; font-weight:500; }
.ar-settings details[open] > summary { margin-bottom:10px; }
.ar-settings details details { border-top:1px solid var(--ar-border); padding-top:8px; }
.ar-settings summary:focus-visible, .ar-settings select:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
.ar-settings input, .ar-settings select { min-height:34px; font:inherit; max-width:100%; }
.ar-settings input { width:100%; }
.ar-settings input[type=checkbox] { width:auto; min-height:0; }
.ar-settings select { width:100%; }
.ar-settings label, .ar-settings fieldset { min-width:0; overflow-wrap:anywhere; }
.ar-muted { color:var(--ar-muted); opacity:.85; }
.ar-status { display:inline-flex; align-items:center; gap:6px; font-size:12px; overflow-wrap:anywhere; }
.ar-status::before { content:''; width:6px; height:6px; border-radius:50%; background:currentColor; opacity:.65; flex-shrink:0; }
.ar-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
.ar-metric { background:var(--dsw-alias-bg-layer-2, transparent); border:1px solid var(--ar-border); padding:10px; border-radius:8px; min-width:0; }
.ar-metric strong { display:block; font-size:21px; line-height:1.3; font-weight:600; font-variant-numeric:tabular-nums; }
.ar-metric span { font-size:12px; overflow-wrap:anywhere; }
.ar-data { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:6px 16px; margin:0; font-variant-numeric:tabular-nums; }
.ar-data dt { color:var(--ar-muted); overflow-wrap:anywhere; }
.ar-data dd { margin:0; text-align:right; overflow-wrap:anywhere; }
.ar-empty { text-align:center; padding:14px 8px; color:var(--ar-muted); }
.ar-error { border-left:2px solid currentColor; padding:8px 12px; display:grid; gap:4px; overflow-wrap:anywhere; }
.ar-catalog { max-height:220px; overflow:auto; display:grid; gap:12px; }
.ar-candidate { border:1px solid var(--ar-border); border-radius:8px; padding:10px; min-width:0; }
.ar-model { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
.ar-settings progress { width:100%; height:5px; accent-color:var(--dsw-alias-label-primary, currentColor); }
.ar-settings button, .ar-settings summary { transition:opacity 150ms ease; }
.ar-settings button:hover:not(:disabled), .ar-settings summary:hover { opacity:.8; }
@media(max-width:520px) { .ar-card { padding:12px; } .ar-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .ar-settings { gap:12px; } }
@media(prefers-reduced-motion:reduce) { .ar-settings button, .ar-settings summary { transition:none; } }
`;
