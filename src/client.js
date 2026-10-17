import { settingsCss } from "./client-style.js";
import { readiness, presetPatch, engineFor, explainReason } from "./diagnostics.js";
import { modes, tiers, roles, catalogRows, candidateError, autoEffort, actualControl } from "./ui.js";
window.__ModuleLoader__.load({
  id: "dsh-plugin-adaptive-router",
  factory: (require) => {
    const React = require("react");
    const { Button, Checkbox, Switch, Input, Menu, SettingsForm } = require("@deepseek-ai/dsh-client-ui-primitives");
    const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
    const h = React.createElement;
    const pkg = "dsh-plugin-adaptive-router";
    const labels = { unavailable: "原生配置当前不可用，请检查 Host 连接。", readOnly: "此连接仅允许读取配置。", saveFailed: "保存失败或配置修订冲突；草稿已保留。请撤销草稿后重新编辑，或重试。", save: "保存", saving: "保存中…" };
    const sectionStyle = { minWidth: 0 };
    const fieldStyle = { display: "grid", gap: 6, minWidth: 0 };
    const selectStyle = { color: "inherit", background: "var(--dsw-alias-bg-layer-1, transparent)", border: "1px solid var(--dsw-alias-border-l2, #8886)", borderRadius: 8, padding: "7px 10px", minWidth: 0, maxWidth: "100%" };
    const select = (label, value, options, onChange, disabled) => h("label", { key: label, style: fieldStyle }, label,
      h("select", { value, disabled, "aria-label": label, style: selectStyle, onChange: e => onChange(e.target.value) },
        options.map(([id, name, unavailable]) => h("option", { key: id, value: id, disabled: unavailable }, name))));
    function LabPanel(props) {
      const epoch = props.useAdaptiveLabEpoch(s => s);
      const directory = props.useAdaptiveCatalog(s => s);
      const modelName = (provider,model) => catalogRows(directory.value).find(row=>row.provider===provider&&row.model===model)?.name ?? model;
      const [data, setData] = React.useState(null), [update, setUpdate] = React.useState(null);
      const [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
      const [confirm, setConfirm] = React.useState(false), [exportOpen, setExportOpen] = React.useState(false);
      const generation = React.useRef(0), writing = React.useRef(false);
      React.useEffect(() => { generation.current++; writing.current = false; setData(null); setUpdate(null); setBusy(false); setError(""); setConfirm(false); setExportOpen(false);
        return () => { generation.current++; }; }, [epoch]);
      const act = async (op, args = {}) => {
        if (writing.current) return;
        writing.current = true; const version = generation.current; setBusy(true); setError("");
        try {
          const result = await props.labCall(op, args);
          if (version !== generation.current) return;
          if (!result?.ok) { setError(result?.error?.code === "lab/forbidden" && result.error.details?.reason === "environment" ? "lab/environment" : result?.error?.code ?? "lab/rejected"); return; }
          if (op === "checkUpdates") { setUpdate(result.value); if (result.value.installation) setData(old => ({ ...old, installation: result.value.installation })); }
          else if (op === "export") {
            const json = args.format === "json", blob = new Blob([json ? JSON.stringify(result.value, null, 2) : result.value], { type: json ? "application/json" : "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `router-lab-${new Date().toISOString().slice(0,10)}.${args.format}`;
            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
          } else { setData(old => ({ ...old, ...result.value })); if (op === "read") setUpdate(result.value.update); }
          if (op === "clear") setConfirm(false);
        } catch (failure) {
          // The target's public browser RPC reports admission failures as HTTP errors.
          const http = /^transport failure for \/api\/adaptiveRouterLab\/(read|feedback|clear|export|checkUpdates): HTTP (\d{3})$/.exec(failure?.message ?? "");
          if (version === generation.current) setError(http ? ["401","403"].includes(http[2]) ? "lab/forbidden" : "lab/rejected" : "lab/disconnected");
        }
        finally { if (version === generation.current) { writing.current = false; setBusy(false); } }
      };
      const onOpen = event => { if (event.currentTarget.open && !data && !writing.current) void act("read"); };
      const summary = data?.available ? data.summary : null, installation = data?.installation;
      const small = { fontSize: 12, opacity: .8, overflowWrap: "anywhere" };
      const feedbackNames = { met: "达到预期", rework: "需要返工", unknown: "无法判断" };
      const sourceNames = { link: "本地 link / 工作区", tgz: "本地或远程 tgz", "fixed-sha": "固定 SHA（声明来源）", "git-tag": "GitHub Tag", "github-main": "GitHub 开发分支", npm: "npm", unknown: "安装来源无法识别" };
      const updateNames = { "no-release": "暂无正式 Release", "newer-release": "发现较新 Release", "no-newer-release": "没有更高的可比较 Release（不等于代码最新）", "release-uncomparable": "Release 版本无法比较", "development-ahead": "开发分支有新提交", "confirmed-current": "已是最新可确认 main 提交", "installed-commit-unknown": "实际安装提交未知", "comparison-unknown": "实际安装与 main 无法精确比较", "installed-ahead": "已确认安装提交领先 main", diverged: "实际安装与 main 历史分叉", "rate-limited": "GitHub 限流", timeout: "检查超时", "network-unavailable": "网络不可用", "check-failed": "检查失败", "invalid-response": "更新响应不合法", "response-too-large": "更新响应超出限制" };
      React.useEffect(() => { if (!props.maintenanceOnly) void act("read"); }, [epoch]);
      const errorCopy = {
        "lab/environment": ["当前环境无法查看实验数据", "请使用仅绑定本机的 DSH Profile；远程访问暂不支持。"],
        "lab/forbidden": ["当前账户无权执行此操作", "请使用已登录的本机 DSH，并检查配置是否可写。"],
        "lab/storage-unavailable": ["数据存储暂不可用", "请检查 Host 的存储服务后重试；正常聊天不受影响。"],
        "lab/record-conflict": ["记录已更新", "请刷新数据后重新反馈。已保存记录不会被覆盖。"],
        "lab/disconnected": ["连接已断开，请重试", "确认 DSH Host 正在运行，重新连接后刷新。"],
        "lab/initializing": ["正在准备实验数据", "稍后刷新即可。"],
        "lab/rejected": ["加载失败，请重试", "请刷新数据；如仍失败，可提供下方错误代码。"],
      };
      const problem = error && (Object.hasOwn(errorCopy,error) ? errorCopy[error] : errorCopy["lab/rejected"]);
      const errorView = problem && h("div", { role: "alert", className: "ar-error" }, h("strong", null, problem[0]), h("small", null, problem[1]), h("details", null, h("summary", null, "技术详情"), h("code", null, Object.hasOwn(errorCopy, error) ? error : "lab/rejected")));
      const metrics = data?.available && summary && [["已记录轮次",summary.turns],["自动路由次数",summary.controls.Auto ?? 0],["模型请求次数",summary.requestAttribution?.total ?? null],["任务反馈",summary.feedbackCount]];
      const outcome = { completed:"流程完成",error:"执行报错",aborted:"已中断",interrupted:"已中断",blocked:"已阻止","max-tokens":"达到输出上限",forked:"已分支",unknown:"结果未知" };
      const tokenNames = { inputTokens:"输入 Token",outputTokens:"输出 Token",cacheReadTokens:"缓存读取",cacheWriteTokens:"缓存写入",reasoningTokens:"推理 Token" };
      return h(React.Fragment, null,
        !props.maintenanceOnly && h("section", { className:"ar-card", "aria-label":"路由实验室" },
          h("div", { className:"ar-row" },h("h3",null,"路由实验室"), h("span", { className:"ar-status", role:"status" }, props.pending ? "待保存" : data && !data.available ? "数据不可用" : !props.routerEnabled && props.enabled ? "已暂停" : props.enabled ? "记录中" : "未开启")),
          h("p", { className:"ar-note" }, "自动记录日常任务，帮助了解路由效果。"),
          h("div", { className:"ar-row" }, h("span",null,"记录使用数据"), h(Switch,{label:"记录使用数据",checked:!!props.enabled,disabled:props.disabled,onChange:props.onChange})),
          h("small",null,"仅记录使用元数据，不含聊天正文。保存后生效；关闭后保留已有数据。"),
          busy && h("p",{role:"status"},"正在读取…"), errorView,
          data && !data.available && h("p",{role:"status"},"数据存储暂不可用。请检查 Host 存储服务；正常聊天不受影响。"),
          data?.error && h("p",{role:"alert"},"部分数据尚未保存，请刷新重试；正常聊天不受影响。"),
          metrics && h("div",{className:"ar-metrics"},...metrics.map(([name,n])=>h("div",{key:name,className:"ar-metric"},h("strong",null,n ?? "—"),h("span",null,name)))),
          data?.available && !summary?.turns && h("p",{className:"ar-empty"},"还没有记录。开启后正常聊天即可自动积累数据。"),
          h("div",{className:"ar-row"},h(Button,{size:"sm",disabled:busy,onClick:()=>act("read")},"刷新实验数据"),
            h(Menu,{open:exportOpen,onClose:()=>setExportOpen(false),portal:true,autoFocus:true,compact:true,side:"bottom",align:"end",anchor:h(Button,{size:"sm",disabled:busy||!data?.available,"aria-haspopup":"menu","aria-expanded":exportOpen,onClick:()=>setExportOpen(v=>!v)},"导出数据"),items:[{id:"json",label:"导出 JSON"},{id:"csv",label:"导出 CSV"}],onSelect:format=>{setExportOpen(false);if(["json","csv"].includes(format))void act("export",{format});}})),
          h("details",{"aria-label":"实验数据详情"},h("summary",null,"更多统计"),summary && h("div",{className:"ar-stack"},
            h("dl",{className:"ar-data"},...[["原生放行",summary.controls.Bypass??0],["备用模型切换",summary.fallbackApplied],["手动控制",summary.controls.Manual??0],["安全阻止",summary.controls.Blocked??0],["流程完成",summary.outcomes.completed??0],["报错",summary.outcomes.error??0],["中断",(summary.outcomes.aborted??0)+(summary.outcomes.interrupted??0)],["有效分类",summary.classified],["分类平均耗时",`${summary.classifierLatency.meanMs?.toFixed(1)??"未知"} ms · ${summary.classifierLatency.coverage}/${summary.turns}`],["配置版本",summary.configRevisions]].flatMap(([key,val])=>[h("dt",{key:key+"k"},key),h("dd",{key},val)])),
            h("p",{className:"ar-note"},`Token 数据覆盖 ${summary.tokenCoverage}/${summary.turns}；缺失数据不按 0 统计。`),
            summary.requestAttribution && h("p",{className:"ar-note"},`模型来源覆盖 ${summary.requestAttribution.confirmed}/${summary.requestAttribution.total}；部分模型请求来源未知（${summary.requestAttribution.unknown}）。旧版未验证 ${summary.requestAttribution.legacyTurns} 轮，请求数未知 ${summary.requestAttribution.countMissingTurns} 轮。`),
            h("dl",{className:"ar-data"},...Object.entries(summary.tokens).flatMap(([key,bucket])=>[h("dt",{key:key+"k"},tokenNames[key]??key),h("dd",{key},`${bucket.coverage?bucket.value:"未知"} · ${bucket.coverage}/${summary.turns}`)])),
            summary.models.length>0 && h("details",null,h("summary",null,"模型使用分布"),...summary.models.map(model=>h("div",{key:JSON.stringify([model.provider,model.model]),className:"ar-stack",style:{marginBottom:10}},h("div",{className:"ar-row"},h("span",{className:"ar-model",title:`${model.provider}/${model.model}`},model.model==="unknown"?"来源未知":modelName(model.provider,model.model)),h("strong",null,`${model.requests} 次`)),h("progress",{value:model.requests,max:Math.max(1,summary.requestAttribution?.total??model.requests),"aria-label":`${model.model} 请求占比`}),h("small",null,`${model.provider} · 档位 ${JSON.stringify(model.efforts)} · 层级 ${JSON.stringify(model.tiers)}`)))),
            h("small",null,`反馈：达到预期 ${summary.feedback.met??0} / 需要返工 ${summary.feedback.rework??0} / 无法判断 ${summary.feedback.unknown??0}。未评分不算成功。`),
            (summary.modelsTruncated||summary.distributionTruncated>0)&&h("small",null,"部分模型分布已截断，完整记录请导出查看。"))),
          h("details",null,h("summary",null,"最近记录",summary?.turns?` · ${Math.min(25,summary.turns)}`:""),...(data?.recent??[]).map(row=>h("details",{key:row.recordId,className:"ar-candidate"},
            h("summary",null,`${new Date(row.timestamp).toLocaleString()} · ${modelName(row.actualProvider,row.actualModel)??"未知模型"} · ${outcome[row.turnFinishReason]??"结果未知"} · ${feedbackNames[row.rating]??"未反馈"}`),
            h("div",{className:"ar-stack"},h("p",{className:"ar-note"},`最终 Header：${row.actualProvider??"未知"} / ${row.actualModel??"未知"} · ${row.actualEffort??"模型默认"}`),
              h("p",{className:"ar-note"},`路由原因：${explainReason(row.reasonCode??"").reason}（${row.reasonCode??"unknown"}）`),
              row.compaction && h("p",{className:"ar-note"},`原生压缩 ${row.compaction.attempts} 次 · 完成 ${row.compaction.completed} / 失败 ${row.compaction.failed} · 触发 ${row.compaction.trigger === "provider-overflow" ? "Provider 确认超限" : row.compaction.trigger === "router-capacity-check" ? "路由容量保护" : row.compaction.trigger === "mixed" ? "混合" : "未知"} · 压缩后请求恢复 ${row.compaction.recovered === true ? "已观察到" : row.compaction.recovered === false ? "未恢复" : "未知"}`),
              h("p",{className:"ar-note"},`分类：${row.source??"未知"} · ${row.tier??"未知"} · 请求 ${row.modelRequestCount??"未知"} · 输入 ${row.inputTokens??"未知"} / 输出 ${row.outputTokens??"未知"} Token`),
              h("small",null,`数据来源 ${row.usageSource??"unknown"} · 模型归属 ${row.requestAttribution??"legacy-header"} · 会话代号 ${row.sessionScope?.slice(0,8)??"未知"} · 第 ${row.turnNumber} 轮 · ${row.routingMode} · ${row.control??"未知"} · 配置 ${row.experimentConfigRevision?.slice(0,8)??"未知"}`),
              h("div",{role:"group","aria-label":`Turn ${row.turnNumber} ${row.recordId.slice(0,8)} 反馈`,className:"ar-row"},...Object.entries(feedbackNames).map(([rating,label])=>h(Button,{key:rating,size:"sm",disabled:busy||!props.writable,"aria-pressed":row.rating===rating,onClick:()=>act("feedback",{id:row.recordId,rating,revision:row.revision})},label))))))),
          h("details",null,h("summary",null,"数据说明与管理"),h("div",{className:"ar-stack"},
            h("p",{className:"ar-note"},"这是 Turn 级观察性记录。completed 不是任务成功，统计结果不能直接证明路由更好或节省费用。仅本机认证账户可访问；不支持多用户远程访问。"),
            h("p",{className:"ar-note"},"没有聊天正文、工具内容或密钥。默认本地存储不加密，卸载后保留。智能路由关闭会停止采集；要记录原生使用情况可选择手动模式。"),
            data&&h("p",{className:"ar-note"},`待保存 ${data.pending} · 未覆盖 ${data.dropped}。最多 5000 轮 / 90 天 / 8 MiB；异常退出可能丢失未保存记录。存储 ${data.domain??"待确认"}，位置由 Host 管理。`),
            h("small",null,"请求分布只使用原生消息来源；失败尝试及逐请求档位无可靠证据时为 unknown。最终 Header 不代表每次请求。"),
            h(Button,{size:"sm",disabled:busy||!props.writable||!data?.available,onClick:()=>setConfirm(true)},"清空实验数据"),
            confirm&&h("div",{role:"group","aria-label":"确认清空实验数据",className:"ar-stack"},h("p",null,"永久清空此插件的记录和反馈？DSH 会话不会删除；进行中的记录不会补回。"),h("div",{className:"ar-row"},h(Button,{disabled:busy,onClick:()=>act("clear",{confirm:true})},"确认清空"),h(Button,{disabled:busy,onClick:()=>setConfirm(false)},"取消")))))) ,
        props.maintenanceOnly && h("details", { className:"ar-card", onToggle: onOpen }, h("summary", null, "更新与维护"),
          h("p", { style: small }, `当前版本 ${installation?.version ?? "待读取"} · ${sourceNames[installation?.sourceKind] ?? "安装来源未知"} · Profile ${installation?.profile ?? "未知"} · 目标 DSH ${installation?.targetDsh ?? "0.2.1-alpha.2"}`),
          h("p", { style: small }, `已安装 Commit：${installation?.installedCommit ?? "无法准确确定"}${installation?.declaredCommit ? "；声明固定 SHA " + installation.declaredCommit + "，不冒充锁定后的安装证据" : ""}`),
          h(Button, { disabled: busy, onClick: () => act("checkUpdates") }, "检查更新"), busy && h("p",{role:"status"},"处理中…"),
          h("small",null,"仅检查，不会自动安装。Release 与 main 开发提交分别显示。"),
          update && h("p", { role: "status", style: small }, `${new Date(update.checkedAt).toLocaleString()} · ${update.error ? updateNames[update.error] ?? "检查失败" : [updateNames[update.releaseStatus], updateNames[update.mainStatus], update.npmStatus && update.npmStatus !== "not-checked" ? "npm：" + ({ "newer-version": "发现较新版本", "no-release": "暂无正式发布", "comparison-unknown": "版本比较未确认" }[update.npmStatus] ?? "结果未知") : null, update.compatibility === "declared-target-match" ? "声明支持目标版本（未经运行验证）" : update.compatibility === "target-mismatch" ? "目标版本不兼容" : "兼容性未确认"].filter(Boolean).join(" · ")}`),
          update?.mainCommit && h("p", { style: small }, `GitHub 最新 main：${update.mainCommit}`),
          update?.comparison && h("p", { style: small }, update.comparison.basis ? `${update.comparison.basis === "declared" ? "声明来源 SHA（未验证实际运行）" : "已确认安装 SHA"}：${update.comparison.commit} · ${{ ahead: "main 有较新提交", behind: "main 落后于比较基准", identical: "提交相同", diverged: "历史已分叉，不能线性判断新旧", unknown: "无法比较", unavailable: "比较不可用" }[update.comparison.status] ?? "比较未确认"}；${update.comparison.error ? updateNames[update.comparison.error] ?? ({ "comparison-not-found": "SHA 不属于该仓库或比较不可用", "comparison-failed": "比较失败", "invalid-comparison": "比较响应证据不足" }[update.comparison.error] ?? "比较失败") : update.comparison.changeKind === "documentation-only" ? "完整文件清单仅涉及文档/图片" : update.comparison.changeKind === "no-file-changes" ? "没有文件变化" : update.comparison.filesComplete ? "含代码或其他文件变化" : "文件清单完整性未确认"}。${update.comparison.basis === "declared" ? "这不是实际运行版本的验证结果。" : ""}` : "没有可比较的安装提交；tgz / package version 不能证明与 main 代码相同。"),
          errorView,
          h("a", { href: "https://github.com/Xuanyi-king/DSH-Adaptive-Router", target: "_blank", rel: "noopener noreferrer" }, "打开 GitHub"), " · ", h("a", { href: "https://github.com/Xuanyi-king/DSH-Adaptive-Router/releases", target: "_blank", rel: "noopener noreferrer" }, "查看 Releases"),
          h("details",null,h("summary",null,"安全升级说明"),h("p", { style: small }, "只读检查，绝不安装或修改 Profile。实际升级请先备份当前 Profile/来源/lock，在 DSH 外部完全退出 Host，再用官方管理器固定版本安装；重启核对 active 并保留回滚包。desktop 与 web 不可混用。"))));
    }
    function Settings(props) {
      const snapshot = props.useAdaptiveSettings(s => s);
      const directory = props.useAdaptiveCatalog(s => s);
      const setup = props.useAdaptiveSetup(s => s);
      const epoch = props.useAdaptiveLabEpoch(s => s);
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
      React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
      const value = { ...snapshot.value, ...draft };
      const candidates = value.candidates ?? [];
      const presetValue = preset ?? (engineFor(value)==="NeoHorse" && value.apiUrl==="https://tokenrhythm.studio/v1/systemone" ? "neohorse-hosted" : engineFor(value)==="NeoHorse" && value.apiUrl==="http://127.0.0.1:8080/v1/systemone" ? "neohorse-local" : value.classifierModel==="jev-latest" ? "jev" : "custom");
      const rows = catalogRows(directory.value);
      const disabled = !snapshot.writable || saving;
      const discard = () => { setDraft(null); baseline.current = null; setFailed(false); setNotice(""); setPreset(null); setCheckNotice(""); checkGeneration.current++; checkingRef.current=false; setChecking(false); };
      const edit = (field, next) => {
        if (disabled) return;
        if (baseline.current === null) baseline.current = { revision: snapshot.revision, value: snapshot.value };
        setDraft(old => ({ ...old, [field]: next })); setFailed(false); setNotice("");
      };
      const invalid = draft?.candidates && directory.value
        ? candidateError(candidates, directory.value, baseline.current?.value.candidates ?? []) : null;
      const save = async () => {
        if (writing.current || !draft || !snapshot.writable) return;
        writing.current = true; setSaving(true); setFailed(false); setNotice("");
        try {
          if (draft.candidates) {
            const catalog = await props.refreshCatalog();
            const error = candidateError(draft.candidates, catalog, baseline.current?.value.candidates ?? []);
            if (error) throw new Error(error);
          }
          const accepted = await props.mutate(Object.entries(draft).map(([field, next]) => ({ op: "set", path: [field], value: next })), baseline.current?.revision);
          if (mounted.current) {
            if (accepted) { setDraft(null); baseline.current = null; setNotice("已保存。"); }
            else setFailed(true);
          }
        } catch (error) {
          if (mounted.current) { setFailed(true); setNotice(error.message === "catalog-unavailable" ? "模型目录暂不可用，请稍后重试。" : "配置未保存，请检查模型和档位或刷新配置。"); }
        } finally { writing.current = false; if (mounted.current) setSaving(false); }
      };
      const changeCandidate = (index, patch) => edit("candidates", candidates.map((item, i) => i === index ? { ...item, ...patch } : item));
      const enabledRows = candidates.filter(item => item.enabled);
      const availableEfforts = [...new Set(rows.filter(row => enabledRows.some(item => item.provider === row.provider && item.model === row.model)).flatMap(row => row.efforts.map(e => e.id)))];
      const fixed = value.fixedEffort ?? "";
      const fallback = value.fallback ?? "";
      const connectionDraft = !!draft && ["apiUrl","apiKeyEnv","classifierModel"].some(k => Object.hasOwn(draft, k));
      const stateNames = { Ready:"正常", Unverified:"待验证", "Needs Setup":"需要配置", Degraded:"已降级", Conflict:"存在冲突", Manual:"手动控制", Disabled:"已关闭", Native:"模型默认" };
      const modeHelp = { FULL_AUTO:"自动选择模型和思考档位。", MODEL_AUTO:"只自动选择模型。", EFFORT_AUTO:"只调整思考档位。", MANUAL:"保持 DSH 原生选择。" };
      React.useEffect(() => { checkGeneration.current++; checkingRef.current=false; setChecking(false); setCheckNotice(""); }, [epoch, snapshot.revision, connectionDraft]);
      const ready = readiness(value, { catalog: directory.status === "ready" ? directory.value : null,
        keyAvailable: connectionDraft ? undefined : setup.value?.keyAvailable,
        verified: !draft && setup.value?.verified, conflict: setup.value?.conflict, failure: connectionDraft ? undefined : setup.value?.verification?.failure });
      const checkConnection = async () => {
        if (checkingRef.current) return;
        checkingRef.current = true; const generation=++checkGeneration.current; setChecking(true); setCheckNotice("");
        try { const result = await props.refreshSetup(); if (mounted.current && generation===checkGeneration.current) setCheckNotice(!result ? "检查暂不可用，请确认 Host 连接。" : !result.endpointValid ? "请填写有效的接口地址。" : result.keyAvailable === false ? "未找到 API Key 凭据，请在 DSH 凭据管理中保存对应名称。" : result.verified ? "服务已验证。" : result.keyAvailable === true ? "配置正常，等待首次实际调用。" : "凭据状态待确认，尚未验证连接。"); }
        catch { if (mounted.current && generation===checkGeneration.current) setCheckNotice("检查暂不可用，尚未验证连接。"); }
        finally { if(generation===checkGeneration.current){checkingRef.current = false; if (mounted.current) setChecking(false);} }
      };
      if (props.view === "summary") return h("span", null, modes[value.mode] ?? value.mode, " · ", enabledRows.length, " 个候选");
      return h(SettingsForm, { labels,
        state: { available: snapshot.status === "ready", writable: snapshot.writable, dirty: !!draft, invalid: !!invalid || !snapshot.writable, saving, failed },
        onSave: save, onDiscard: discard },
        h("div", { className:"ar-settings" }, h("style",null,settingsCss),
        h("section", { className:"ar-card", "aria-label":"智能路由设置" },
          h("div", { className:"ar-row" }, h("h3",null,"智能路由"),
          h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, h(Switch, { label: "启用智能路由", checked: !!value.enabled, disabled, onChange: next => edit("enabled", next) }), value.enabled ? "已开启" : "已关闭")),
          select("路由模式（所有会话）", value.mode, [["FULL_AUTO","完全自动"],["MODEL_AUTO","自动模型"],["EFFORT_AUTO","自动档位"],["MANUAL","手动"]], next => edit("mode", next), disabled),
          h("div",{className:"ar-row"},h("span",{className:"ar-status",role:"status","aria-label":"路由就绪状态","data-state":ready.state},stateNames[ready.state]??ready.state),h("small",null,modeHelp[value.mode])),
          h("p",{className:"ar-note"}, ready.code === "unverified" ? "配置已填写，尚未验证连接。" : ready.reason),
          h("details",null,h("summary",null,"状态详情"),h("small",null,ready.action)),
          (value.mode === "MODEL_AUTO") && select("固定思考档位", fixed, [["", "保持原生当前档位"], ...availableEfforts.map(id => [id, id]), ...fixed && !availableEfforts.includes(fixed) ? [[fixed, `${fixed}（当前目录未声明）`, true]] : []], next => edit("fixedEffort", next), disabled),
          h("details", {"aria-label":"路由高级选项"},h("summary",null,"高级选项"),h("div", { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
            h(Checkbox, { label: "锁定原生模型", checked: !!value.lockModel, disabled, onChange: next => edit("lockModel", next) }),
            h(Checkbox, { label: "锁定原生档位", checked: !!value.lockEffort, disabled, onChange: next => edit("lockEffort", next) })))),
        h("section",{className:"ar-card","aria-label":"模型与分类服务"}, h("h3",null,"模型与分类服务"),h("div",{className:"ar-grid"},
        h("details", { open: ["FULL_AUTO","MODEL_AUTO"].includes(value.mode), style: sectionStyle }, h("summary", null, "候选模型", ["EFFORT_AUTO","MANUAL"].includes(value.mode) ? "（本模式不自动选模）" : ""),h("div",{className:"ar-stack"},
          h("small", null, ["MANUAL","EFFORT_AUTO"].includes(value.mode) ? "当前模式使用 DSH 原生模型，无需配置候选。已有配置会保留。" : "选择允许自动使用的模型，再设置能力与用途。"),
          h(Input, { placeholder: "搜索模型名称、Provider 或 ID", "aria-label": "搜索模型", value: search, onChange: e => setSearch(e.target.value) }),
          h(Button, { size: "sm", disabled: directory.status === "loading", style: { justifySelf: "start" }, onClick: () => props.refreshCatalog().catch(() => {}) }, "刷新模型目录"),
          directory.status === "loading" && h("p", { role: "status" }, "正在读取 Host 模型目录…"),
          directory.status === "error" && h("p", { role: "alert" }, "模型目录加载失败，请刷新重试。已保存的候选不会丢失。"),
          (directory.value?.failures ?? []).map(provider => h("p", { key: provider.id, role: "status" }, provider.name, "：目录暂不可用")),
          directory.status === "ready" && !rows.length && h("p", { role: "status" }, "暂无可用模型，请先在 DSH 配置提供商。"),
          h("div", { className:"ar-catalog" }, (directory.status === "ready" ? directory.value?.groups ?? [] : []).map(group => {
            const visible = rows.filter(row => row.provider === group.id && `${row.name} ${row.providerName} ${row.provider} ${row.model}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(candidates.some(c => c.enabled && c.provider === b.provider && c.model === b.model)) - Number(candidates.some(c => c.enabled && c.provider === a.provider && c.model === a.model)));
            return visible.length ? h("fieldset", { key: group.id, style: { border: 0, padding: 0, display: "grid", gap: 8, minWidth: 0 } }, h("legend", null, group.name), visible.map(row => h("div", { key: row.model, title: `${row.provider} / ${row.model}` },
              h(Checkbox, { label: row.name, checked: candidates.some(item => item.enabled && item.provider === row.provider && item.model === row.model), disabled, onChange: next => {
                const index = candidates.findIndex(item => item.provider === row.provider && item.model === row.model);
                if (index < 0) edit("candidates", [...candidates, { provider: row.provider, model: row.model, enabled: true, tier: "moderate", roles: ["general"], effortByTier: {} }]);
                else changeCandidate(index, { enabled: next });
              } }), h("small", { className:"ar-muted ar-model", title:`${row.provider}/${row.model}` }, row.provider, " / ", row.model)))) : null;
          })),
          candidates.map((candidate, index) => {
            const row = directory.status === "ready" ? rows.find(item => item.provider === candidate.provider && item.model === candidate.model) : undefined;
            const efforts = row?.efforts ?? [];
            return h("details", { key: JSON.stringify([candidate.provider, candidate.model, index]), "aria-label": `${row?.name ?? candidate.model} 候选配置`, className:"ar-candidate" },
              h("summary", null, `${candidate.enabled ? "已启用" : "已停用"} · ${row?.name ?? candidate.model} · ${tiers[candidate.tier] ?? candidate.tier}`), h("small", { style: { overflowWrap: "anywhere" } }, candidate.provider, " / ", candidate.model),
              h("small", { role: "status" }, row ? "目录可用" : "当前目录不可用；保留已保存配置"),
              h(Checkbox, { label: "参与自动路由", checked: !!candidate.enabled, disabled: disabled || !row && !candidate.enabled, onChange: next => changeCandidate(index, { enabled: next }) }),
              select("能力等级", candidate.tier, Object.entries(tiers), next => changeCandidate(index, { tier: next }), disabled),
              h("div", { style: { display: "flex", flexWrap: "wrap", gap: 14 } }, Object.entries(roles).map(([id, label]) => h(Checkbox, { key: id, label, disabled, checked: candidate.roles?.includes(id) ?? false, onChange: next => changeCandidate(index, { roles: next ? [...(candidate.roles ?? []), id] : candidate.roles.filter(role => role !== id) }) }))),
              row && !efforts.length ? h("div", null, h("small", null, "由模型默认处理"),
                Object.keys(candidate.effortByTier ?? {}).length > 0 && h(Button, { size: "sm", disabled,
                  onClick: () => changeCandidate(index, { effortByTier: {} }) }, "使用模型默认（清除旧档位映射）")) : row ? Object.entries(tiers).map(([id, label]) => {
                const mapped = candidate.effortByTier?.[id] ?? "";
                const automatic = autoEffort(candidate, efforts.map(e => e.id), id);
                const options = [["", `自动映射 · ${automatic ?? "模型默认"}`], ...efforts.map(e => [e.id, e.name]), ...mapped && !efforts.some(e => e.id === mapped) ? [[mapped, `${mapped}（已失效）`, true]] : []];
                return select(`${label}任务档位`, mapped, options, next => {
                  const mapping = { ...candidate.effortByTier }; if (next) mapping[id] = next; else delete mapping[id];
                  changeCandidate(index, { effortByTier: mapping });
                }, disabled);
              }) : null,
              h(Button, { size: "sm", disabled, onClick: () => edit("candidates", candidates.filter((_, i) => i !== index)) }, "移除这项配置"));
          }),
          !enabledRows.length && h("p", { role: "status" }, "尚未启用候选模型，将保留原生选择。"),
          invalid && h("p", { role: "alert" }, invalid),
          select("回退模型（仅原模型明确不可用时）", fallback,
            [["", "保持原生配置"], ...enabledRows.map(item => [`${item.provider}/${item.model}`, rows.find(row => row.provider === item.provider && row.model === item.model)?.name ?? `${item.model}（目录不可用）`]), ...fallback && !enabledRows.some(item => `${item.provider}/${item.model}` === fallback) ? [[fallback, `${fallback}（保留旧配置）`, true]] : []], next => edit("fallback", next), disabled))),
        h("details", { open: value.mode !== "MANUAL", style: sectionStyle }, h("summary", null, "任务分类服务", value.mode === "MANUAL" ? " · 当前不需要" : ""),
          h("div",{className:"ar-stack"},
          h("small",null,value.mode === "MANUAL" ? "手动模式不调用分类服务。已有设置不会清空。" : "帮助判断任务难度，使用已有模型执行任务。"),
          select("服务类型",presetValue,[["custom","自定义"],["neohorse-hosted","NeoHorse-Jev · TokenRhythm"],["neohorse-local","NeoHorse-Jev · 本地"],["jev","Jev"]],next=>{setPreset(next);for(const [field,patch]of Object.entries(presetPatch(next,value)))edit(field,patch);setCheckNotice("");setNotice("配置已填写，保存后生效。自定义凭据与阈值已保留。");},disabled),
          ...[["apiUrl","接口地址"],["classifierModel","分类模型"]].map(([field,label])=>h("label",{key:field,style:fieldStyle},label,h(Input,{"aria-label":label,disabled,value:value[field]??"",placeholder:field==="apiUrl"?"https://…/v1/systemone":"jev-latest",onChange:e=>{edit(field,e.target.value);setPreset("custom");}}))),
          h("div",{className:"ar-row"},h("h4",null,"API Key 凭据"),h("span",{className:"ar-status"},connectionDraft?"待保存后确认":setup.value?.keyAvailable===true?"已配置":setup.value?.keyAvailable===false?"未配置":"待确认")),
          h("label",{style:fieldStyle},"凭据名称，不是 API Key",h(Input,{"aria-label":"API Key 凭据",disabled,value:value.apiKeyEnv??"",placeholder:"TOKENRHYTHM_API_KEY",autoComplete:"off",spellCheck:false,onChange:e=>edit("apiKeyEnv",e.target.value)})),
          h("small",null,`请在 DSH 凭据管理中保存 ${value.apiKeyEnv||"对应名称"}。不要在此粘贴真实密钥。`),
          h("div",{className:"ar-row"},h("span",{className:"ar-status",role:"status"},connectionDraft?"配置待保存":setup.value?.verified?"服务已验证":setup.value?.verification?.ok===false?"验证失败":!value.apiUrl?"未配置":setup.value?.endpointValid&&setup.value?.keyAvailable?"配置有效 · 连接未验证":"连接未验证"),
            h(Button,{size:"sm",disabled:checking||!!draft||snapshot.status!=="ready",onClick:checkConnection},checking?"检查中…":"检查配置")),
          h("small",null,"检查配置不发送网络请求。首次实际分类成功后才显示服务已验证。"),
          !connectionDraft&&checkNotice&&h("p",{role:"status"},checkNotice),
          h("details",null,h("summary",null,"详细信息"),h("div",{className:"ar-stack"},
            h("small",null,`${engineFor(value)} · confidence 不是正确率，不同引擎间不能直接比较。`),
            h("small",null,"本地服务地址指向 Host 所在环境；容器或远程 Host 中的 localhost 不是浏览器电脑。Jev 预设保留现有地址与自定义凭据。"),
            setup.value?.verification&&h("small",null,`${setup.value.engine} · ${setup.value.model} · ${setup.value.verification.elapsedMs??"未知"} ms · ${new Date(setup.value.verification.at).toLocaleString()} · ${setup.value.verification.ok?"请求已验证":explainReason(setup.value.verification.failure??"failed").reason}`))),
          h("details", null, h("summary", null, "高级连接选项"),
            ...[["timeoutMs", "超时（500–30000 毫秒）", 500, 30000, 1], ["confidenceThreshold", "置信度阈值（0–1）", 0, 1, .05]].map(([field, label, min, max, step]) => h("label", { key: field, style: fieldStyle }, label, h(Input, { type: "number", disabled, min, max, step, value: value[field] ?? "", onChange: e => edit(field, Number(e.target.value)) })))))))),
        h(LabPanel, { ...props, enabled: value.labEnabled, routerEnabled: value.enabled, pending: !!draft && Object.hasOwn(draft,"labEnabled"), disabled, writable: snapshot.writable, onChange: next => edit("labEnabled", next) }),
        h(LabPanel, { ...props, maintenanceOnly: true, enabled: value.labEnabled, disabled, writable: snapshot.writable, onChange: next => edit("labEnabled", next) }),
        notice && h("p", { role: "status" }, notice),
        draft && h(Button, { disabled: saving, onClick: discard }, "撤销未保存修改")));
    }
    function Chip(props) {
      const projected = props.useProjection("adaptiveRouter");
      const settings = props.useAdaptiveSettings(s => s);
      const directory = props.useAdaptiveCatalog(s => s);
      const setup = props.useAdaptiveSetup(s => s);
      const connection = props.useAdaptiveConnection(c => c);
      const running = props.useSession(s => s.running);
      const [status, setStatus] = React.useState(null);
      const [open, setOpen] = React.useState(false);
      const writing = React.useRef(false);
      const [saving, setSaving] = React.useState(false);
      const [failed, setFailed] = React.useState(false);
      React.useEffect(() => {
        let cancelled = false; setStatus(null);
        if (!connection || !props.sessionId) return;
        connection.rpc.call("/api", "adaptiveRouter/getSessionState", { args: { sessionId: props.sessionId } })
          .then(result => { if (!cancelled && result?.ok) { setStatus(result.value); void props.refreshSetup(); } })
          .catch(() => { /* Committed native state remains usable without router diagnostics. */ });
        return () => { cancelled = true; };
      }, [connection, props.sessionId, projected?.tick, settings.revision]);
      if (!settings.value?.enabled) return null;
      const actual = projected?.actual ?? null;
      const { control, reason } = actualControl(actual, status);
      const row = actual && catalogRows(directory.value).find(item => item.provider === actual.provider && item.model === actual.model);
      const name = row?.name ?? actual?.model ?? "等待请求";
      const effort = row?.efforts.find(item => item.id === actual?.reasoningEffort)?.name ?? actual?.reasoningEffort ?? "Default";
      const currentMode = settings.value.mode;
      const last = status?.decision;
      const ready = readiness(settings.value, { catalog: directory.status === "ready" ? directory.value : null,
        current: actual, ...setup.value, nativeManual: control === "Manual" && status?.decision?.reason === "native-manual", failure: setup.value?.verification?.failure ?? (control === "Bypass" ? last?.reason : undefined) });
      const controlLabel = { Auto: "自动", Native: "原生", Manual: "手动", Bypass: "原生", Fallback: "备用", Blocked: "已阻止", Conflict: "冲突" }[control] ?? "原生";
      const compact = !actual && ready.state === "Needs Setup" ? "未就绪" : `${controlLabel}${actual ? " · " + name : ""}`;
      const diagnosticItems = [{ type: "label", id: "ready", text: `${ready.state} · ${ready.reason} ${ready.action}` },
        { type: "label", id: "source", text: `选择来源：${control}；分类来源：${last?.source ?? "未知"}` },
        ...last?.tier ? [{ type: "label", id: "classification", text: `${last.tier} / ${last.role ?? "未知"} · confidence ${last.confidence ?? "未知"}（非正确率）` }] : [],
        ...last?.at ? [{ type: "label", id: "time", text: `${new Date(last.at).toLocaleString()} · ${last.elapsedMs ?? "未知"}ms · 实际备用切换：${last.fallbackApplied ? "是" : "否"}` }] : [],
        ...last?.selection ? [{ type: "label", id: "plan", text: `计划：${last.selection.provider}/${last.selection.model}；计划不等于已执行` }] : []];
      const choose = async id => {
        if (id === "config") { props.openConfig(); setOpen(false); return; }
        if (running || writing.current || !settings.writable) return;
        writing.current = true; setSaving(true); setFailed(false);
        try { if (!await props.changeMode(id)) setFailed(true); else setOpen(false); }
        catch { setFailed(true); }
        finally { writing.current = false; setSaving(false); }
      };
      return h(Menu, { open, portal: true, autoFocus: true, side: "top", align: "end", compact: true, onClose: () => setOpen(false), onSelect: choose, selectedId: currentMode,
        anchor: h(Button, { size: "sm", variant: "toolbar", "aria-label": "智能路由快捷菜单", "aria-haspopup": "menu", "aria-expanded": open, title: `${control} · ${name} · ${effort}\n${reason}`, style: { maxWidth: "min(180px, 28vw)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }, onClick: () => setOpen(old => !old) }, h("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } }, compact)),
        items: [{ type: "label", id: "scope", text: "模式 · 插件级（所有会话）" }, ...Object.entries(modes).map(([id, label]) => ({ id, label, disabled: !!running || saving || !settings.writable })),
          { type: "separator", id: "sep" }, { type: "label", id: "actual", text: actual ? `${control} · ${actual.provider} / ${actual.model} · ${effort}` : "尚无已提交的原生请求" },
          { type: "label", id: "reason", text: reason }, ...diagnosticItems, ...running ? [{ type: "label", id: "busy", text: "当前任务执行中，模式切换已暂停" }] : [],
          ...failed ? [{ type: "label", id: "failed", text: "模式未保存，请稍后重试" }] : [], { id: "config", label: "打开插件配置" }] });
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
          } catch { if (version === setupGeneration && !disposed) setup.set({ value: null }); return null; }
        };
        ctx.effect(() => form.subscribe(() => { setup.set({ value: null }); void refreshSetup(); }));
        let generation = 0, disposed = false, inflight;
        const load = () => {
          if (inflight) return inflight;
          const version = generation;
          directory.set({ ...directory.getSnapshot(), status: "loading" });
          const task = ctx.remote.session.modelCatalog().then(result => {
            if (!result.ok || disposed || version !== generation) throw new Error("catalog-unavailable");
            directory.set({ status: "ready", value: result.value }); return result.value;
          }).catch(() => {
            if (!disposed && version === generation) directory.set({ ...directory.getSnapshot(), status: "error" });
            throw new Error("catalog-unavailable");
          }).finally(() => { if (inflight === task) inflight = undefined; });
          inflight = task; return task;
        };
        const refresh = () => { generation++; inflight = undefined; void load().catch(() => {}); void refreshSetup(); };
        ctx.effect(() => () => { disposed = true; generation++; setupGeneration++; });
        ctx.effect(() => [ctx.remote.$on("llm/adapters-updated", refresh), ctx.remote.$on("settings/document-updated", refresh), ctx.remote.$on("credentials/record-updated", refresh), ctx.remote.$on("credentials/reference-updated", refresh)]);
        ctx.on("connection/reset", () => { labEpoch.set(labEpoch.getSnapshot() + 1); directory.set({ status: "idle", value: null }); refresh(); });
        void load().catch(() => {}); void refreshSetup();
        const shared = () => ({ hooks: { adaptiveSettings: form, adaptiveCatalog: directory, adaptiveSetup: setup, adaptiveLabEpoch: labEpoch }, labCall: (op, args) => ctx.connection.rpc.call("/api", "adaptiveRouterLab/" + op, { args }), refreshCatalog: load, refreshSetup, mutate: (ops, revision) => form.mutate(ops, revision) });
        for (const [name, key] of [["plugins.bundle.config", pkg], ["plugins.row.config", pkg + "#adaptive-router"]])
          ctx.slots.inject(name, () => ctx.slots.register({ name, key, inject: shared }, Settings));
        ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "adaptive-router", order: 51,
          inject: sessionId => ({ ...shared(), hooks: { ...shared().hooks, adaptiveConnection: connection },
            openConfig: () => ctx.get("pluginNavigation")?.openBundle(pkg),
            changeMode: async mode => {
              if (!Object.hasOwn(modes, mode) || ctx.sessions?.binding(sessionId)?.session.getSnapshot().running !== false) return false;
              const snapshot = form.getSnapshot();
              return snapshot.status === "ready" && snapshot.writable ? form.mutate([{ op: "set", path: ["mode"], value: mode }], snapshot.revision) : false;
            } }),
        }, Chip));
      },
    };
  },
});
