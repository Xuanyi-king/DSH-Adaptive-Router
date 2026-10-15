import { readiness, presets, presetPatch, engineFor, explainReason } from "./diagnostics.js";
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
    const sectionStyle = { display: "grid", gap: 12, padding: "16px 0", borderBottom: "1px solid var(--dsw-alias-border-l2, #8884)" };
    const fieldStyle = { display: "grid", gap: 6, minWidth: 0 };
    const selectStyle = { color: "inherit", background: "var(--dsw-alias-bg-layer-1, transparent)", border: "1px solid var(--dsw-alias-border-l2, #8886)", borderRadius: 8, padding: "7px 10px", minWidth: 0, maxWidth: "100%" };
    const select = (label, value, options, onChange, disabled) => h("label", { key: label, style: fieldStyle }, label,
      h("select", { value, disabled, "aria-label": label, style: selectStyle, onChange: e => onChange(e.target.value) },
        options.map(([id, name, unavailable]) => h("option", { key: id, value: id, disabled: unavailable }, name))));
    function Settings(props) {
      const snapshot = props.useAdaptiveSettings(s => s);
      const directory = props.useAdaptiveCatalog(s => s);
      const setup = props.useAdaptiveSetup(s => s);
      const [preset, setPreset] = React.useState("custom");
      const [checking, setChecking] = React.useState(false);
      const checkingRef = React.useRef(false);
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
      const rows = catalogRows(directory.value);
      const disabled = !snapshot.writable || saving;
      const discard = () => { setDraft(null); baseline.current = null; setFailed(false); setNotice(""); };
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
            if (accepted) { setDraft(null); baseline.current = null; setNotice("配置已保存到 Host。"); }
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
      const ready = readiness(value, { catalog: directory.status === "ready" ? directory.value : null,
        keyAvailable: connectionDraft ? undefined : setup.value?.keyAvailable,
        verified: !draft && setup.value?.verified, conflict: setup.value?.conflict, failure: connectionDraft ? undefined : setup.value?.verification?.failure });
      const checkConnection = async () => {
        if (checkingRef.current) return;
        checkingRef.current = true; setChecking(true); setCheckNotice("");
        try { const result = await props.refreshSetup(); if (mounted.current) setCheckNotice(result ? `配置：${result.engine} · ${result.model} · 地址${result.endpointValid ? "格式有效" : "格式无效"} · 凭据${result.keyAvailable === true ? "可解析" : result.keyAvailable === false ? "不可解析" : "待确认"} · 静态检查 ${result.inspectionMs ?? "未知"}ms · ${new Date(result.checkedAt).toLocaleString()}。${result.networkTestReason}` : "Host 静态检查不可用，未进行网络验证。请检查连接。"); }
        catch { if (mounted.current) setCheckNotice("Host 静态检查失败，未进行网络验证。"); }
        finally { checkingRef.current = false; if (mounted.current) setChecking(false); }
      };
      if (props.view === "summary") return h("span", null, modes[value.mode] ?? value.mode, " · ", enabledRows.length, " 个候选");
      return h(SettingsForm, { labels,
        state: { available: snapshot.status === "ready", writable: snapshot.writable, dirty: !!draft, invalid: !!invalid || !snapshot.writable, saving, failed },
        onSave: save, onDiscard: discard },
        h("section", { style: sectionStyle },
          h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, h(Switch, { label: "启用智能路由", checked: !!value.enabled, disabled, onChange: next => edit("enabled", next) }), "启用智能路由"),
          select("路由模式（插件级，适用于所有会话）", value.mode, Object.entries(modes), next => edit("mode", next), disabled),
          h("div", { role: "status", "aria-label": "路由就绪状态", style: { fontSize: 13 } }, `${ready.state} · ${ready.reason} ${ready.action}`),
          h("small", null, value.mode === "MANUAL" ? "手动模式：当前由 DSH 原生选择控制，不需要分类服务。" : value.mode === "EFFORT_AUTO" ? "仅自动档位：使用当前原生模型，无需配置候选模型；在聊天菜单核对当前合法档位。" : value.mode === "MODEL_AUTO" ? "仅自动模型：请授权候选，并确认固定档位与候选兼容。" : "完全自动：请授权候选、声明能力/用途并配置分类服务。"),
          (value.mode === "MODEL_AUTO") && select("固定思考档位", fixed, [["", "保持原生当前档位"], ...availableEfforts.map(id => [id, id]), ...fixed && !availableEfforts.includes(fixed) ? [[fixed, `${fixed}（当前目录未声明）`, true]] : []], next => edit("fixedEffort", next), disabled),
          h("div", { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
            h(Checkbox, { label: "锁定原生模型", checked: !!value.lockModel, disabled, onChange: next => edit("lockModel", next) }),
            h(Checkbox, { label: "锁定原生档位", checked: !!value.lockEffort, disabled, onChange: next => edit("lockEffort", next) }))),
        h("details", { open: ["FULL_AUTO","MODEL_AUTO"].includes(value.mode), style: sectionStyle }, h("summary", null, "候选模型", ["EFFORT_AUTO","MANUAL"].includes(value.mode) ? "（本模式不自动选模）" : ""),
          h("small", null, "只使用你明确启用的模型。能力等级由你设置，不根据名称猜测。"),
          h(Input, { placeholder: "搜索模型名称、Provider 或 ID", "aria-label": "搜索模型", value: search, onChange: e => setSearch(e.target.value) }),
          h(Button, { size: "sm", disabled: directory.status === "loading", style: { justifySelf: "start" }, onClick: () => props.refreshCatalog().catch(() => {}) }, "刷新模型目录"),
          directory.status === "loading" && h("p", { role: "status" }, "正在读取 Host 模型目录…"),
          directory.status === "error" && h("p", { role: "alert" }, "模型目录加载失败，请刷新重试。已保存的候选不会丢失。"),
          (directory.value?.failures ?? []).map(provider => h("p", { key: provider.id, role: "status" }, provider.name, "：目录暂不可用")),
          directory.status === "ready" && !rows.length && h("p", { role: "status" }, "暂无可用模型，请先在 DSH 配置提供商。"),
          h("div", { style: { maxHeight: 280, overflowY: "auto", display: "grid", gap: 12 } }, (directory.status === "ready" ? directory.value?.groups ?? [] : []).map(group => {
            const visible = rows.filter(row => row.provider === group.id && `${row.name} ${row.providerName} ${row.provider} ${row.model}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(candidates.some(c => c.enabled && c.provider === b.provider && c.model === b.model)) - Number(candidates.some(c => c.enabled && c.provider === a.provider && c.model === a.model)));
            return visible.length ? h("fieldset", { key: group.id, style: { border: 0, padding: 0, display: "grid", gap: 8, minWidth: 0 } }, h("legend", null, group.name), visible.map(row => h("div", { key: row.model, title: `${row.provider} / ${row.model}` },
              h(Checkbox, { label: row.name, checked: candidates.some(item => item.enabled && item.provider === row.provider && item.model === row.model), disabled, onChange: next => {
                const index = candidates.findIndex(item => item.provider === row.provider && item.model === row.model);
                if (index < 0) edit("candidates", [...candidates, { provider: row.provider, model: row.model, enabled: true, tier: "moderate", roles: ["general"], effortByTier: {} }]);
                else changeCandidate(index, { enabled: next });
              } }), h("small", { style: { opacity: .65, display: "block", overflowWrap: "anywhere" } }, row.provider, " / ", row.model)))) : null;
          })),
          candidates.map((candidate, index) => {
            const row = directory.status === "ready" ? rows.find(item => item.provider === candidate.provider && item.model === candidate.model) : undefined;
            const efforts = row?.efforts ?? [];
            return h("details", { key: JSON.stringify([candidate.provider, candidate.model, index]), "aria-label": `${row?.name ?? candidate.model} 候选配置`, style: { ...sectionStyle, padding: 12, border: "1px solid var(--dsw-alias-border-l2, #8884)", borderRadius: 10 } },
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
            [["", "保持原生配置"], ...enabledRows.map(item => [`${item.provider}/${item.model}`, rows.find(row => row.provider === item.provider && row.model === item.model)?.name ?? `${item.model}（目录不可用）`]), ...fallback && !enabledRows.some(item => `${item.provider}/${item.model}` === fallback) ? [[fallback, `${fallback}（保留旧配置）`, true]] : []], next => edit("fallback", next), disabled)),
        h("details", { open: value.mode !== "MANUAL", style: sectionStyle }, h("summary", null, "Jev 连接"),
          select("分类服务预设", preset, Object.entries(presets), setPreset, disabled),
          h(Button, { disabled: disabled || preset === "custom", onClick: () => {
            for (const [field, next] of Object.entries(presetPatch(preset, value))) edit(field, next);
            setNotice("预设已写入草稿，请核对后保存；自定义凭据引用和阈值已保留。原版 Jev 地址不自动重置。");
          } }, "应用预设到草稿"),
          h("small", { style: { display: "block" } }, "预设仅修改草稿；保存前核对地址与模型。托管服务需要对应权限和额度；localhost 指 Host 所在环境。"),
          h("small", { style: { display: "block" } }, `${engineFor(value)} · confidence 是分布统计量，不是正确率，也不跨引擎比较。阈值不随预设修改，低置信度继续沿用保守策略。`),
          h(Button, { disabled: checking || !!draft || snapshot.status !== "ready", onClick: checkConnection }, checking ? "检查中…" : "测试连接（静态检查）"),
          h("small", { style: { display: "block" } }, "先保存配置再检查。此按钮不发送聊天内容或网络探针；真实分类成功后才标记连接已验证。"),
          checkNotice && h("p", { role: "status" }, checkNotice),
          setup.value?.verification && h("p", { role: "status" }, `${setup.value.engine} · ${setup.value.model} · ${setup.value.verification.ok ? "System One 已验证" : "分类降级"} · ${setup.value.verification.elapsedMs}ms · ${new Date(setup.value.verification.at).toLocaleString()}`),
          h("small", null, "使用已有 Jev System One 地址。密钥在 DSH 原生凭据界面管理，这里仅保存引用。"),
          ...[["apiUrl", "System One 完整 URL"], ["apiKeyEnv", "Jev 凭据引用"], ["classifierModel", "Jev 分类模型"]].map(([field, label]) => h("label", { key: field, style: fieldStyle }, label, h(Input, { disabled, value: value[field] ?? "", onChange: e => edit(field, e.target.value) }))),
          h("details", null, h("summary", null, "高级连接选项"),
            ...[["timeoutMs", "超时（500–30000 毫秒）", 500, 30000, 1], ["confidenceThreshold", "置信度阈值（0–1）", 0, 1, .05]].map(([field, label, min, max, step]) => h("label", { key: field, style: fieldStyle }, label, h(Input, { type: "number", disabled, min, max, step, value: value[field] ?? "", onChange: e => edit(field, Number(e.target.value)) }))))),
        notice && h("p", { role: "status" }, notice),
        draft && h(Button, { disabled: saving, onClick: discard }, "撤销未保存修改"));
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
        ctx.on("connection/reset", () => { directory.set({ status: "idle", value: null }); refresh(); });
        void load().catch(() => {}); void refreshSetup();
        const shared = () => ({ hooks: { adaptiveSettings: form, adaptiveCatalog: directory, adaptiveSetup: setup }, refreshCatalog: load, refreshSetup, mutate: (ops, revision) => form.mutate(ops, revision) });
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
