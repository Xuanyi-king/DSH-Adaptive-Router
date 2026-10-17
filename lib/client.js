"use strict";
(() => {
  // src/client-style.js
  var settingsCss = `
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

  // src/diagnostics.ts
  var neoModels = /* @__PURE__ */ new Set(["NeoHorse-Jev-4B", "TokenRhythm/NeoHorse-Jev-4B", "neohorse-jev", "NeoHorse-JEV-4B", "TokenRhythm/NeoHorse-JEV-4B"]);
  var engineFor = (config) => neoModels.has(config.classifierModel) ? "NeoHorse" : "Jev";
  function validEndpoint(value) {
    try {
      const u = new URL(value);
      return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.hash;
    } catch {
      return false;
    }
  }
  function presetPatch(id, config) {
    if (id === "custom") return {};
    if (id === "jev") return { classifierModel: "jev-latest" };
    if (!["neohorse-hosted", "neohorse-local"].includes(id)) return {};
    return {
      apiUrl: id === "neohorse-hosted" ? "https://tokenrhythm.studio/v1/systemone" : "http://127.0.0.1:8080/v1/systemone",
      classifierModel: "NeoHorse-Jev-4B",
      ...!config.apiKeyEnv || ["JEV_API_KEY", "TOKENRHYTHM_API_KEY"].includes(config.apiKeyEnv) ? { apiKeyEnv: "TOKENRHYTHM_API_KEY" } : {}
    };
  }
  var explanations = {
    local: ["\u72EC\u7ACB\u7B80\u5355\u8BF7\u6C42\uFF0C\u4F7F\u7528\u672C\u5730\u5FEB\u901F\u5224\u65AD\u3002", "\u65E0\u9700\u8054\u7F51\u5206\u7C7B\uFF1B\u8FD9\u4E0D\u4EE3\u8868\u5206\u7C7B\u670D\u52A1\u5DF2\u8FDE\u63A5\u3002"],
    jev: ["\u4F9D\u636E Jev \u7684\u4EFB\u52A1\u5C42\u7EA7\u548C\u7528\u9014\u9009\u62E9\u3002", "\u5B9E\u9645\u7ED3\u679C\u4EE5\u5DF2\u63D0\u4EA4 Header \u4E3A\u51C6\u3002"],
    neohorse: ["\u4F9D\u636E NeoHorse \u7684\u4EFB\u52A1\u5C42\u7EA7\u548C\u7528\u9014\u9009\u62E9\u3002", "confidence \u4E3A\u5206\u5E03\u7EDF\u8BA1\u91CF\uFF0C\u4E0D\u662F\u6B63\u786E\u7387\u3002"],
    anchored: ["\u5EF6\u7EED\u672A\u5B8C\u6210\u4EFB\u52A1\uFF0C\u4FDD\u6301\u6A21\u578B\u548C\u63A8\u7406\u6DF1\u5EA6\u3002", "\u65B0\u4EFB\u52A1\u4F1A\u91CD\u65B0\u5224\u65AD\u3002"],
    manual: ["\u624B\u52A8\u6A21\u5F0F\u6216\u624B\u52A8\u9501\uFF0C\u4FDD\u7559 DSH \u539F\u751F\u63A7\u5236\u3002", "\u9700\u8981\u81EA\u52A8\u63A7\u5236\u65F6\u8C03\u6574\u6A21\u5F0F\u6216\u9501\u3002"],
    "native-override": ["\u539F\u751F\u5DF2\u63D0\u4EA4 Header \u4E0E\u81EA\u52A8\u63D0\u8BAE\u4E0D\u540C\uFF0C\u5B9E\u9645\u7531\u539F\u751F\u8BF7\u6C42\u63A7\u5236\u3002", "\u4EE5\u5F53\u524D Header \u7684\u6A21\u578B\u548C\u6863\u4F4D\u4E3A\u51C6\u3002"],
    "native-manual": ["\u7528\u6237\u539F\u751F\u624B\u52A8\u9009\u62E9\u4F18\u5148\u3002", "\u7EE7\u7EED\u4F7F\u7528\u539F\u751F\u9009\u62E9\u5668\u63A7\u5236\u6A21\u578B\u548C\u6863\u4F4D\u3002"],
    "no-url": ["\u5C1A\u672A\u8BBE\u7F6E\u5206\u7C7B\u670D\u52A1\u5730\u5740\uFF0C\u4FDD\u7559\u539F\u751F\u8BF7\u6C42\u3002", "\u5728\u63D2\u4EF6\u914D\u7F6E\u4E2D\u586B\u5199\u5B8C\u6574 System One URL \u5E76\u4FDD\u5B58\u3002"],
    "invalid-url": ["\u5206\u7C7B\u5730\u5740\u4E0D\u662F\u6709\u6548\u7684 HTTP(S) URL\u3002", "\u4F7F\u7528\u65E0\u5185\u5D4C\u51ED\u636E\u3001\u65E0\u7247\u6BB5\u7684\u5B8C\u6574 System One URL\u3002"],
    "no-key": ["\u5206\u7C7B\u51ED\u636E\u4E0D\u53EF\u89E3\u6790\uFF0C\u4FDD\u7559\u539F\u751F\u8BF7\u6C42\u3002", "\u5728 Host \u539F\u751F\u51ED\u636E\u4E2D\u914D\u7F6E\u5BF9\u5E94\u5F15\u7528\uFF0C\u6216\u8BBE\u7F6E Host \u73AF\u5883\u53D8\u91CF\u3002"],
    timeout: ["\u5206\u7C7B\u670D\u52A1\u8D85\u65F6\uFF0C\u81EA\u52A8\u51B3\u5B9A\u672A\u5E94\u7528\u3002", "\u68C0\u67E5 Host \u7F51\u7EDC\u4E0E\u670D\u52A1\u8D1F\u8F7D\uFF1B\u4E0D\u8981\u65E0\u6761\u4EF6\u91CD\u8BD5\u5DF2\u53D1\u9001\u8BF7\u6C42\u3002"],
    failed: ["\u5206\u7C7B\u670D\u52A1\u8FDE\u63A5\u6216\u54CD\u5E94\u5931\u8D25\uFF0C\u4FDD\u7559\u539F\u751F\u8BF7\u6C42\u3002", "\u68C0\u67E5 Host \u7F51\u7EDC\u3001\u5730\u5740\u3001\u670D\u52A1\u65E5\u5FD7\u4E0E\u6A21\u578B\u6743\u9650\u3002"],
    "invalid-choice": ["System One \u54CD\u5E94\u7ED3\u6784\u6216\u7B54\u6848\u4E0D\u5408\u6CD5\u3002", "\u6838\u5BF9 tier/role/relation Choice\u3001\u6982\u7387\u53CA confidence \u5B57\u6BB5\u3002"],
    "invalid-json": ["\u5206\u7C7B\u63A5\u53E3\u672A\u8FD4\u56DE\u5408\u6CD5 JSON\u3002", "\u786E\u8BA4\u5730\u5740\u4E3A System One\uFF0C\u68C0\u67E5\u53CD\u5411\u4EE3\u7406\u4E0E\u670D\u52A1\u65E5\u5FD7\u3002"],
    "http-401": ["\u5206\u7C7B\u51ED\u636E\u88AB\u670D\u52A1\u62D2\u7EDD\u3002", "\u68C0\u67E5 API Key \u53CA\u5DF2\u4FDD\u5B58\u7684\u51ED\u636E\u5F15\u7528\u3002"],
    "http-403": ["\u5206\u7C7B\u6A21\u578B\u6743\u9650\u88AB\u62D2\u7EDD\u3002", "\u68C0\u67E5\u8D26\u53F7\u7070\u5EA6\u540D\u5355\u4E0E\u6A21\u578B\u6388\u6743\u3002"],
    "http-413": ["\u5206\u7C7B\u8F93\u5165\u8D85\u8FC7\u670D\u52A1\u9650\u5236\u3002", "\u7F29\u77ED\u4EFB\u52A1\u8F93\u5165\u6216\u68C0\u67E5\u670D\u52A1\u9650\u989D\uFF1B\u63D2\u4EF6\u4E0D\u4F1A\u9759\u9ED8\u622A\u65AD\u4EFB\u52A1\u3002"],
    "http-422": ["\u6A21\u578B ID\u3001\u53C2\u6570\u6216\u8F93\u5165\u957F\u5EA6\u4E0D\u88AB\u670D\u52A1\u63A5\u53D7\u3002", "\u68C0\u67E5 NeoHorse-Jev-4B \u6A21\u578B ID \u4E0E\u90E8\u7F72\u7684 token \u9650\u5236\u3002"],
    "http-429": ["\u5206\u7C7B\u670D\u52A1\u9650\u6D41\u6216\u7E41\u5FD9\u3002", "\u7A0D\u540E\u91CD\u8BD5\uFF0C\u68C0\u67E5\u989D\u5EA6\u4E0E\u670D\u52A1\u5BB9\u91CF\uFF1B\u672C\u8F6E\u4FDD\u7559\u539F\u751F\u8C03\u7528\u3002"],
    "http-529": ["NeoHorse \u5206\u7C7B\u5DE5\u4F5C\u5668\u7E41\u5FD9\u3002", "\u7B49\u5F85\u670D\u52A1\u6062\u590D\uFF1B\u672C\u8F6E\u4E0D\u81EA\u52A8\u91CD\u8BD5\u3002"],
    "no-compatible-model": ["\u6CA1\u6709\u5339\u914D\u4EFB\u52A1\u4E0E\u6863\u4F4D\u7EA6\u675F\u7684\u6388\u6743\u5019\u9009\u3002", "\u68C0\u67E5\u5019\u9009\u80FD\u529B\u3001\u4EFB\u52A1\u7528\u9014\u53CA\u56FA\u5B9A\u6863\u4F4D\uFF0C\u539F\u751F\u8BF7\u6C42\u4ECD\u4FDD\u7559\u3002"],
    "validation-failed": ["\u76EE\u6807\u6A21\u578B\u6216\u6863\u4F4D\u672A\u901A\u8FC7\u539F\u751F\u80FD\u529B\u6821\u9A8C\u3002", "\u5237\u65B0\u6A21\u578B\u76EE\u5F55\u5E76\u66F4\u65B0\u5019\u9009\u914D\u7F6E\u3002"],
    "context-too-large": ["\u76EE\u6807\u7A97\u53E3\u65E0\u6CD5\u5B89\u5168\u5BB9\u7EB3\u4E0A\u4E0B\u6587\uFF0C\u4FDD\u7559\u539F\u751F\u8C03\u7528\u3002", "\u9009\u62E9\u66F4\u5927\u7A97\u53E3\u6A21\u578B\u6216\u538B\u7F29\u4F1A\u8BDD\u3002"],
    "context-capacity-blocked": ["\u6700\u65B0\u4E0A\u4E0B\u6587\u8D85\u9650\u6216\u65E0\u6CD5\u5B89\u5168\u4F30\u7B97\uFF0C\u5DF2\u963B\u6B62\u7F13\u5B58\u76EE\u6807\u8BF7\u6C42\u3002", "\u7528\u539F\u751F\u9009\u62E9\u5668\u9009\u62E9\u66F4\u5927\u7A97\u53E3\u6A21\u578B\u6216\u538B\u7F29\u4E0A\u4E0B\u6587\u540E\u7EE7\u7EED\u3002"],
    "router-error": ["\u8DEF\u7531\u68C0\u67E5\u5F02\u5E38\uFF0C\u81EA\u52A8\u51B3\u5B9A\u672A\u5E94\u7528\u3002", "\u4FDD\u7559\u539F\u751F\u8C03\u7528\uFF1B\u68C0\u67E5 Host \u65E5\u5FD7\u4E0E\u914D\u7F6E\u3002"],
    conflict: ["\u68C0\u6D4B\u5230 Jev Effort Selector \u51B2\u7A81\uFF0C\u5DF2\u8BA9\u51FA\u81EA\u52A8\u63A7\u5236\u3002", "\u4EC5\u542F\u7528\u4E00\u4E2A\u81EA\u52A8\u8DEF\u7531/\u6863\u4F4D\u63D2\u4EF6\u3002"],
    "settings-changed": ["\u914D\u7F6E\u5DF2\u4FEE\u6539\uFF0C\u672C\u8F6E\u4E0D\u590D\u7528\u65E7\u81EA\u52A8\u51B3\u5B9A\u3002", "\u4E0B\u4E00\u8F6E\u5E94\u7528\u65B0\u914D\u7F6E\uFF1B\u5F53\u524D\u539F\u751F Header \u53EF\u80FD\u4FDD\u7559\u4E4B\u524D\u81EA\u52A8\u9009\u4E2D\u7684\u6A21\u578B\u3002"],
    "decision-superseded": ["\u7B49\u5F85\u671F\u95F4\u914D\u7F6E\u3001\u76EE\u5F55\u6216\u624B\u52A8\u9009\u62E9\u6539\u53D8\u3002", "\u4FDD\u7559\u5F53\u524D\u539F\u751F\u63A7\u5236\uFF0C\u4E0B\u4E00\u8F6E\u91CD\u65B0\u5224\u65AD\u3002"],
    "held-route-unavailable": ["\u7F13\u5B58\u6A21\u578B\u5DF2\u4E0D\u5728\u6709\u6548\u76EE\u5F55\u4E2D\u3002", "\u5237\u65B0\u76EE\u5F55\uFF0C\u9009\u62E9\u53EF\u7528\u7684\u539F\u751F\u6A21\u578B\u3002"],
    "manual-intent-unavailable": ["\u539F\u751F\u624B\u52A8\u610F\u56FE\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u4FDD\u5B88\u8BA9\u51FA\u63A7\u5236\u3002", "\u4F7F\u7528\u76EE\u6807 DSH \u7248\u672C\uFF0C\u68C0\u67E5\u539F\u751F\u6A21\u578B\u9009\u62E9\u670D\u52A1\u3002"],
    "no-user-task": ["\u672C\u6B65\u9AA4\u6CA1\u6709\u65B0\u7684\u53EF\u5206\u7C7B\u7528\u6237\u4EFB\u52A1\u3002", "\u4FDD\u7559\u539F\u751F\u8BF7\u6C42\u3002"],
    disabled: ["\u63D2\u4EF6\u5DF2\u5173\u95ED\u3002", "\u53EF\u5728\u63D2\u4EF6\u914D\u7F6E\u4E2D\u542F\u7528\u3002"],
    cancelled: ["\u5206\u7C7B\u88AB\u53D6\u6D88\uFF0C\u4FDD\u7559\u539F\u751F\u63A7\u5236\u3002", "\u9700\u8981\u65F6\u91CD\u65B0\u63D0\u4EA4\u4EFB\u52A1\u3002"],
    "request-too-large": ["\u5206\u7C7B\u8BF7\u6C42\u4F53\u8D85\u8FC7 1 MiB \u5B89\u5168\u9650\u5236\u3002", "\u7F29\u77ED\u8F93\u5165\uFF1B\u4E0D\u4F1A\u9759\u9ED8\u622A\u65AD\u5206\u7C7B\u4E0A\u4E0B\u6587\u3002"],
    "response-too-large": ["\u5206\u7C7B\u54CD\u5E94\u8D85\u8FC7\u5B89\u5168\u5927\u5C0F\u9650\u5236\u3002", "\u68C0\u67E5 System One \u670D\u52A1\u6216\u4EE3\u7406\u914D\u7F6E\u3002"]
  };
  function explainReason(code) {
    const [reason, action] = explanations[code] ?? ["\u81EA\u52A8\u51B3\u5B9A\u672A\u5E94\u7528\uFF0C\u4FDD\u7559\u539F\u751F\u8BF7\u6C42\u3002", "\u68C0\u67E5\u914D\u7F6E\u4E0E Host \u670D\u52A1\u72B6\u6001\u3002"];
    return { reason, action };
  }
  function readiness(config, facts) {
    const result = (state, code, reason, action) => ({ state, code, ...explainReason(code), ...reason ? { reason } : {}, ...action ? { action } : {} });
    if (!config.enabled) return result("Disabled", "disabled");
    if (facts.conflict) return result("Conflict", "conflict");
    const autoModel = ["FULL_AUTO", "MODEL_AUTO"].includes(config.mode) && !config.lockModel;
    const autoEffort2 = ["FULL_AUTO", "EFFORT_AUTO"].includes(config.mode) && !config.lockEffort;
    if (!autoModel && !autoEffort2 || facts.nativeManual) return result("Manual", facts.nativeManual ? "native-manual" : "manual");
    if (!config.apiUrl?.trim()) return result("Needs Setup", "no-url");
    if (!validEndpoint(config.apiUrl)) return result("Needs Setup", "invalid-url");
    if (facts.keyAvailable === false) return result("Needs Setup", "no-key");
    const enabled = config.candidates.filter((c) => c.enabled);
    if (autoModel && !enabled.length) return result("Needs Setup", "no-compatible-model", "\u5C1A\u672A\u542F\u7528\u5019\u9009\u6A21\u578B\u3002");
    if (!facts.catalog) return result("Unverified", "catalog-unknown", "\u6A21\u578B\u76EE\u5F55\u5C1A\u672A\u9A8C\u8BC1\u3002", "\u8FDE\u63A5 Host \u540E\u5237\u65B0\u76EE\u5F55\u3002");
    const rows = facts.catalog.groups.flatMap((g) => g.models.map((m) => ({ ...m, provider: g.id })));
    if (autoModel) {
      const available = enabled.filter((c) => rows.some((m) => m.provider === c.provider && m.id === c.model));
      if (!available.length) return result("Needs Setup", "no-compatible-model");
      const fixed = config.mode === "MODEL_AUTO" ? config.fixedEffort || facts.current?.reasoningEffort : config.lockEffort ? facts.current?.reasoningEffort : void 0;
      if (fixed && !available.some((c) => rows.find((m) => m.provider === c.provider && m.id === c.model)?.reasoning?.efforts.some((e) => e.id === fixed))) return result("Needs Setup", "no-compatible-model", "\u56FA\u5B9A\u6863\u4F4D\u4E0E\u5F53\u524D\u53EF\u7528\u5019\u9009\u5747\u4E0D\u517C\u5BB9\u3002");
      if ((config.lockEffort || config.mode === "MODEL_AUTO" && !config.fixedEffort) && !facts.current) return result("Unverified", "current-unknown", "\u9700\u5728\u804A\u5929\u4E2D\u6838\u5BF9\u539F\u751F\u5F53\u524D\u6863\u4F4D\u3002", "\u53D1\u9001\u4EFB\u52A1\u524D\u786E\u8BA4\u539F\u751F\u6A21\u578B\u4E0E\u6863\u4F4D\u3002");
    } else {
      if (!facts.current) return result("Unverified", "current-unknown", "\u5F53\u524D\u539F\u751F\u6A21\u578B\u5C1A\u672A\u786E\u8BA4\u3002", "\u5728\u804A\u5929\u83DC\u5355\u67E5\u770B\u5DF2\u63D0\u4EA4\u7684\u539F\u751F\u6A21\u578B\u3002");
      const model = rows.find((m) => m.provider === facts.current.provider && m.id === facts.current.model);
      if (!model) return result("Needs Setup", "validation-failed");
      if (!model.reasoning?.efforts.length) return result("Native", "model-default", "\u5F53\u524D\u6A21\u578B\u6CA1\u6709\u58F0\u660E\u53EF\u8C03\u8282\u7684\u601D\u8003\u6863\u4F4D\uFF0C\u5C06\u4FDD\u7559\u6A21\u578B\u9ED8\u8BA4\u884C\u4E3A\u3002", "\u65E0\u9700\u628A\u6A21\u578B\u89C6\u4E3A\u4E0D\u53EF\u7528\uFF1B\u82E5\u9700\u8C03\u8282\u6863\u4F4D\u8BF7\u9009\u62E9\u539F\u751F\u652F\u6301\u7684\u6A21\u578B\u3002");
    }
    if (facts.failure) return result("Degraded", facts.failure);
    if (facts.keyAvailable === void 0 || !facts.verified) return result("Unverified", "unverified", "\u5FC5\u8981\u914D\u7F6E\u5DF2\u586B\u5199\uFF0C\u5C1A\u672A\u9A8C\u8BC1\u5206\u7C7B\u670D\u52A1\u8FDE\u63A5\u3002", "\u9759\u6001\u68C0\u67E5\u4E0D\u53D1\u7F51\u7EDC\u8BF7\u6C42\uFF1B\u771F\u5B9E\u5206\u7C7B\u6210\u529F\u540E\u624D\u80FD\u6807\u8BB0 Ready\u3002");
    return result("Ready", "verified", "\u5F53\u524D\u914D\u7F6E\u7684\u5206\u7C7B\u8BF7\u6C42\u5DF2\u6210\u529F\uFF0C\u76F8\u5173\u6A21\u578B\u76EE\u5F55\u5DF2\u89E3\u6790\u3002", "\u8FD9\u53EA\u9A8C\u8BC1\u534F\u8BAE\u53EF\u7528\uFF0C\u4E0D\u4EE3\u8868\u5206\u7C7B\u51C6\u786E\u7387\u6216\u8FDC\u7AEF\u6A21\u578B\u8C03\u7528\u6210\u529F\u3002");
  }

  // src/router.ts
  var tiers = ["simple", "moderate", "complex"];
  var sameModel = (a, b) => a.provider === b.provider && a.model === b.model;
  function deriveLadder(ids) {
    if (ids.length <= 2) return ids.slice();
    const low = ids[0];
    let high = ids.includes("high") ? "high" : ids.at(-1);
    if (high === low) high = ids.at(-1);
    const ceiling = ids.slice(0, ids.indexOf(high) + 1);
    let mid = ceiling.includes("medium") ? "medium" : ceiling[Math.floor(ceiling.length / 2)];
    if (mid === low || mid === high) {
      mid = ceiling[Math.floor(ceiling.length / 2)];
      if (mid === low || mid === high)
        mid = ceiling.find((id) => id !== low && id !== high) ?? mid;
    }
    return [.../* @__PURE__ */ new Set([low, mid, high])].sort(
      (a, b) => ids.indexOf(a) - ids.indexOf(b)
    );
  }
  function effortFor(model, tier) {
    const configured = model.effortByTier?.[tier];
    if (configured && model.efforts.includes(configured)) return configured;
    const ladder = deriveLadder(model.efforts);
    if (!ladder.length) return void 0;
    return ladder[Math.round(tiers.indexOf(tier) * (ladder.length - 1) / 2)];
  }

  // src/ui.ts
  var modes = { FULL_AUTO: "\u5B8C\u5168\u81EA\u52A8", EFFORT_AUTO: "\u4EC5\u81EA\u52A8\u601D\u8003\u6863\u4F4D", MODEL_AUTO: "\u4EC5\u81EA\u52A8\u9009\u62E9\u6A21\u578B", MANUAL: "\u624B\u52A8\u6A21\u5F0F" };
  var tiers2 = { simple: "\u7B80\u5355", moderate: "\u5747\u8861", complex: "\u590D\u6742" };
  var roles = { general: "\u901A\u7528", coding: "\u7F16\u7A0B", reasoning: "\u63A8\u7406" };
  function catalogRows(catalog) {
    return (catalog?.groups ?? []).flatMap((group) => group.models.map((model) => ({
      provider: group.id,
      providerName: group.name,
      model: model.id,
      name: model.name,
      efforts: model.reasoning?.efforts ?? []
    })));
  }
  function candidateError(candidates, catalog, saved) {
    const rows = catalogRows(catalog);
    const seen = /* @__PURE__ */ new Set();
    for (const candidate of candidates) {
      const key = JSON.stringify([candidate.provider, candidate.model]);
      if (seen.has(key)) return "\u5019\u9009\u6A21\u578B\u91CD\u590D\uFF0C\u8BF7\u79FB\u9664\u91CD\u590D\u914D\u7F6E\u3002";
      seen.add(key);
      const row = rows.find((item) => sameModel(item, candidate));
      if (!row) {
        if (candidate.enabled && !saved.some((item) => item.enabled && sameModel(item, candidate)))
          return "\u6A21\u578B\u76EE\u5F55\u5DF2\u53D8\u5316\uFF0C\u4E0D\u80FD\u65B0\u542F\u7528\u5F53\u524D\u4E0D\u53EF\u7528\u7684\u6A21\u578B\u3002\u8BF7\u5237\u65B0\u540E\u91CD\u65B0\u9009\u62E9\u3002";
        continue;
      }
      if (Object.values(candidate.effortByTier ?? {}).some((id) => !row.efforts.some((effort) => effort.id === id)))
        return "\u5DF2\u914D\u7F6E\u6863\u4F4D\u4E0D\u518D\u7531\u6A21\u578B\u58F0\u660E\uFF0C\u8BF7\u9009\u62E9\u81EA\u52A8\u6620\u5C04\u6216\u5408\u6CD5\u6863\u4F4D\u3002";
    }
    return null;
  }
  function autoEffort(candidate, efforts, tier) {
    const model = { ...candidate, efforts, effortByTier: {} };
    return effortFor(model, tier);
  }
  function actualControl(actual, status) {
    const decision = status?.decision;
    let reason = status?.conflict ? "\u4E0E Jev Effort Selector \u51B2\u7A81\uFF0C\u672C\u63D2\u4EF6\u5DF2\u9000\u51FA\u81EA\u52A8\u63A7\u5236\u3002" : decision?.reason ? Object.values(explainReason(decision.reason)).join(" ") : "\u6682\u65E0\u8DEF\u7531\u51B3\u7B56\u8BB0\u5F55\u3002";
    if (decision?.control === "Blocked") return { control: "Blocked", reason };
    if (!actual) return {
      control: status?.conflict ? "Conflict" : decision?.control === "Blocked" ? "Blocked" : "Native",
      reason: status?.conflict || decision?.control === "Blocked" ? reason : "\u7B49\u5F85\u539F\u751F\u8BF7\u6C42"
    };
    const selected = decision?.selection;
    const matches = !selected || sameModel(actual, selected) && selected.reasoningEffort === actual.reasoningEffort;
    if (matches && decision?.control === "Fallback" && decision.fallbackApplied) reason = `\u5DF2\u5E94\u7528\u914D\u7F6E\u7684\u5907\u7528\u6A21\u578B\u3002\u5206\u7C7B\u539F\u56E0\uFF1A${decision.reason ?? "\u672A\u77E5"}\u3002${explainReason(decision.reason ?? "").action}`;
    const control = decision?.control === "Fallback" && !decision.fallbackApplied ? "Bypass" : decision?.control ?? "Native";
    return {
      control: status?.conflict ? "Conflict" : matches ? control : "Native",
      reason: matches || status?.conflict ? reason : "Native override\uFF1A\u539F\u751F\u63A7\u5236\u5668\u6539\u53D8\u4E86\u8BF7\u6C42\u3002"
    };
  }

  // src/client.js
  window.__ModuleLoader__.load({
    id: "dsh-plugin-adaptive-router",
    factory: (require2) => {
      const React = require2("react");
      const { Button, Checkbox, Switch, Input, Menu, SettingsForm } = require2("@deepseek-ai/dsh-client-ui-primitives");
      const { createSnapshotStore } = require2("@deepseek-ai/dsh-client-store");
      const h = React.createElement;
      const pkg = "dsh-plugin-adaptive-router";
      const labels = { unavailable: "\u539F\u751F\u914D\u7F6E\u5F53\u524D\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5 Host \u8FDE\u63A5\u3002", readOnly: "\u6B64\u8FDE\u63A5\u4EC5\u5141\u8BB8\u8BFB\u53D6\u914D\u7F6E\u3002", saveFailed: "\u4FDD\u5B58\u5931\u8D25\u6216\u914D\u7F6E\u4FEE\u8BA2\u51B2\u7A81\uFF1B\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002\u8BF7\u64A4\u9500\u8349\u7A3F\u540E\u91CD\u65B0\u7F16\u8F91\uFF0C\u6216\u91CD\u8BD5\u3002", save: "\u4FDD\u5B58", saving: "\u4FDD\u5B58\u4E2D\u2026" };
      const sectionStyle = { minWidth: 0 };
      const fieldStyle = { display: "grid", gap: 6, minWidth: 0 };
      const selectStyle = { color: "inherit", background: "var(--dsw-alias-bg-layer-1, transparent)", border: "1px solid var(--dsw-alias-border-l2, #8886)", borderRadius: 8, padding: "7px 10px", minWidth: 0, maxWidth: "100%" };
      const select = (label, value, options, onChange, disabled) => h(
        "label",
        { key: label, style: fieldStyle },
        label,
        h(
          "select",
          { value, disabled, "aria-label": label, style: selectStyle, onChange: (e) => onChange(e.target.value) },
          options.map(([id, name, unavailable]) => h("option", { key: id, value: id, disabled: unavailable }, name))
        )
      );
      function LabPanel(props) {
        const epoch = props.useAdaptiveLabEpoch((s) => s);
        const directory = props.useAdaptiveCatalog((s) => s);
        const modelName = (provider, model) => catalogRows(directory.value).find((row) => row.provider === provider && row.model === model)?.name ?? model;
        const [data, setData] = React.useState(null), [update, setUpdate] = React.useState(null);
        const [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
        const [confirm, setConfirm] = React.useState(false), [exportOpen, setExportOpen] = React.useState(false);
        const generation = React.useRef(0), writing = React.useRef(false);
        React.useEffect(() => {
          generation.current++;
          writing.current = false;
          setData(null);
          setUpdate(null);
          setBusy(false);
          setError("");
          setConfirm(false);
          setExportOpen(false);
          return () => {
            generation.current++;
          };
        }, [epoch]);
        const act = async (op, args = {}) => {
          if (writing.current) return;
          writing.current = true;
          const version = generation.current;
          setBusy(true);
          setError("");
          try {
            const result = await props.labCall(op, args);
            if (version !== generation.current) return;
            if (!result?.ok) {
              setError(result?.error?.code === "lab/forbidden" && result.error.details?.reason === "environment" ? "lab/environment" : result?.error?.code ?? "lab/rejected");
              return;
            }
            if (op === "checkUpdates") {
              setUpdate(result.value);
              if (result.value.installation) setData((old) => ({ ...old, installation: result.value.installation }));
            } else if (op === "export") {
              const json = args.format === "json", blob = new Blob([json ? JSON.stringify(result.value, null, 2) : result.value], { type: json ? "application/json" : "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob), link = document.createElement("a");
              link.href = url;
              link.download = `router-lab-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.${args.format}`;
              document.body.append(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 0);
            } else {
              setData((old) => ({ ...old, ...result.value }));
              if (op === "read") setUpdate(result.value.update);
            }
            if (op === "clear") setConfirm(false);
          } catch (failure) {
            const http = /^transport failure for \/api\/adaptiveRouterLab\/(read|feedback|clear|export|checkUpdates): HTTP (\d{3})$/.exec(failure?.message ?? "");
            if (version === generation.current) setError(http ? ["401", "403"].includes(http[2]) ? "lab/forbidden" : "lab/rejected" : "lab/disconnected");
          } finally {
            if (version === generation.current) {
              writing.current = false;
              setBusy(false);
            }
          }
        };
        const onOpen = (event) => {
          if (event.currentTarget.open && !data && !writing.current) void act("read");
        };
        const summary = data?.available ? data.summary : null, installation = data?.installation;
        const small = { fontSize: 12, opacity: 0.8, overflowWrap: "anywhere" };
        const feedbackNames = { met: "\u8FBE\u5230\u9884\u671F", rework: "\u9700\u8981\u8FD4\u5DE5", unknown: "\u65E0\u6CD5\u5224\u65AD" };
        const sourceNames = { link: "\u672C\u5730 link / \u5DE5\u4F5C\u533A", tgz: "\u672C\u5730\u6216\u8FDC\u7A0B tgz", "fixed-sha": "\u56FA\u5B9A SHA\uFF08\u58F0\u660E\u6765\u6E90\uFF09", "git-tag": "GitHub Tag", "github-main": "GitHub \u5F00\u53D1\u5206\u652F", npm: "npm", unknown: "\u5B89\u88C5\u6765\u6E90\u65E0\u6CD5\u8BC6\u522B" };
        const updateNames = { "no-release": "\u6682\u65E0\u6B63\u5F0F Release", "newer-release": "\u53D1\u73B0\u8F83\u65B0 Release", "no-newer-release": "\u6CA1\u6709\u66F4\u9AD8\u7684\u53EF\u6BD4\u8F83 Release\uFF08\u4E0D\u7B49\u4E8E\u4EE3\u7801\u6700\u65B0\uFF09", "release-uncomparable": "Release \u7248\u672C\u65E0\u6CD5\u6BD4\u8F83", "development-ahead": "\u5F00\u53D1\u5206\u652F\u6709\u65B0\u63D0\u4EA4", "confirmed-current": "\u5DF2\u662F\u6700\u65B0\u53EF\u786E\u8BA4 main \u63D0\u4EA4", "installed-commit-unknown": "\u5B9E\u9645\u5B89\u88C5\u63D0\u4EA4\u672A\u77E5", "comparison-unknown": "\u5B9E\u9645\u5B89\u88C5\u4E0E main \u65E0\u6CD5\u7CBE\u786E\u6BD4\u8F83", "installed-ahead": "\u5DF2\u786E\u8BA4\u5B89\u88C5\u63D0\u4EA4\u9886\u5148 main", diverged: "\u5B9E\u9645\u5B89\u88C5\u4E0E main \u5386\u53F2\u5206\u53C9", "rate-limited": "GitHub \u9650\u6D41", timeout: "\u68C0\u67E5\u8D85\u65F6", "network-unavailable": "\u7F51\u7EDC\u4E0D\u53EF\u7528", "check-failed": "\u68C0\u67E5\u5931\u8D25", "invalid-response": "\u66F4\u65B0\u54CD\u5E94\u4E0D\u5408\u6CD5", "response-too-large": "\u66F4\u65B0\u54CD\u5E94\u8D85\u51FA\u9650\u5236" };
        React.useEffect(() => {
          if (!props.maintenanceOnly) void act("read");
        }, [epoch]);
        const errorCopy = {
          "lab/environment": ["\u5F53\u524D\u73AF\u5883\u65E0\u6CD5\u67E5\u770B\u5B9E\u9A8C\u6570\u636E", "\u8BF7\u4F7F\u7528\u4EC5\u7ED1\u5B9A\u672C\u673A\u7684 DSH Profile\uFF1B\u8FDC\u7A0B\u8BBF\u95EE\u6682\u4E0D\u652F\u6301\u3002"],
          "lab/forbidden": ["\u5F53\u524D\u8D26\u6237\u65E0\u6743\u6267\u884C\u6B64\u64CD\u4F5C", "\u8BF7\u4F7F\u7528\u5DF2\u767B\u5F55\u7684\u672C\u673A DSH\uFF0C\u5E76\u68C0\u67E5\u914D\u7F6E\u662F\u5426\u53EF\u5199\u3002"],
          "lab/storage-unavailable": ["\u6570\u636E\u5B58\u50A8\u6682\u4E0D\u53EF\u7528", "\u8BF7\u68C0\u67E5 Host \u7684\u5B58\u50A8\u670D\u52A1\u540E\u91CD\u8BD5\uFF1B\u6B63\u5E38\u804A\u5929\u4E0D\u53D7\u5F71\u54CD\u3002"],
          "lab/record-conflict": ["\u8BB0\u5F55\u5DF2\u66F4\u65B0", "\u8BF7\u5237\u65B0\u6570\u636E\u540E\u91CD\u65B0\u53CD\u9988\u3002\u5DF2\u4FDD\u5B58\u8BB0\u5F55\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002"],
          "lab/disconnected": ["\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u8BF7\u91CD\u8BD5", "\u786E\u8BA4 DSH Host \u6B63\u5728\u8FD0\u884C\uFF0C\u91CD\u65B0\u8FDE\u63A5\u540E\u5237\u65B0\u3002"],
          "lab/initializing": ["\u6B63\u5728\u51C6\u5907\u5B9E\u9A8C\u6570\u636E", "\u7A0D\u540E\u5237\u65B0\u5373\u53EF\u3002"],
          "lab/rejected": ["\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", "\u8BF7\u5237\u65B0\u6570\u636E\uFF1B\u5982\u4ECD\u5931\u8D25\uFF0C\u53EF\u63D0\u4F9B\u4E0B\u65B9\u9519\u8BEF\u4EE3\u7801\u3002"]
        };
        const problem = error && (Object.hasOwn(errorCopy, error) ? errorCopy[error] : errorCopy["lab/rejected"]);
        const errorView = problem && h("div", { role: "alert", className: "ar-error" }, h("strong", null, problem[0]), h("small", null, problem[1]), h("details", null, h("summary", null, "\u6280\u672F\u8BE6\u60C5"), h("code", null, Object.hasOwn(errorCopy, error) ? error : "lab/rejected")));
        const metrics = data?.available && summary && [["\u5DF2\u8BB0\u5F55\u8F6E\u6B21", summary.turns], ["\u81EA\u52A8\u8DEF\u7531\u6B21\u6570", summary.controls.Auto ?? 0], ["\u6A21\u578B\u8BF7\u6C42\u6B21\u6570", summary.requestAttribution?.total ?? null], ["\u4EFB\u52A1\u53CD\u9988", summary.feedbackCount]];
        const outcome = { completed: "\u6D41\u7A0B\u5B8C\u6210", error: "\u6267\u884C\u62A5\u9519", aborted: "\u5DF2\u4E2D\u65AD", interrupted: "\u5DF2\u4E2D\u65AD", blocked: "\u5DF2\u963B\u6B62", "max-tokens": "\u8FBE\u5230\u8F93\u51FA\u4E0A\u9650", forked: "\u5DF2\u5206\u652F", unknown: "\u7ED3\u679C\u672A\u77E5" };
        const tokenNames = { inputTokens: "\u8F93\u5165 Token", outputTokens: "\u8F93\u51FA Token", cacheReadTokens: "\u7F13\u5B58\u8BFB\u53D6", cacheWriteTokens: "\u7F13\u5B58\u5199\u5165", reasoningTokens: "\u63A8\u7406 Token" };
        return h(
          React.Fragment,
          null,
          !props.maintenanceOnly && h(
            "section",
            { className: "ar-card", "aria-label": "\u8DEF\u7531\u5B9E\u9A8C\u5BA4" },
            h("div", { className: "ar-row" }, h("h3", null, "\u8DEF\u7531\u5B9E\u9A8C\u5BA4"), h("span", { className: "ar-status", role: "status" }, props.pending ? "\u5F85\u4FDD\u5B58" : data && !data.available ? "\u6570\u636E\u4E0D\u53EF\u7528" : !props.routerEnabled && props.enabled ? "\u5DF2\u6682\u505C" : props.enabled ? "\u8BB0\u5F55\u4E2D" : "\u672A\u5F00\u542F")),
            h("p", { className: "ar-note" }, "\u81EA\u52A8\u8BB0\u5F55\u65E5\u5E38\u4EFB\u52A1\uFF0C\u5E2E\u52A9\u4E86\u89E3\u8DEF\u7531\u6548\u679C\u3002"),
            h("div", { className: "ar-row" }, h("span", null, "\u8BB0\u5F55\u4F7F\u7528\u6570\u636E"), h(Switch, { label: "\u8BB0\u5F55\u4F7F\u7528\u6570\u636E", checked: !!props.enabled, disabled: props.disabled, onChange: props.onChange })),
            h("small", null, "\u4EC5\u8BB0\u5F55\u4F7F\u7528\u5143\u6570\u636E\uFF0C\u4E0D\u542B\u804A\u5929\u6B63\u6587\u3002\u4FDD\u5B58\u540E\u751F\u6548\uFF1B\u5173\u95ED\u540E\u4FDD\u7559\u5DF2\u6709\u6570\u636E\u3002"),
            busy && h("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u2026"),
            errorView,
            data && !data.available && h("p", { role: "status" }, "\u6570\u636E\u5B58\u50A8\u6682\u4E0D\u53EF\u7528\u3002\u8BF7\u68C0\u67E5 Host \u5B58\u50A8\u670D\u52A1\uFF1B\u6B63\u5E38\u804A\u5929\u4E0D\u53D7\u5F71\u54CD\u3002"),
            data?.error && h("p", { role: "alert" }, "\u90E8\u5206\u6570\u636E\u5C1A\u672A\u4FDD\u5B58\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\uFF1B\u6B63\u5E38\u804A\u5929\u4E0D\u53D7\u5F71\u54CD\u3002"),
            metrics && h("div", { className: "ar-metrics" }, ...metrics.map(([name, n]) => h("div", { key: name, className: "ar-metric" }, h("strong", null, n ?? "\u2014"), h("span", null, name)))),
            data?.available && !summary?.turns && h("p", { className: "ar-empty" }, "\u8FD8\u6CA1\u6709\u8BB0\u5F55\u3002\u5F00\u542F\u540E\u6B63\u5E38\u804A\u5929\u5373\u53EF\u81EA\u52A8\u79EF\u7D2F\u6570\u636E\u3002"),
            h(
              "div",
              { className: "ar-row" },
              h(Button, { size: "sm", disabled: busy, onClick: () => act("read") }, "\u5237\u65B0\u5B9E\u9A8C\u6570\u636E"),
              h(Menu, { open: exportOpen, onClose: () => setExportOpen(false), portal: true, autoFocus: true, compact: true, side: "bottom", align: "end", anchor: h(Button, { size: "sm", disabled: busy || !data?.available, "aria-haspopup": "menu", "aria-expanded": exportOpen, onClick: () => setExportOpen((v) => !v) }, "\u5BFC\u51FA\u6570\u636E"), items: [{ id: "json", label: "\u5BFC\u51FA JSON" }, { id: "csv", label: "\u5BFC\u51FA CSV" }], onSelect: (format) => {
                setExportOpen(false);
                if (["json", "csv"].includes(format)) void act("export", { format });
              } })
            ),
            h("details", { "aria-label": "\u5B9E\u9A8C\u6570\u636E\u8BE6\u60C5" }, h("summary", null, "\u66F4\u591A\u7EDF\u8BA1"), summary && h(
              "div",
              { className: "ar-stack" },
              h("dl", { className: "ar-data" }, ...[["\u539F\u751F\u653E\u884C", summary.controls.Bypass ?? 0], ["\u5907\u7528\u6A21\u578B\u5207\u6362", summary.fallbackApplied], ["\u624B\u52A8\u63A7\u5236", summary.controls.Manual ?? 0], ["\u5B89\u5168\u963B\u6B62", summary.controls.Blocked ?? 0], ["\u6D41\u7A0B\u5B8C\u6210", summary.outcomes.completed ?? 0], ["\u62A5\u9519", summary.outcomes.error ?? 0], ["\u4E2D\u65AD", (summary.outcomes.aborted ?? 0) + (summary.outcomes.interrupted ?? 0)], ["\u6709\u6548\u5206\u7C7B", summary.classified], ["\u5206\u7C7B\u5E73\u5747\u8017\u65F6", `${summary.classifierLatency.meanMs?.toFixed(1) ?? "\u672A\u77E5"} ms \xB7 ${summary.classifierLatency.coverage}/${summary.turns}`], ["\u914D\u7F6E\u7248\u672C", summary.configRevisions]].flatMap(([key, val]) => [h("dt", { key: key + "k" }, key), h("dd", { key }, val)])),
              h("p", { className: "ar-note" }, `Token \u6570\u636E\u8986\u76D6 ${summary.tokenCoverage}/${summary.turns}\uFF1B\u7F3A\u5931\u6570\u636E\u4E0D\u6309 0 \u7EDF\u8BA1\u3002`),
              summary.requestAttribution && h("p", { className: "ar-note" }, `\u6A21\u578B\u6765\u6E90\u8986\u76D6 ${summary.requestAttribution.confirmed}/${summary.requestAttribution.total}\uFF1B\u90E8\u5206\u6A21\u578B\u8BF7\u6C42\u6765\u6E90\u672A\u77E5\uFF08${summary.requestAttribution.unknown}\uFF09\u3002\u65E7\u7248\u672A\u9A8C\u8BC1 ${summary.requestAttribution.legacyTurns} \u8F6E\uFF0C\u8BF7\u6C42\u6570\u672A\u77E5 ${summary.requestAttribution.countMissingTurns} \u8F6E\u3002`),
              h("dl", { className: "ar-data" }, ...Object.entries(summary.tokens).flatMap(([key, bucket]) => [h("dt", { key: key + "k" }, tokenNames[key] ?? key), h("dd", { key }, `${bucket.coverage ? bucket.value : "\u672A\u77E5"} \xB7 ${bucket.coverage}/${summary.turns}`)])),
              summary.models.length > 0 && h("details", null, h("summary", null, "\u6A21\u578B\u4F7F\u7528\u5206\u5E03"), ...summary.models.map((model) => h("div", { key: JSON.stringify([model.provider, model.model]), className: "ar-stack", style: { marginBottom: 10 } }, h("div", { className: "ar-row" }, h("span", { className: "ar-model", title: `${model.provider}/${model.model}` }, model.model === "unknown" ? "\u6765\u6E90\u672A\u77E5" : modelName(model.provider, model.model)), h("strong", null, `${model.requests} \u6B21`)), h("progress", { value: model.requests, max: Math.max(1, summary.requestAttribution?.total ?? model.requests), "aria-label": `${model.model} \u8BF7\u6C42\u5360\u6BD4` }), h("small", null, `${model.provider} \xB7 \u6863\u4F4D ${JSON.stringify(model.efforts)} \xB7 \u5C42\u7EA7 ${JSON.stringify(model.tiers)}`)))),
              h("small", null, `\u53CD\u9988\uFF1A\u8FBE\u5230\u9884\u671F ${summary.feedback.met ?? 0} / \u9700\u8981\u8FD4\u5DE5 ${summary.feedback.rework ?? 0} / \u65E0\u6CD5\u5224\u65AD ${summary.feedback.unknown ?? 0}\u3002\u672A\u8BC4\u5206\u4E0D\u7B97\u6210\u529F\u3002`),
              (summary.modelsTruncated || summary.distributionTruncated > 0) && h("small", null, "\u90E8\u5206\u6A21\u578B\u5206\u5E03\u5DF2\u622A\u65AD\uFF0C\u5B8C\u6574\u8BB0\u5F55\u8BF7\u5BFC\u51FA\u67E5\u770B\u3002")
            )),
            h("details", null, h("summary", null, "\u6700\u8FD1\u8BB0\u5F55", summary?.turns ? ` \xB7 ${Math.min(25, summary.turns)}` : ""), ...(data?.recent ?? []).map((row) => h(
              "details",
              { key: row.recordId, className: "ar-candidate" },
              h("summary", null, `${new Date(row.timestamp).toLocaleString()} \xB7 ${modelName(row.actualProvider, row.actualModel) ?? "\u672A\u77E5\u6A21\u578B"} \xB7 ${outcome[row.turnFinishReason] ?? "\u7ED3\u679C\u672A\u77E5"} \xB7 ${feedbackNames[row.rating] ?? "\u672A\u53CD\u9988"}`),
              h(
                "div",
                { className: "ar-stack" },
                h("p", { className: "ar-note" }, `\u6700\u7EC8 Header\uFF1A${row.actualProvider ?? "\u672A\u77E5"} / ${row.actualModel ?? "\u672A\u77E5"} \xB7 ${row.actualEffort ?? "\u6A21\u578B\u9ED8\u8BA4"}`),
                h("p", { className: "ar-note" }, `\u8DEF\u7531\u539F\u56E0\uFF1A${explainReason(row.reasonCode ?? "").reason}\uFF08${row.reasonCode ?? "unknown"}\uFF09`),
                h("p", { className: "ar-note" }, `\u5206\u7C7B\uFF1A${row.source ?? "\u672A\u77E5"} \xB7 ${row.tier ?? "\u672A\u77E5"} \xB7 \u8BF7\u6C42 ${row.modelRequestCount ?? "\u672A\u77E5"} \xB7 \u8F93\u5165 ${row.inputTokens ?? "\u672A\u77E5"} / \u8F93\u51FA ${row.outputTokens ?? "\u672A\u77E5"} Token`),
                h("small", null, `\u6570\u636E\u6765\u6E90 ${row.usageSource ?? "unknown"} \xB7 \u6A21\u578B\u5F52\u5C5E ${row.requestAttribution ?? "legacy-header"} \xB7 \u4F1A\u8BDD\u4EE3\u53F7 ${row.sessionScope?.slice(0, 8) ?? "\u672A\u77E5"} \xB7 \u7B2C ${row.turnNumber} \u8F6E \xB7 ${row.routingMode} \xB7 ${row.control ?? "\u672A\u77E5"} \xB7 \u914D\u7F6E ${row.experimentConfigRevision?.slice(0, 8) ?? "\u672A\u77E5"}`),
                h("div", { role: "group", "aria-label": `Turn ${row.turnNumber} ${row.recordId.slice(0, 8)} \u53CD\u9988`, className: "ar-row" }, ...Object.entries(feedbackNames).map(([rating, label]) => h(Button, { key: rating, size: "sm", disabled: busy || !props.writable, "aria-pressed": row.rating === rating, onClick: () => act("feedback", { id: row.recordId, rating, revision: row.revision }) }, label)))
              )
            ))),
            h("details", null, h("summary", null, "\u6570\u636E\u8BF4\u660E\u4E0E\u7BA1\u7406"), h(
              "div",
              { className: "ar-stack" },
              h("p", { className: "ar-note" }, "\u8FD9\u662F Turn \u7EA7\u89C2\u5BDF\u6027\u8BB0\u5F55\u3002completed \u4E0D\u662F\u4EFB\u52A1\u6210\u529F\uFF0C\u7EDF\u8BA1\u7ED3\u679C\u4E0D\u80FD\u76F4\u63A5\u8BC1\u660E\u8DEF\u7531\u66F4\u597D\u6216\u8282\u7701\u8D39\u7528\u3002\u4EC5\u672C\u673A\u8BA4\u8BC1\u8D26\u6237\u53EF\u8BBF\u95EE\uFF1B\u4E0D\u652F\u6301\u591A\u7528\u6237\u8FDC\u7A0B\u8BBF\u95EE\u3002"),
              h("p", { className: "ar-note" }, "\u6CA1\u6709\u804A\u5929\u6B63\u6587\u3001\u5DE5\u5177\u5185\u5BB9\u6216\u5BC6\u94A5\u3002\u9ED8\u8BA4\u672C\u5730\u5B58\u50A8\u4E0D\u52A0\u5BC6\uFF0C\u5378\u8F7D\u540E\u4FDD\u7559\u3002\u667A\u80FD\u8DEF\u7531\u5173\u95ED\u4F1A\u505C\u6B62\u91C7\u96C6\uFF1B\u8981\u8BB0\u5F55\u539F\u751F\u4F7F\u7528\u60C5\u51B5\u53EF\u9009\u62E9\u624B\u52A8\u6A21\u5F0F\u3002"),
              data && h("p", { className: "ar-note" }, `\u5F85\u4FDD\u5B58 ${data.pending} \xB7 \u672A\u8986\u76D6 ${data.dropped}\u3002\u6700\u591A 5000 \u8F6E / 90 \u5929 / 8 MiB\uFF1B\u5F02\u5E38\u9000\u51FA\u53EF\u80FD\u4E22\u5931\u672A\u4FDD\u5B58\u8BB0\u5F55\u3002\u5B58\u50A8 ${data.domain ?? "\u5F85\u786E\u8BA4"}\uFF0C\u4F4D\u7F6E\u7531 Host \u7BA1\u7406\u3002`),
              h("small", null, "\u8BF7\u6C42\u5206\u5E03\u53EA\u4F7F\u7528\u539F\u751F\u6D88\u606F\u6765\u6E90\uFF1B\u5931\u8D25\u5C1D\u8BD5\u53CA\u9010\u8BF7\u6C42\u6863\u4F4D\u65E0\u53EF\u9760\u8BC1\u636E\u65F6\u4E3A unknown\u3002\u6700\u7EC8 Header \u4E0D\u4EE3\u8868\u6BCF\u6B21\u8BF7\u6C42\u3002"),
              h(Button, { size: "sm", disabled: busy || !props.writable || !data?.available, onClick: () => setConfirm(true) }, "\u6E05\u7A7A\u5B9E\u9A8C\u6570\u636E"),
              confirm && h("div", { role: "group", "aria-label": "\u786E\u8BA4\u6E05\u7A7A\u5B9E\u9A8C\u6570\u636E", className: "ar-stack" }, h("p", null, "\u6C38\u4E45\u6E05\u7A7A\u6B64\u63D2\u4EF6\u7684\u8BB0\u5F55\u548C\u53CD\u9988\uFF1FDSH \u4F1A\u8BDD\u4E0D\u4F1A\u5220\u9664\uFF1B\u8FDB\u884C\u4E2D\u7684\u8BB0\u5F55\u4E0D\u4F1A\u8865\u56DE\u3002"), h("div", { className: "ar-row" }, h(Button, { disabled: busy, onClick: () => act("clear", { confirm: true }) }, "\u786E\u8BA4\u6E05\u7A7A"), h(Button, { disabled: busy, onClick: () => setConfirm(false) }, "\u53D6\u6D88")))
            ))
          ),
          props.maintenanceOnly && h(
            "details",
            { className: "ar-card", onToggle: onOpen },
            h("summary", null, "\u66F4\u65B0\u4E0E\u7EF4\u62A4"),
            h("p", { style: small }, `\u5F53\u524D\u7248\u672C ${installation?.version ?? "\u5F85\u8BFB\u53D6"} \xB7 ${sourceNames[installation?.sourceKind] ?? "\u5B89\u88C5\u6765\u6E90\u672A\u77E5"} \xB7 Profile ${installation?.profile ?? "\u672A\u77E5"} \xB7 \u76EE\u6807 DSH ${installation?.targetDsh ?? "0.2.1-alpha.2"}`),
            h("p", { style: small }, `\u5DF2\u5B89\u88C5 Commit\uFF1A${installation?.installedCommit ?? "\u65E0\u6CD5\u51C6\u786E\u786E\u5B9A"}${installation?.declaredCommit ? "\uFF1B\u58F0\u660E\u56FA\u5B9A SHA " + installation.declaredCommit + "\uFF0C\u4E0D\u5192\u5145\u9501\u5B9A\u540E\u7684\u5B89\u88C5\u8BC1\u636E" : ""}`),
            h(Button, { disabled: busy, onClick: () => act("checkUpdates") }, "\u68C0\u67E5\u66F4\u65B0"),
            busy && h("p", { role: "status" }, "\u5904\u7406\u4E2D\u2026"),
            h("small", null, "\u4EC5\u68C0\u67E5\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u5B89\u88C5\u3002Release \u4E0E main \u5F00\u53D1\u63D0\u4EA4\u5206\u522B\u663E\u793A\u3002"),
            update && h("p", { role: "status", style: small }, `${new Date(update.checkedAt).toLocaleString()} \xB7 ${update.error ? updateNames[update.error] ?? "\u68C0\u67E5\u5931\u8D25" : [updateNames[update.releaseStatus], updateNames[update.mainStatus], update.npmStatus && update.npmStatus !== "not-checked" ? "npm\uFF1A" + ({ "newer-version": "\u53D1\u73B0\u8F83\u65B0\u7248\u672C", "no-release": "\u6682\u65E0\u6B63\u5F0F\u53D1\u5E03", "comparison-unknown": "\u7248\u672C\u6BD4\u8F83\u672A\u786E\u8BA4" }[update.npmStatus] ?? "\u7ED3\u679C\u672A\u77E5") : null, update.compatibility === "declared-target-match" ? "\u58F0\u660E\u652F\u6301\u76EE\u6807\u7248\u672C\uFF08\u672A\u7ECF\u8FD0\u884C\u9A8C\u8BC1\uFF09" : update.compatibility === "target-mismatch" ? "\u76EE\u6807\u7248\u672C\u4E0D\u517C\u5BB9" : "\u517C\u5BB9\u6027\u672A\u786E\u8BA4"].filter(Boolean).join(" \xB7 ")}`),
            update?.mainCommit && h("p", { style: small }, `GitHub \u6700\u65B0 main\uFF1A${update.mainCommit}`),
            update?.comparison && h("p", { style: small }, update.comparison.basis ? `${update.comparison.basis === "declared" ? "\u58F0\u660E\u6765\u6E90 SHA\uFF08\u672A\u9A8C\u8BC1\u5B9E\u9645\u8FD0\u884C\uFF09" : "\u5DF2\u786E\u8BA4\u5B89\u88C5 SHA"}\uFF1A${update.comparison.commit} \xB7 ${{ ahead: "main \u6709\u8F83\u65B0\u63D0\u4EA4", behind: "main \u843D\u540E\u4E8E\u6BD4\u8F83\u57FA\u51C6", identical: "\u63D0\u4EA4\u76F8\u540C", diverged: "\u5386\u53F2\u5DF2\u5206\u53C9\uFF0C\u4E0D\u80FD\u7EBF\u6027\u5224\u65AD\u65B0\u65E7", unknown: "\u65E0\u6CD5\u6BD4\u8F83", unavailable: "\u6BD4\u8F83\u4E0D\u53EF\u7528" }[update.comparison.status] ?? "\u6BD4\u8F83\u672A\u786E\u8BA4"}\uFF1B${update.comparison.error ? updateNames[update.comparison.error] ?? ({ "comparison-not-found": "SHA \u4E0D\u5C5E\u4E8E\u8BE5\u4ED3\u5E93\u6216\u6BD4\u8F83\u4E0D\u53EF\u7528", "comparison-failed": "\u6BD4\u8F83\u5931\u8D25", "invalid-comparison": "\u6BD4\u8F83\u54CD\u5E94\u8BC1\u636E\u4E0D\u8DB3" }[update.comparison.error] ?? "\u6BD4\u8F83\u5931\u8D25") : update.comparison.changeKind === "documentation-only" ? "\u5B8C\u6574\u6587\u4EF6\u6E05\u5355\u4EC5\u6D89\u53CA\u6587\u6863/\u56FE\u7247" : update.comparison.changeKind === "no-file-changes" ? "\u6CA1\u6709\u6587\u4EF6\u53D8\u5316" : update.comparison.filesComplete ? "\u542B\u4EE3\u7801\u6216\u5176\u4ED6\u6587\u4EF6\u53D8\u5316" : "\u6587\u4EF6\u6E05\u5355\u5B8C\u6574\u6027\u672A\u786E\u8BA4"}\u3002${update.comparison.basis === "declared" ? "\u8FD9\u4E0D\u662F\u5B9E\u9645\u8FD0\u884C\u7248\u672C\u7684\u9A8C\u8BC1\u7ED3\u679C\u3002" : ""}` : "\u6CA1\u6709\u53EF\u6BD4\u8F83\u7684\u5B89\u88C5\u63D0\u4EA4\uFF1Btgz / package version \u4E0D\u80FD\u8BC1\u660E\u4E0E main \u4EE3\u7801\u76F8\u540C\u3002"),
            errorView,
            h("a", { href: "https://github.com/Xuanyi-king/DSH-Adaptive-Router", target: "_blank", rel: "noopener noreferrer" }, "\u6253\u5F00 GitHub"),
            " \xB7 ",
            h("a", { href: "https://github.com/Xuanyi-king/DSH-Adaptive-Router/releases", target: "_blank", rel: "noopener noreferrer" }, "\u67E5\u770B Releases"),
            h("details", null, h("summary", null, "\u5B89\u5168\u5347\u7EA7\u8BF4\u660E"), h("p", { style: small }, "\u53EA\u8BFB\u68C0\u67E5\uFF0C\u7EDD\u4E0D\u5B89\u88C5\u6216\u4FEE\u6539 Profile\u3002\u5B9E\u9645\u5347\u7EA7\u8BF7\u5148\u5907\u4EFD\u5F53\u524D Profile/\u6765\u6E90/lock\uFF0C\u5728 DSH \u5916\u90E8\u5B8C\u5168\u9000\u51FA Host\uFF0C\u518D\u7528\u5B98\u65B9\u7BA1\u7406\u5668\u56FA\u5B9A\u7248\u672C\u5B89\u88C5\uFF1B\u91CD\u542F\u6838\u5BF9 active \u5E76\u4FDD\u7559\u56DE\u6EDA\u5305\u3002desktop \u4E0E web \u4E0D\u53EF\u6DF7\u7528\u3002"))
          )
        );
      }
      function Settings(props) {
        const snapshot = props.useAdaptiveSettings((s) => s);
        const directory = props.useAdaptiveCatalog((s) => s);
        const setup = props.useAdaptiveSetup((s) => s);
        const epoch = props.useAdaptiveLabEpoch((s) => s);
        const [preset, setPreset] = React.useState(null);
        const [checking, setChecking] = React.useState(false);
        const checkingRef = React.useRef(false);
        const checkGeneration = React.useRef(0);
        const [checkNotice, setCheckNotice] = React.useState("");
        const [draft, setDraft] = React.useState(null);
        const baseline = React.useRef(null);
        const writing = React.useRef(false);
        const mounted = React.useRef(true);
        const [saving, setSaving] = React.useState(false);
        const [failed, setFailed] = React.useState(false);
        const [notice, setNotice] = React.useState("");
        const [search, setSearch] = React.useState("");
        React.useEffect(() => {
          mounted.current = true;
          return () => {
            mounted.current = false;
          };
        }, []);
        const value = { ...snapshot.value, ...draft };
        const candidates = value.candidates ?? [];
        const presetValue = preset ?? (engineFor(value) === "NeoHorse" && value.apiUrl === "https://tokenrhythm.studio/v1/systemone" ? "neohorse-hosted" : engineFor(value) === "NeoHorse" && value.apiUrl === "http://127.0.0.1:8080/v1/systemone" ? "neohorse-local" : value.classifierModel === "jev-latest" ? "jev" : "custom");
        const rows = catalogRows(directory.value);
        const disabled = !snapshot.writable || saving;
        const discard = () => {
          setDraft(null);
          baseline.current = null;
          setFailed(false);
          setNotice("");
          setPreset(null);
          setCheckNotice("");
          checkGeneration.current++;
          checkingRef.current = false;
          setChecking(false);
        };
        const edit = (field, next) => {
          if (disabled) return;
          if (baseline.current === null) baseline.current = { revision: snapshot.revision, value: snapshot.value };
          setDraft((old) => ({ ...old, [field]: next }));
          setFailed(false);
          setNotice("");
        };
        const invalid = draft?.candidates && directory.value ? candidateError(candidates, directory.value, baseline.current?.value.candidates ?? []) : null;
        const save = async () => {
          if (writing.current || !draft || !snapshot.writable) return;
          writing.current = true;
          setSaving(true);
          setFailed(false);
          setNotice("");
          try {
            if (draft.candidates) {
              const catalog = await props.refreshCatalog();
              const error = candidateError(draft.candidates, catalog, baseline.current?.value.candidates ?? []);
              if (error) throw new Error(error);
            }
            const accepted = await props.mutate(Object.entries(draft).map(([field, next]) => ({ op: "set", path: [field], value: next })), baseline.current?.revision);
            if (mounted.current) {
              if (accepted) {
                setDraft(null);
                baseline.current = null;
                setNotice("\u5DF2\u4FDD\u5B58\u3002");
              } else setFailed(true);
            }
          } catch (error) {
            if (mounted.current) {
              setFailed(true);
              setNotice(error.message === "catalog-unavailable" ? "\u6A21\u578B\u76EE\u5F55\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002" : "\u914D\u7F6E\u672A\u4FDD\u5B58\uFF0C\u8BF7\u68C0\u67E5\u6A21\u578B\u548C\u6863\u4F4D\u6216\u5237\u65B0\u914D\u7F6E\u3002");
            }
          } finally {
            writing.current = false;
            if (mounted.current) setSaving(false);
          }
        };
        const changeCandidate = (index, patch) => edit("candidates", candidates.map((item, i) => i === index ? { ...item, ...patch } : item));
        const enabledRows = candidates.filter((item) => item.enabled);
        const availableEfforts = [...new Set(rows.filter((row) => enabledRows.some((item) => item.provider === row.provider && item.model === row.model)).flatMap((row) => row.efforts.map((e) => e.id)))];
        const fixed = value.fixedEffort ?? "";
        const fallback = value.fallback ?? "";
        const connectionDraft = !!draft && ["apiUrl", "apiKeyEnv", "classifierModel"].some((k) => Object.hasOwn(draft, k));
        const stateNames = { Ready: "\u6B63\u5E38", Unverified: "\u5F85\u9A8C\u8BC1", "Needs Setup": "\u9700\u8981\u914D\u7F6E", Degraded: "\u5DF2\u964D\u7EA7", Conflict: "\u5B58\u5728\u51B2\u7A81", Manual: "\u624B\u52A8\u63A7\u5236", Disabled: "\u5DF2\u5173\u95ED", Native: "\u6A21\u578B\u9ED8\u8BA4" };
        const modeHelp = { FULL_AUTO: "\u81EA\u52A8\u9009\u62E9\u6A21\u578B\u548C\u601D\u8003\u6863\u4F4D\u3002", MODEL_AUTO: "\u53EA\u81EA\u52A8\u9009\u62E9\u6A21\u578B\u3002", EFFORT_AUTO: "\u53EA\u8C03\u6574\u601D\u8003\u6863\u4F4D\u3002", MANUAL: "\u4FDD\u6301 DSH \u539F\u751F\u9009\u62E9\u3002" };
        React.useEffect(() => {
          checkGeneration.current++;
          checkingRef.current = false;
          setChecking(false);
          setCheckNotice("");
        }, [epoch, snapshot.revision, connectionDraft]);
        const ready = readiness(value, {
          catalog: directory.status === "ready" ? directory.value : null,
          keyAvailable: connectionDraft ? void 0 : setup.value?.keyAvailable,
          verified: !draft && setup.value?.verified,
          conflict: setup.value?.conflict,
          failure: connectionDraft ? void 0 : setup.value?.verification?.failure
        });
        const checkConnection = async () => {
          if (checkingRef.current) return;
          checkingRef.current = true;
          const generation = ++checkGeneration.current;
          setChecking(true);
          setCheckNotice("");
          try {
            const result = await props.refreshSetup();
            if (mounted.current && generation === checkGeneration.current) setCheckNotice(!result ? "\u68C0\u67E5\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u786E\u8BA4 Host \u8FDE\u63A5\u3002" : !result.endpointValid ? "\u8BF7\u586B\u5199\u6709\u6548\u7684\u63A5\u53E3\u5730\u5740\u3002" : result.keyAvailable === false ? "\u672A\u627E\u5230 API Key \u51ED\u636E\uFF0C\u8BF7\u5728 DSH \u51ED\u636E\u7BA1\u7406\u4E2D\u4FDD\u5B58\u5BF9\u5E94\u540D\u79F0\u3002" : result.verified ? "\u670D\u52A1\u5DF2\u9A8C\u8BC1\u3002" : result.keyAvailable === true ? "\u914D\u7F6E\u6B63\u5E38\uFF0C\u7B49\u5F85\u9996\u6B21\u5B9E\u9645\u8C03\u7528\u3002" : "\u51ED\u636E\u72B6\u6001\u5F85\u786E\u8BA4\uFF0C\u5C1A\u672A\u9A8C\u8BC1\u8FDE\u63A5\u3002");
          } catch {
            if (mounted.current && generation === checkGeneration.current) setCheckNotice("\u68C0\u67E5\u6682\u4E0D\u53EF\u7528\uFF0C\u5C1A\u672A\u9A8C\u8BC1\u8FDE\u63A5\u3002");
          } finally {
            if (generation === checkGeneration.current) {
              checkingRef.current = false;
              if (mounted.current) setChecking(false);
            }
          }
        };
        if (props.view === "summary") return h("span", null, modes[value.mode] ?? value.mode, " \xB7 ", enabledRows.length, " \u4E2A\u5019\u9009");
        return h(
          SettingsForm,
          {
            labels,
            state: { available: snapshot.status === "ready", writable: snapshot.writable, dirty: !!draft, invalid: !!invalid || !snapshot.writable, saving, failed },
            onSave: save,
            onDiscard: discard
          },
          h(
            "div",
            { className: "ar-settings" },
            h("style", null, settingsCss),
            h(
              "section",
              { className: "ar-card", "aria-label": "\u667A\u80FD\u8DEF\u7531\u8BBE\u7F6E" },
              h(
                "div",
                { className: "ar-row" },
                h("h3", null, "\u667A\u80FD\u8DEF\u7531"),
                h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, h(Switch, { label: "\u542F\u7528\u667A\u80FD\u8DEF\u7531", checked: !!value.enabled, disabled, onChange: (next) => edit("enabled", next) }), value.enabled ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED")
              ),
              select("\u8DEF\u7531\u6A21\u5F0F\uFF08\u6240\u6709\u4F1A\u8BDD\uFF09", value.mode, [["FULL_AUTO", "\u5B8C\u5168\u81EA\u52A8"], ["MODEL_AUTO", "\u81EA\u52A8\u6A21\u578B"], ["EFFORT_AUTO", "\u81EA\u52A8\u6863\u4F4D"], ["MANUAL", "\u624B\u52A8"]], (next) => edit("mode", next), disabled),
              h("div", { className: "ar-row" }, h("span", { className: "ar-status", role: "status", "aria-label": "\u8DEF\u7531\u5C31\u7EEA\u72B6\u6001", "data-state": ready.state }, stateNames[ready.state] ?? ready.state), h("small", null, modeHelp[value.mode])),
              h("p", { className: "ar-note" }, ready.code === "unverified" ? "\u914D\u7F6E\u5DF2\u586B\u5199\uFF0C\u5C1A\u672A\u9A8C\u8BC1\u8FDE\u63A5\u3002" : ready.reason),
              h("details", null, h("summary", null, "\u72B6\u6001\u8BE6\u60C5"), h("small", null, ready.action)),
              value.mode === "MODEL_AUTO" && select("\u56FA\u5B9A\u601D\u8003\u6863\u4F4D", fixed, [["", "\u4FDD\u6301\u539F\u751F\u5F53\u524D\u6863\u4F4D"], ...availableEfforts.map((id) => [id, id]), ...fixed && !availableEfforts.includes(fixed) ? [[fixed, `${fixed}\uFF08\u5F53\u524D\u76EE\u5F55\u672A\u58F0\u660E\uFF09`, true]] : []], (next) => edit("fixedEffort", next), disabled),
              h("details", { "aria-label": "\u8DEF\u7531\u9AD8\u7EA7\u9009\u9879" }, h("summary", null, "\u9AD8\u7EA7\u9009\u9879"), h(
                "div",
                { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
                h(Checkbox, { label: "\u9501\u5B9A\u539F\u751F\u6A21\u578B", checked: !!value.lockModel, disabled, onChange: (next) => edit("lockModel", next) }),
                h(Checkbox, { label: "\u9501\u5B9A\u539F\u751F\u6863\u4F4D", checked: !!value.lockEffort, disabled, onChange: (next) => edit("lockEffort", next) })
              ))
            ),
            h("section", { className: "ar-card", "aria-label": "\u6A21\u578B\u4E0E\u5206\u7C7B\u670D\u52A1" }, h("h3", null, "\u6A21\u578B\u4E0E\u5206\u7C7B\u670D\u52A1"), h(
              "div",
              { className: "ar-grid" },
              h("details", { open: ["FULL_AUTO", "MODEL_AUTO"].includes(value.mode), style: sectionStyle }, h("summary", null, "\u5019\u9009\u6A21\u578B", ["EFFORT_AUTO", "MANUAL"].includes(value.mode) ? "\uFF08\u672C\u6A21\u5F0F\u4E0D\u81EA\u52A8\u9009\u6A21\uFF09" : ""), h(
                "div",
                { className: "ar-stack" },
                h("small", null, ["MANUAL", "EFFORT_AUTO"].includes(value.mode) ? "\u5F53\u524D\u6A21\u5F0F\u4F7F\u7528 DSH \u539F\u751F\u6A21\u578B\uFF0C\u65E0\u9700\u914D\u7F6E\u5019\u9009\u3002\u5DF2\u6709\u914D\u7F6E\u4F1A\u4FDD\u7559\u3002" : "\u9009\u62E9\u5141\u8BB8\u81EA\u52A8\u4F7F\u7528\u7684\u6A21\u578B\uFF0C\u518D\u8BBE\u7F6E\u80FD\u529B\u4E0E\u7528\u9014\u3002"),
                h(Input, { placeholder: "\u641C\u7D22\u6A21\u578B\u540D\u79F0\u3001Provider \u6216 ID", "aria-label": "\u641C\u7D22\u6A21\u578B", value: search, onChange: (e) => setSearch(e.target.value) }),
                h(Button, { size: "sm", disabled: directory.status === "loading", style: { justifySelf: "start" }, onClick: () => props.refreshCatalog().catch(() => {
                }) }, "\u5237\u65B0\u6A21\u578B\u76EE\u5F55"),
                directory.status === "loading" && h("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6 Host \u6A21\u578B\u76EE\u5F55\u2026"),
                directory.status === "error" && h("p", { role: "alert" }, "\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002\u5DF2\u4FDD\u5B58\u7684\u5019\u9009\u4E0D\u4F1A\u4E22\u5931\u3002"),
                (directory.value?.failures ?? []).map((provider) => h("p", { key: provider.id, role: "status" }, provider.name, "\uFF1A\u76EE\u5F55\u6682\u4E0D\u53EF\u7528")),
                directory.status === "ready" && !rows.length && h("p", { role: "status" }, "\u6682\u65E0\u53EF\u7528\u6A21\u578B\uFF0C\u8BF7\u5148\u5728 DSH \u914D\u7F6E\u63D0\u4F9B\u5546\u3002"),
                h("div", { className: "ar-catalog" }, (directory.status === "ready" ? directory.value?.groups ?? [] : []).map((group) => {
                  const visible = rows.filter((row) => row.provider === group.id && `${row.name} ${row.providerName} ${row.provider} ${row.model}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(candidates.some((c) => c.enabled && c.provider === b.provider && c.model === b.model)) - Number(candidates.some((c) => c.enabled && c.provider === a.provider && c.model === a.model)));
                  return visible.length ? h("fieldset", { key: group.id, style: { border: 0, padding: 0, display: "grid", gap: 8, minWidth: 0 } }, h("legend", null, group.name), visible.map((row) => h(
                    "div",
                    { key: row.model, title: `${row.provider} / ${row.model}` },
                    h(Checkbox, { label: row.name, checked: candidates.some((item) => item.enabled && item.provider === row.provider && item.model === row.model), disabled, onChange: (next) => {
                      const index = candidates.findIndex((item) => item.provider === row.provider && item.model === row.model);
                      if (index < 0) edit("candidates", [...candidates, { provider: row.provider, model: row.model, enabled: true, tier: "moderate", roles: ["general"], effortByTier: {} }]);
                      else changeCandidate(index, { enabled: next });
                    } }),
                    h("small", { className: "ar-muted ar-model", title: `${row.provider}/${row.model}` }, row.provider, " / ", row.model)
                  ))) : null;
                })),
                candidates.map((candidate, index) => {
                  const row = directory.status === "ready" ? rows.find((item) => item.provider === candidate.provider && item.model === candidate.model) : void 0;
                  const efforts = row?.efforts ?? [];
                  return h(
                    "details",
                    { key: JSON.stringify([candidate.provider, candidate.model, index]), "aria-label": `${row?.name ?? candidate.model} \u5019\u9009\u914D\u7F6E`, className: "ar-candidate" },
                    h("summary", null, `${candidate.enabled ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528"} \xB7 ${row?.name ?? candidate.model} \xB7 ${tiers2[candidate.tier] ?? candidate.tier}`),
                    h("small", { style: { overflowWrap: "anywhere" } }, candidate.provider, " / ", candidate.model),
                    h("small", { role: "status" }, row ? "\u76EE\u5F55\u53EF\u7528" : "\u5F53\u524D\u76EE\u5F55\u4E0D\u53EF\u7528\uFF1B\u4FDD\u7559\u5DF2\u4FDD\u5B58\u914D\u7F6E"),
                    h(Checkbox, { label: "\u53C2\u4E0E\u81EA\u52A8\u8DEF\u7531", checked: !!candidate.enabled, disabled: disabled || !row && !candidate.enabled, onChange: (next) => changeCandidate(index, { enabled: next }) }),
                    select("\u80FD\u529B\u7B49\u7EA7", candidate.tier, Object.entries(tiers2), (next) => changeCandidate(index, { tier: next }), disabled),
                    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 14 } }, Object.entries(roles).map(([id, label]) => h(Checkbox, { key: id, label, disabled, checked: candidate.roles?.includes(id) ?? false, onChange: (next) => changeCandidate(index, { roles: next ? [...candidate.roles ?? [], id] : candidate.roles.filter((role) => role !== id) }) }))),
                    row && !efforts.length ? h(
                      "div",
                      null,
                      h("small", null, "\u7531\u6A21\u578B\u9ED8\u8BA4\u5904\u7406"),
                      Object.keys(candidate.effortByTier ?? {}).length > 0 && h(Button, {
                        size: "sm",
                        disabled,
                        onClick: () => changeCandidate(index, { effortByTier: {} })
                      }, "\u4F7F\u7528\u6A21\u578B\u9ED8\u8BA4\uFF08\u6E05\u9664\u65E7\u6863\u4F4D\u6620\u5C04\uFF09")
                    ) : row ? Object.entries(tiers2).map(([id, label]) => {
                      const mapped = candidate.effortByTier?.[id] ?? "";
                      const automatic = autoEffort(candidate, efforts.map((e) => e.id), id);
                      const options = [["", `\u81EA\u52A8\u6620\u5C04 \xB7 ${automatic ?? "\u6A21\u578B\u9ED8\u8BA4"}`], ...efforts.map((e) => [e.id, e.name]), ...mapped && !efforts.some((e) => e.id === mapped) ? [[mapped, `${mapped}\uFF08\u5DF2\u5931\u6548\uFF09`, true]] : []];
                      return select(`${label}\u4EFB\u52A1\u6863\u4F4D`, mapped, options, (next) => {
                        const mapping = { ...candidate.effortByTier };
                        if (next) mapping[id] = next;
                        else delete mapping[id];
                        changeCandidate(index, { effortByTier: mapping });
                      }, disabled);
                    }) : null,
                    h(Button, { size: "sm", disabled, onClick: () => edit("candidates", candidates.filter((_, i) => i !== index)) }, "\u79FB\u9664\u8FD9\u9879\u914D\u7F6E")
                  );
                }),
                !enabledRows.length && h("p", { role: "status" }, "\u5C1A\u672A\u542F\u7528\u5019\u9009\u6A21\u578B\uFF0C\u5C06\u4FDD\u7559\u539F\u751F\u9009\u62E9\u3002"),
                invalid && h("p", { role: "alert" }, invalid),
                select(
                  "\u56DE\u9000\u6A21\u578B\uFF08\u4EC5\u539F\u6A21\u578B\u660E\u786E\u4E0D\u53EF\u7528\u65F6\uFF09",
                  fallback,
                  [["", "\u4FDD\u6301\u539F\u751F\u914D\u7F6E"], ...enabledRows.map((item) => [`${item.provider}/${item.model}`, rows.find((row) => row.provider === item.provider && row.model === item.model)?.name ?? `${item.model}\uFF08\u76EE\u5F55\u4E0D\u53EF\u7528\uFF09`]), ...fallback && !enabledRows.some((item) => `${item.provider}/${item.model}` === fallback) ? [[fallback, `${fallback}\uFF08\u4FDD\u7559\u65E7\u914D\u7F6E\uFF09`, true]] : []],
                  (next) => edit("fallback", next),
                  disabled
                )
              )),
              h(
                "details",
                { open: value.mode !== "MANUAL", style: sectionStyle },
                h("summary", null, "\u4EFB\u52A1\u5206\u7C7B\u670D\u52A1", value.mode === "MANUAL" ? " \xB7 \u5F53\u524D\u4E0D\u9700\u8981" : ""),
                h(
                  "div",
                  { className: "ar-stack" },
                  h("small", null, value.mode === "MANUAL" ? "\u624B\u52A8\u6A21\u5F0F\u4E0D\u8C03\u7528\u5206\u7C7B\u670D\u52A1\u3002\u5DF2\u6709\u8BBE\u7F6E\u4E0D\u4F1A\u6E05\u7A7A\u3002" : "\u5E2E\u52A9\u5224\u65AD\u4EFB\u52A1\u96BE\u5EA6\uFF0C\u4F7F\u7528\u5DF2\u6709\u6A21\u578B\u6267\u884C\u4EFB\u52A1\u3002"),
                  select("\u670D\u52A1\u7C7B\u578B", presetValue, [["custom", "\u81EA\u5B9A\u4E49"], ["neohorse-hosted", "NeoHorse-Jev \xB7 TokenRhythm"], ["neohorse-local", "NeoHorse-Jev \xB7 \u672C\u5730"], ["jev", "Jev"]], (next) => {
                    setPreset(next);
                    for (const [field, patch] of Object.entries(presetPatch(next, value))) edit(field, patch);
                    setCheckNotice("");
                    setNotice("\u914D\u7F6E\u5DF2\u586B\u5199\uFF0C\u4FDD\u5B58\u540E\u751F\u6548\u3002\u81EA\u5B9A\u4E49\u51ED\u636E\u4E0E\u9608\u503C\u5DF2\u4FDD\u7559\u3002");
                  }, disabled),
                  ...[["apiUrl", "\u63A5\u53E3\u5730\u5740"], ["classifierModel", "\u5206\u7C7B\u6A21\u578B"]].map(([field, label]) => h("label", { key: field, style: fieldStyle }, label, h(Input, { "aria-label": label, disabled, value: value[field] ?? "", placeholder: field === "apiUrl" ? "https://\u2026/v1/systemone" : "jev-latest", onChange: (e) => {
                    edit(field, e.target.value);
                    setPreset("custom");
                  } }))),
                  h("div", { className: "ar-row" }, h("h4", null, "API Key \u51ED\u636E"), h("span", { className: "ar-status" }, connectionDraft ? "\u5F85\u4FDD\u5B58\u540E\u786E\u8BA4" : setup.value?.keyAvailable === true ? "\u5DF2\u914D\u7F6E" : setup.value?.keyAvailable === false ? "\u672A\u914D\u7F6E" : "\u5F85\u786E\u8BA4")),
                  h("label", { style: fieldStyle }, "\u51ED\u636E\u540D\u79F0\uFF0C\u4E0D\u662F API Key", h(Input, { "aria-label": "API Key \u51ED\u636E", disabled, value: value.apiKeyEnv ?? "", placeholder: "TOKENRHYTHM_API_KEY", autoComplete: "off", spellCheck: false, onChange: (e) => edit("apiKeyEnv", e.target.value) })),
                  h("small", null, `\u8BF7\u5728 DSH \u51ED\u636E\u7BA1\u7406\u4E2D\u4FDD\u5B58 ${value.apiKeyEnv || "\u5BF9\u5E94\u540D\u79F0"}\u3002\u4E0D\u8981\u5728\u6B64\u7C98\u8D34\u771F\u5B9E\u5BC6\u94A5\u3002`),
                  h(
                    "div",
                    { className: "ar-row" },
                    h("span", { className: "ar-status", role: "status" }, connectionDraft ? "\u914D\u7F6E\u5F85\u4FDD\u5B58" : setup.value?.verified ? "\u670D\u52A1\u5DF2\u9A8C\u8BC1" : setup.value?.verification?.ok === false ? "\u9A8C\u8BC1\u5931\u8D25" : !value.apiUrl ? "\u672A\u914D\u7F6E" : setup.value?.endpointValid && setup.value?.keyAvailable ? "\u914D\u7F6E\u6709\u6548 \xB7 \u8FDE\u63A5\u672A\u9A8C\u8BC1" : "\u8FDE\u63A5\u672A\u9A8C\u8BC1"),
                    h(Button, { size: "sm", disabled: checking || !!draft || snapshot.status !== "ready", onClick: checkConnection }, checking ? "\u68C0\u67E5\u4E2D\u2026" : "\u68C0\u67E5\u914D\u7F6E")
                  ),
                  h("small", null, "\u68C0\u67E5\u914D\u7F6E\u4E0D\u53D1\u9001\u7F51\u7EDC\u8BF7\u6C42\u3002\u9996\u6B21\u5B9E\u9645\u5206\u7C7B\u6210\u529F\u540E\u624D\u663E\u793A\u670D\u52A1\u5DF2\u9A8C\u8BC1\u3002"),
                  !connectionDraft && checkNotice && h("p", { role: "status" }, checkNotice),
                  h("details", null, h("summary", null, "\u8BE6\u7EC6\u4FE1\u606F"), h(
                    "div",
                    { className: "ar-stack" },
                    h("small", null, `${engineFor(value)} \xB7 confidence \u4E0D\u662F\u6B63\u786E\u7387\uFF0C\u4E0D\u540C\u5F15\u64CE\u95F4\u4E0D\u80FD\u76F4\u63A5\u6BD4\u8F83\u3002`),
                    h("small", null, "\u672C\u5730\u670D\u52A1\u5730\u5740\u6307\u5411 Host \u6240\u5728\u73AF\u5883\uFF1B\u5BB9\u5668\u6216\u8FDC\u7A0B Host \u4E2D\u7684 localhost \u4E0D\u662F\u6D4F\u89C8\u5668\u7535\u8111\u3002Jev \u9884\u8BBE\u4FDD\u7559\u73B0\u6709\u5730\u5740\u4E0E\u81EA\u5B9A\u4E49\u51ED\u636E\u3002"),
                    setup.value?.verification && h("small", null, `${setup.value.engine} \xB7 ${setup.value.model} \xB7 ${setup.value.verification.elapsedMs ?? "\u672A\u77E5"} ms \xB7 ${new Date(setup.value.verification.at).toLocaleString()} \xB7 ${setup.value.verification.ok ? "\u8BF7\u6C42\u5DF2\u9A8C\u8BC1" : explainReason(setup.value.verification.failure ?? "failed").reason}`)
                  )),
                  h(
                    "details",
                    null,
                    h("summary", null, "\u9AD8\u7EA7\u8FDE\u63A5\u9009\u9879"),
                    ...[["timeoutMs", "\u8D85\u65F6\uFF08500\u201330000 \u6BEB\u79D2\uFF09", 500, 3e4, 1], ["confidenceThreshold", "\u7F6E\u4FE1\u5EA6\u9608\u503C\uFF080\u20131\uFF09", 0, 1, 0.05]].map(([field, label, min, max, step]) => h("label", { key: field, style: fieldStyle }, label, h(Input, { type: "number", disabled, min, max, step, value: value[field] ?? "", onChange: (e) => edit(field, Number(e.target.value)) })))
                  )
                )
              )
            )),
            h(LabPanel, { ...props, enabled: value.labEnabled, routerEnabled: value.enabled, pending: !!draft && Object.hasOwn(draft, "labEnabled"), disabled, writable: snapshot.writable, onChange: (next) => edit("labEnabled", next) }),
            h(LabPanel, { ...props, maintenanceOnly: true, enabled: value.labEnabled, disabled, writable: snapshot.writable, onChange: (next) => edit("labEnabled", next) }),
            notice && h("p", { role: "status" }, notice),
            draft && h(Button, { disabled: saving, onClick: discard }, "\u64A4\u9500\u672A\u4FDD\u5B58\u4FEE\u6539")
          )
        );
      }
      function Chip(props) {
        const projected = props.useProjection("adaptiveRouter");
        const settings = props.useAdaptiveSettings((s) => s);
        const directory = props.useAdaptiveCatalog((s) => s);
        const setup = props.useAdaptiveSetup((s) => s);
        const connection = props.useAdaptiveConnection((c) => c);
        const running = props.useSession((s) => s.running);
        const [status, setStatus] = React.useState(null);
        const [open, setOpen] = React.useState(false);
        const writing = React.useRef(false);
        const [saving, setSaving] = React.useState(false);
        const [failed, setFailed] = React.useState(false);
        React.useEffect(() => {
          let cancelled = false;
          setStatus(null);
          if (!connection || !props.sessionId) return;
          connection.rpc.call("/api", "adaptiveRouter/getSessionState", { args: { sessionId: props.sessionId } }).then((result) => {
            if (!cancelled && result?.ok) {
              setStatus(result.value);
              void props.refreshSetup();
            }
          }).catch(() => {
          });
          return () => {
            cancelled = true;
          };
        }, [connection, props.sessionId, projected?.tick, settings.revision]);
        if (!settings.value?.enabled) return null;
        const actual = projected?.actual ?? null;
        const { control, reason } = actualControl(actual, status);
        const row = actual && catalogRows(directory.value).find((item) => item.provider === actual.provider && item.model === actual.model);
        const name = row?.name ?? actual?.model ?? "\u7B49\u5F85\u8BF7\u6C42";
        const effort = row?.efforts.find((item) => item.id === actual?.reasoningEffort)?.name ?? actual?.reasoningEffort ?? "Default";
        const currentMode = settings.value.mode;
        const last = status?.decision;
        const ready = readiness(settings.value, {
          catalog: directory.status === "ready" ? directory.value : null,
          current: actual,
          ...setup.value,
          nativeManual: control === "Manual" && status?.decision?.reason === "native-manual",
          failure: setup.value?.verification?.failure ?? (control === "Bypass" ? last?.reason : void 0)
        });
        const controlLabel = { Auto: "\u81EA\u52A8", Native: "\u539F\u751F", Manual: "\u624B\u52A8", Bypass: "\u539F\u751F", Fallback: "\u5907\u7528", Blocked: "\u5DF2\u963B\u6B62", Conflict: "\u51B2\u7A81" }[control] ?? "\u539F\u751F";
        const compact = !actual && ready.state === "Needs Setup" ? "\u672A\u5C31\u7EEA" : `${controlLabel}${actual ? " \xB7 " + name : ""}`;
        const diagnosticItems = [
          { type: "label", id: "ready", text: `${ready.state} \xB7 ${ready.reason} ${ready.action}` },
          { type: "label", id: "source", text: `\u9009\u62E9\u6765\u6E90\uFF1A${control}\uFF1B\u5206\u7C7B\u6765\u6E90\uFF1A${last?.source ?? "\u672A\u77E5"}` },
          ...last?.tier ? [{ type: "label", id: "classification", text: `${last.tier} / ${last.role ?? "\u672A\u77E5"} \xB7 confidence ${last.confidence ?? "\u672A\u77E5"}\uFF08\u975E\u6B63\u786E\u7387\uFF09` }] : [],
          ...last?.at ? [{ type: "label", id: "time", text: `${new Date(last.at).toLocaleString()} \xB7 ${last.elapsedMs ?? "\u672A\u77E5"}ms \xB7 \u5B9E\u9645\u5907\u7528\u5207\u6362\uFF1A${last.fallbackApplied ? "\u662F" : "\u5426"}` }] : [],
          ...last?.selection ? [{ type: "label", id: "plan", text: `\u8BA1\u5212\uFF1A${last.selection.provider}/${last.selection.model}\uFF1B\u8BA1\u5212\u4E0D\u7B49\u4E8E\u5DF2\u6267\u884C` }] : []
        ];
        const choose = async (id) => {
          if (id === "config") {
            props.openConfig();
            setOpen(false);
            return;
          }
          if (running || writing.current || !settings.writable) return;
          writing.current = true;
          setSaving(true);
          setFailed(false);
          try {
            if (!await props.changeMode(id)) setFailed(true);
            else setOpen(false);
          } catch {
            setFailed(true);
          } finally {
            writing.current = false;
            setSaving(false);
          }
        };
        return h(Menu, {
          open,
          portal: true,
          autoFocus: true,
          side: "top",
          align: "end",
          compact: true,
          onClose: () => setOpen(false),
          onSelect: choose,
          selectedId: currentMode,
          anchor: h(Button, { size: "sm", variant: "toolbar", "aria-label": "\u667A\u80FD\u8DEF\u7531\u5FEB\u6377\u83DC\u5355", "aria-haspopup": "menu", "aria-expanded": open, title: `${control} \xB7 ${name} \xB7 ${effort}
${reason}`, style: { maxWidth: "min(180px, 28vw)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }, onClick: () => setOpen((old) => !old) }, h("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } }, compact)),
          items: [
            { type: "label", id: "scope", text: "\u6A21\u5F0F \xB7 \u63D2\u4EF6\u7EA7\uFF08\u6240\u6709\u4F1A\u8BDD\uFF09" },
            ...Object.entries(modes).map(([id, label]) => ({ id, label, disabled: !!running || saving || !settings.writable })),
            { type: "separator", id: "sep" },
            { type: "label", id: "actual", text: actual ? `${control} \xB7 ${actual.provider} / ${actual.model} \xB7 ${effort}` : "\u5C1A\u65E0\u5DF2\u63D0\u4EA4\u7684\u539F\u751F\u8BF7\u6C42" },
            { type: "label", id: "reason", text: reason },
            ...diagnosticItems,
            ...running ? [{ type: "label", id: "busy", text: "\u5F53\u524D\u4EFB\u52A1\u6267\u884C\u4E2D\uFF0C\u6A21\u5F0F\u5207\u6362\u5DF2\u6682\u505C" }] : [],
            ...failed ? [{ type: "label", id: "failed", text: "\u6A21\u5F0F\u672A\u4FDD\u5B58\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" }] : [],
            { id: "config", label: "\u6253\u5F00\u63D2\u4EF6\u914D\u7F6E" }
          ]
        });
      }
      return {
        inject: ["slots", "connection", "remote", "remote.session", "configForms", "sessions"],
        apply(ctx) {
          const connection = createSnapshotStore(ctx.connection);
          const form = ctx.configForms.get("adaptive-router");
          const directory = createSnapshotStore({ status: "idle", value: null });
          const setup = createSnapshotStore({ value: null });
          const labEpoch = createSnapshotStore(0);
          let setupGeneration = 0;
          const refreshSetup = async () => {
            const version = ++setupGeneration;
            try {
              const result = await ctx.connection?.rpc?.call("/api", "adaptiveRouter/getSetupState", { args: {} });
              if (version === setupGeneration && !disposed) setup.set({ value: result?.ok ? result.value : null });
              return result?.ok ? result.value : null;
            } catch {
              if (version === setupGeneration && !disposed) setup.set({ value: null });
              return null;
            }
          };
          ctx.effect(() => form.subscribe(() => {
            setup.set({ value: null });
            void refreshSetup();
          }));
          let generation = 0, disposed = false, inflight;
          const load = () => {
            if (inflight) return inflight;
            const version = generation;
            directory.set({ ...directory.getSnapshot(), status: "loading" });
            const task = ctx.remote.session.modelCatalog().then((result) => {
              if (!result.ok || disposed || version !== generation) throw new Error("catalog-unavailable");
              directory.set({ status: "ready", value: result.value });
              return result.value;
            }).catch(() => {
              if (!disposed && version === generation) directory.set({ ...directory.getSnapshot(), status: "error" });
              throw new Error("catalog-unavailable");
            }).finally(() => {
              if (inflight === task) inflight = void 0;
            });
            inflight = task;
            return task;
          };
          const refresh = () => {
            generation++;
            inflight = void 0;
            void load().catch(() => {
            });
            void refreshSetup();
          };
          ctx.effect(() => () => {
            disposed = true;
            generation++;
            setupGeneration++;
          });
          ctx.effect(() => [ctx.remote.$on("llm/adapters-updated", refresh), ctx.remote.$on("settings/document-updated", refresh), ctx.remote.$on("credentials/record-updated", refresh), ctx.remote.$on("credentials/reference-updated", refresh)]);
          ctx.on("connection/reset", () => {
            labEpoch.set(labEpoch.getSnapshot() + 1);
            directory.set({ status: "idle", value: null });
            refresh();
          });
          void load().catch(() => {
          });
          void refreshSetup();
          const shared = () => ({ hooks: { adaptiveSettings: form, adaptiveCatalog: directory, adaptiveSetup: setup, adaptiveLabEpoch: labEpoch }, labCall: (op, args) => ctx.connection.rpc.call("/api", "adaptiveRouterLab/" + op, { args }), refreshCatalog: load, refreshSetup, mutate: (ops, revision) => form.mutate(ops, revision) });
          for (const [name, key] of [["plugins.bundle.config", pkg], ["plugins.row.config", pkg + "#adaptive-router"]])
            ctx.slots.inject(name, () => ctx.slots.register({ name, key, inject: shared }, Settings));
          ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
            name: "conversation.input.right",
            id: "adaptive-router",
            order: 51,
            inject: (sessionId) => ({
              ...shared(),
              hooks: { ...shared().hooks, adaptiveConnection: connection },
              openConfig: () => ctx.get("pluginNavigation")?.openBundle(pkg),
              changeMode: async (mode) => {
                if (!Object.hasOwn(modes, mode) || ctx.sessions?.binding(sessionId)?.session.getSnapshot().running !== false) return false;
                const snapshot = form.getSnapshot();
                return snapshot.status === "ready" && snapshot.writable ? form.mutate([{ op: "set", path: ["mode"], value: mode }], snapshot.revision) : false;
              }
            })
          }, Chip));
        }
      };
    }
  });
})();
