"use strict";
(() => {
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
  var reasonLabels = {
    local: "\u72EC\u7ACB\u7B80\u5355\u8BF7\u6C42\uFF0C\u4F7F\u7528\u672C\u5730\u5FEB\u901F\u5224\u65AD\u3002",
    jev: "\u4F9D\u636E Jev \u7684\u4EFB\u52A1\u80FD\u529B\u4E0E\u7528\u9014\u5224\u65AD\u3002",
    anchored: "\u5EF6\u7EED\u672A\u5B8C\u6210\u4EFB\u52A1\uFF0C\u4FDD\u6301\u6A21\u578B\u548C\u63A8\u7406\u6DF1\u5EA6\u3002",
    manual: "\u624B\u52A8\u6A21\u5F0F\uFF0C\u4FDD\u7559\u539F\u751F\u9009\u62E9\u3002",
    "native-manual": "\u7528\u6237\u539F\u751F\u624B\u52A8\u9009\u62E9\u4F18\u5148\u3002",
    "no-url": "\u672A\u914D\u7F6E Jev \u5730\u5740\uFF0C\u4FDD\u6301\u539F\u751F\u8C03\u7528\u3002",
    "no-key": "Jev \u51ED\u636E\u4E0D\u53EF\u7528\uFF0C\u4FDD\u6301\u539F\u751F\u8C03\u7528\u3002",
    timeout: "Jev \u8D85\u65F6\uFF0C\u4F7F\u7528\u5B89\u5168\u56DE\u9000\u3002",
    failed: "Jev \u8FDE\u63A5\u6216\u54CD\u5E94\u5931\u8D25\uFF0C\u4F7F\u7528\u5B89\u5168\u56DE\u9000\u3002",
    "invalid-choice": "\u5206\u7C7B\u7ED3\u679C\u4E0D\u5408\u6CD5\uFF0C\u4F7F\u7528\u5B89\u5168\u56DE\u9000\u3002",
    "context-capacity-blocked": "\u6700\u65B0\u4E0A\u4E0B\u6587\u8D85\u9650\u6216\u65E0\u6CD5\u5B89\u5168\u4F30\u7B97\u5BB9\u91CF\u3002\u8BF7\u624B\u52A8\u9009\u62E9\u66F4\u5927\u7A97\u53E3\u6A21\u578B\u6216\u538B\u7F29\u4E0A\u4E0B\u6587\u3002",
    "context-too-large": "\u76EE\u6807\u7A97\u53E3\u65E0\u6CD5\u5B89\u5168\u5BB9\u7EB3\u4E0A\u4E0B\u6587\uFF0C\u4FDD\u7559\u539F\u751F\u8C03\u7528\u3002",
    "settings-changed": "\u914D\u7F6E\u5DF2\u4FEE\u6539\uFF0C\u672C\u8F6E\u4E0D\u518D\u590D\u7528\u65E7\u81EA\u52A8\u51B3\u5B9A\u3002",
    "held-route-unavailable": "\u7F13\u5B58\u76EE\u6807\u5DF2\u4E0D\u53EF\u7528\uFF0C\u4E0D\u518D\u590D\u7528\u3002"
  };
  function actualControl(actual, status) {
    const decision = status?.decision;
    const reason = status?.conflict ? "\u4E0E Jev Effort Selector \u51B2\u7A81\uFF0C\u672C\u63D2\u4EF6\u5DF2\u9000\u51FA\u81EA\u52A8\u63A7\u5236\u3002" : reasonLabels[decision?.reason ?? ""] ?? decision?.reason ?? "\u6682\u65E0\u8DEF\u7531\u51B3\u7B56\u8BB0\u5F55\u3002";
    if (!actual) return {
      control: status?.conflict ? "Conflict" : decision?.control === "Blocked" ? "Blocked" : "Native",
      reason: status?.conflict || decision?.control === "Blocked" ? reason : "\u7B49\u5F85\u539F\u751F\u8BF7\u6C42"
    };
    const selected = decision?.selection;
    const matches = !selected || !!actual && sameModel(actual, selected) && selected.reasoningEffort === actual.reasoningEffort;
    return {
      control: status?.conflict ? "Conflict" : matches ? decision?.control ?? "Native" : "Native",
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
      const sectionStyle = { display: "grid", gap: 12, padding: "16px 0", borderBottom: "1px solid var(--dsw-alias-border-l2, #8884)" };
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
      function Settings(props) {
        const snapshot = props.useAdaptiveSettings((s) => s);
        const directory = props.useAdaptiveCatalog((s) => s);
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
        const rows = catalogRows(directory.value);
        const disabled = !snapshot.writable || saving;
        const discard = () => {
          setDraft(null);
          baseline.current = null;
          setFailed(false);
          setNotice("");
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
                setNotice("\u914D\u7F6E\u5DF2\u4FDD\u5B58\u5230 Host\u3002");
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
        if (props.view === "summary") return h("span", null, modes[value.mode] ?? value.mode, " \xB7 ", enabledRows.length, " \u4E2A\u5019\u9009");
        return h(
          SettingsForm,
          {
            labels,
            state: { available: snapshot.status === "ready", writable: snapshot.writable, dirty: !!draft, invalid: !!invalid || !snapshot.writable, saving, failed },
            onSave: save,
            onDiscard: () => {
            }
          },
          h(
            "section",
            { style: sectionStyle },
            h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, h(Switch, { label: "\u542F\u7528\u667A\u80FD\u8DEF\u7531", checked: !!value.enabled, disabled, onChange: (next) => edit("enabled", next) }), "\u542F\u7528\u667A\u80FD\u8DEF\u7531"),
            select("\u8DEF\u7531\u6A21\u5F0F\uFF08\u63D2\u4EF6\u7EA7\uFF0C\u9002\u7528\u4E8E\u6240\u6709\u4F1A\u8BDD\uFF09", value.mode, Object.entries(modes), (next) => edit("mode", next), disabled),
            value.mode === "MODEL_AUTO" && select("\u56FA\u5B9A\u601D\u8003\u6863\u4F4D", fixed, [["", "\u4FDD\u6301\u539F\u751F\u5F53\u524D\u6863\u4F4D"], ...availableEfforts.map((id) => [id, id]), ...fixed && !availableEfforts.includes(fixed) ? [[fixed, `${fixed}\uFF08\u5F53\u524D\u76EE\u5F55\u672A\u58F0\u660E\uFF09`, true]] : []], (next) => edit("fixedEffort", next), disabled),
            h(
              "div",
              { style: { display: "flex", gap: 14, flexWrap: "wrap" } },
              h(Checkbox, { label: "\u9501\u5B9A\u539F\u751F\u6A21\u578B", checked: !!value.lockModel, disabled, onChange: (next) => edit("lockModel", next) }),
              h(Checkbox, { label: "\u9501\u5B9A\u539F\u751F\u6863\u4F4D", checked: !!value.lockEffort, disabled, onChange: (next) => edit("lockEffort", next) })
            )
          ),
          h(
            "section",
            { style: sectionStyle },
            h("strong", null, "\u5019\u9009\u6A21\u578B"),
            h("small", null, "\u53EA\u4F7F\u7528\u4F60\u660E\u786E\u542F\u7528\u7684\u6A21\u578B\u3002\u80FD\u529B\u7B49\u7EA7\u7531\u4F60\u8BBE\u7F6E\uFF0C\u4E0D\u6839\u636E\u540D\u79F0\u731C\u6D4B\u3002"),
            h(Input, { placeholder: "\u641C\u7D22\u6A21\u578B\u540D\u79F0\u3001Provider \u6216 ID", "aria-label": "\u641C\u7D22\u6A21\u578B", value: search, onChange: (e) => setSearch(e.target.value) }),
            h(Button, { size: "sm", disabled: directory.status === "loading", style: { justifySelf: "start" }, onClick: () => props.refreshCatalog().catch(() => {
            }) }, "\u5237\u65B0\u6A21\u578B\u76EE\u5F55"),
            directory.status === "loading" && h("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6 Host \u6A21\u578B\u76EE\u5F55\u2026"),
            directory.status === "error" && h("p", { role: "alert" }, "\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002\u5DF2\u4FDD\u5B58\u7684\u5019\u9009\u4E0D\u4F1A\u4E22\u5931\u3002"),
            (directory.value?.failures ?? []).map((provider) => h("p", { key: provider.id, role: "status" }, provider.name, "\uFF1A\u76EE\u5F55\u6682\u4E0D\u53EF\u7528")),
            directory.status === "ready" && !rows.length && h("p", { role: "status" }, "\u6682\u65E0\u53EF\u7528\u6A21\u578B\uFF0C\u8BF7\u5148\u5728 DSH \u914D\u7F6E\u63D0\u4F9B\u5546\u3002"),
            h("div", { style: { maxHeight: 280, overflowY: "auto", display: "grid", gap: 12 } }, (directory.status === "ready" ? directory.value?.groups ?? [] : []).map((group) => {
              const visible = rows.filter((row) => row.provider === group.id && `${row.name} ${row.providerName} ${row.provider} ${row.model}`.toLowerCase().includes(search.toLowerCase()));
              return visible.length ? h("fieldset", { key: group.id, style: { border: 0, padding: 0, display: "grid", gap: 8, minWidth: 0 } }, h("legend", null, group.name), visible.map((row) => h(
                "div",
                { key: row.model, title: `${row.provider} / ${row.model}` },
                h(Checkbox, { label: row.name, checked: candidates.some((item) => item.enabled && item.provider === row.provider && item.model === row.model), disabled, onChange: (next) => {
                  const index = candidates.findIndex((item) => item.provider === row.provider && item.model === row.model);
                  if (index < 0) edit("candidates", [...candidates, { provider: row.provider, model: row.model, enabled: true, tier: "moderate", roles: ["general"], effortByTier: {} }]);
                  else changeCandidate(index, { enabled: next });
                } }),
                h("small", { style: { opacity: 0.65, display: "block", overflowWrap: "anywhere" } }, row.provider, " / ", row.model)
              ))) : null;
            })),
            candidates.map((candidate, index) => {
              const row = directory.status === "ready" ? rows.find((item) => item.provider === candidate.provider && item.model === candidate.model) : void 0;
              const efforts = row?.efforts ?? [];
              return h(
                "section",
                { key: JSON.stringify([candidate.provider, candidate.model, index]), "aria-label": `${row?.name ?? candidate.model} \u5019\u9009\u914D\u7F6E`, style: { ...sectionStyle, padding: 12, border: "1px solid var(--dsw-alias-border-l2, #8884)", borderRadius: 10 } },
                h("strong", null, row?.name ?? candidate.model),
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
          ),
          h(
            "section",
            { style: sectionStyle },
            h("strong", null, "Jev \u8FDE\u63A5"),
            h("small", null, "\u4F7F\u7528\u5DF2\u6709 Jev System One \u5730\u5740\u3002\u5BC6\u94A5\u5728 DSH \u539F\u751F\u51ED\u636E\u754C\u9762\u7BA1\u7406\uFF0C\u8FD9\u91CC\u4EC5\u4FDD\u5B58\u5F15\u7528\u3002"),
            ...[["apiUrl", "System One \u5B8C\u6574 URL"], ["apiKeyEnv", "Jev \u51ED\u636E\u5F15\u7528"], ["classifierModel", "Jev \u5206\u7C7B\u6A21\u578B"]].map(([field, label]) => h("label", { key: field, style: fieldStyle }, label, h(Input, { disabled, value: value[field] ?? "", onChange: (e) => edit(field, e.target.value) }))),
            h(
              "details",
              null,
              h("summary", null, "\u9AD8\u7EA7\u8FDE\u63A5\u9009\u9879"),
              ...[["timeoutMs", "\u8D85\u65F6\uFF08500\u201330000 \u6BEB\u79D2\uFF09", 500, 3e4, 1], ["confidenceThreshold", "\u7F6E\u4FE1\u5EA6\u9608\u503C\uFF080\u20131\uFF09", 0, 1, 0.05]].map(([field, label, min, max, step]) => h("label", { key: field, style: fieldStyle }, label, h(Input, { type: "number", disabled, min, max, step, value: value[field] ?? "", onChange: (e) => edit(field, Number(e.target.value)) })))
            )
          ),
          notice && h("p", { role: "status" }, notice),
          draft && h(Button, { disabled: saving, onClick: discard }, "\u64A4\u9500\u672A\u4FDD\u5B58\u4FEE\u6539")
        );
      }
      function Chip(props) {
        const projected = props.useProjection("adaptiveRouter");
        const settings = props.useAdaptiveSettings((s) => s);
        const directory = props.useAdaptiveCatalog((s) => s);
        const connection = props.useAdaptiveConnection((c) => c);
        const running = props.useSession((s) => s.running);
        const [status, setStatus] = React.useState(null);
        const [open, setOpen] = React.useState(false);
        const [saving, setSaving] = React.useState(false);
        const [failed, setFailed] = React.useState(false);
        React.useEffect(() => {
          let cancelled = false;
          setStatus(null);
          if (!connection || !props.sessionId) return;
          connection.rpc.call("/api", "adaptiveRouter/getSessionState", { args: { sessionId: props.sessionId } }).then((result) => {
            if (!cancelled && result?.ok) setStatus(result.value);
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
        const choose = async (id) => {
          if (id === "config") {
            props.openConfig();
            setOpen(false);
            return;
          }
          if (running || saving || !settings.writable) return;
          setSaving(true);
          setFailed(false);
          try {
            if (!await props.changeMode(id)) setFailed(true);
            else setOpen(false);
          } catch {
            setFailed(true);
          } finally {
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
${reason}`, style: { maxWidth: "min(180px, 28vw)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }, onClick: () => setOpen((old) => !old) }, h("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } }, `${control} \xB7 ${name}${actual ? " \xB7 " + effort : ""}`)),
          items: [
            { type: "label", id: "scope", text: "\u6A21\u5F0F \xB7 \u63D2\u4EF6\u7EA7\uFF08\u6240\u6709\u4F1A\u8BDD\uFF09" },
            ...Object.entries(modes).map(([id, label]) => ({ id, label, disabled: !!running || saving || !settings.writable })),
            { type: "separator", id: "sep" },
            { type: "label", id: "actual", text: actual ? `${control} \xB7 ${actual.provider} / ${actual.model} \xB7 ${effort}` : "\u5C1A\u65E0\u5DF2\u63D0\u4EA4\u7684\u539F\u751F\u8BF7\u6C42" },
            { type: "label", id: "reason", text: reason },
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
          };
          ctx.effect(() => () => {
            disposed = true;
            generation++;
          });
          ctx.effect(() => [ctx.remote.$on("llm/adapters-updated", refresh), ctx.remote.$on("settings/document-updated", refresh), ctx.remote.$on("credentials/record-updated", refresh), ctx.remote.$on("credentials/reference-updated", refresh)]);
          ctx.on("connection/reset", () => {
            directory.set({ status: "idle", value: null });
            refresh();
          });
          void load().catch(() => {
          });
          const shared = () => ({ hooks: { adaptiveSettings: form, adaptiveCatalog: directory }, refreshCatalog: load, mutate: (ops, revision) => form.mutate(ops, revision) });
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
