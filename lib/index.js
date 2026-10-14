import { z } from "zod";
import { Config, readConfig } from "./config.js";
import { askJev, localSimple } from "./classifier.js";
import { chooseRoute, effortFor, sameModel, } from "./router.js";
import { ContextSchema, initContext, foldContext, contextBlock, messageText, } from "./context.js";
export { Config };
export const name = "adaptive-router";
export const inject = ["sessionProjections", "llm"];
const SelectionSchema = z.object({
    provider: z.string(),
    model: z.string(),
    reasoningEffort: z.string().optional(),
});
const StatusSchema = z.object({
    tick: z.number(),
    actual: SelectionSchema.nullable(),
});
const isSubagent = (agent) => agent.session.header.origin === "subagent";
const selectionOf = (config) => ({
    provider: config.provider,
    model: config.model,
    ...(config.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: String(config.reasoningEffort) }),
});
function replace(config, selected) {
    const { reasoningEffort: _old, ...rest } = config;
    return {
        ...rest,
        provider: selected.provider,
        model: selected.model,
        ...(selected.reasoningEffort === undefined
            ? {}
            : {
                reasoningEffort: selected.reasoningEffort,
            }),
    };
}
// Catalog listing has no AbortSignal argument in DSH. Bound our wait anyway;
// a late result stays local to poolFor and cannot alter any request or state.
async function withinBudget(operation, timeoutMs, signal) {
    let timer;
    let abort = () => { };
    const deadline = new Promise((_resolve, reject) => {
        abort = () => reject(new Error("routing cancelled"));
        if (signal.aborted) {
            abort();
            return;
        }
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => reject(new Error("metadata timeout")), timeoutMs);
    });
    try {
        return await Promise.race([operation, deadline]);
    }
    finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
    }
}
export function apply(ctx, config) {
    const held = new WeakMap();
    const pending = new WeakMap();
    const records = new Map();
    const settings = () => readConfig(config);
    function manualState(agent) {
        // SessionController owns this optional projection, not this plugin.
        const projections = ctx.sessionProjections;
        return projections.stateOf(agent.session, "modelSelection");
    }
    function canApply(agent, snapshot, signal) {
        const live = settings();
        return (!signal.aborted &&
            live.enabled &&
            JSON.stringify(live) === JSON.stringify(snapshot) &&
            !conflict() &&
            manualState(agent)?.pending === null);
    }
    function conflict() {
        // Public Cordis registry + published service. Detection is rechecked each request,
        // including a conflicting plugin added later. No dependence on listener order.
        if (ctx.get("jevEffortSelector") !== undefined)
            return true;
        return [...ctx.registry.values()].some((runtime) => runtime.name === "jev-effort-selector" && runtime.fibers.length > 0);
    }
    function save(agent, record) {
        held.set(agent, record);
        records.set(String(agent.session.id), record);
    }
    ctx.sessionProjections.register({
        key: "adaptiveRouterContext",
        stateVersion: 1,
        stateSchema: ContextSchema,
        init: () => ContextSchema.parse(initContext()),
        apply: (state, event) => foldContext(state, event),
    });
    // Only DSH's own committed header is published; a proposed decision never becomes an actual model.
    ctx.sessionProjections.register({
        key: "adaptiveRouter",
        stateVersion: 1,
        stateSchema: StatusSchema,
        init: () => ({ tick: 0, actual: null }),
        apply(state, event) {
            if (event.type === "request/header")
                return {
                    tick: event.seq,
                    actual: selectionOf(event.data.header.config),
                };
            if (event.type === "user/message" || event.type === "turn/end")
                return { ...state, tick: event.seq };
            return state;
        },
        wire: { viewSchema: StatusSchema, view: (state) => state },
    });
    ctx.on("agent/pre-step", (payload, next) => {
        if (payload.step === 1 && !isSubagent(payload.agent)) {
            const messages = payload.messages.filter((m) => m.source?.kind === "user");
            pending.set(payload.agent, {
                turn: payload.turn,
                text: messages.map(messageText).filter(Boolean).join("\n"),
                material: messages.some((m) => m.content.some((b) => b.type !== "text")),
                images: messages.some((m) => m.content.some((b) => b.type === "image" && !b.offloaded)),
            });
        }
        return next();
    });
    async function keyFor(s) {
        const credentials = ctx.get("credentials");
        if (!credentials)
            return process.env[s.apiKeyEnv] ?? "";
        try {
            return (await credentials.resolve(s.apiKeyEnv))?.value ?? "";
        }
        catch {
            return "";
        }
    }
    async function poolFor(current, s, images, signal) {
        const llm = ctx.llm;
        const providers = new Set(llm.listProviders().map((p) => p.id));
        const catalogs = new Map();
        async function available(route) {
            if (!providers.has(route.provider))
                return undefined;
            try {
                if (!catalogs.has(route.provider)) {
                    catalogs.set(route.provider, null); // A failed catalog is not retried per candidate.
                    catalogs.set(route.provider, new Set((await llm.listModels(route.provider)).map((m) => m.id)));
                }
                if (!catalogs.get(route.provider)?.has(route.model))
                    return undefined;
                return await llm.resolveModelInfo(route.provider, route.model, signal);
            }
            catch {
                return undefined;
            }
        }
        const currentInfo = await available(current);
        const pool = [];
        for (const candidate of s.candidates.filter((m) => m.enabled)) {
            if (pool.some((m) => sameModel(m, candidate)))
                continue;
            const info = await available(candidate);
            if (!info)
                continue;
            if (images &&
                !(info.inputModalities
                    ? info.inputModalities.includes("image")
                    : candidate.images === true))
                continue;
            // Preserve capacity on automatic switches. DSH does the exact admission check;
            // unknown or smaller capacity cannot safely be chosen for existing context.
            if (!sameModel(current, candidate) &&
                currentInfo?.context?.contextWindow &&
                (!info.context ||
                    info.context.contextWindow < currentInfo.context.contextWindow))
                continue;
            pool.push({
                ...candidate,
                efforts: (info.reasoning?.efforts ?? []).map((e) => String(e.id)),
                contextWindow: info.context?.contextWindow,
            });
        }
        if (currentInfo && !pool.some((m) => sameModel(m, current)))
            pool.push({
                ...current,
                tier: "complex",
                roles: ["general", "coding", "reasoning"],
                efforts: (currentInfo.reasoning?.efforts ?? []).map((e) => String(e.id)),
            });
        const currentUnavailable = !providers.has(current.provider) ||
            catalogs.get(current.provider)?.has(current.model) === false;
        return { pool, currentUnavailable, available };
    }
    ctx.on("agent/request", async (payload, next) => {
        const original = await next(); // Upstream errors stay upstream errors.
        const { agent, turn, step, signal } = payload;
        if (isSubagent(agent))
            return original;
        const current = selectionOf(original);
        const pass = (reason, control = "Fallback") => {
            save(agent, { turn, selection: null, reason, control });
            return original;
        };
        try {
            const s = settings();
            if (!s.enabled)
                return pass("disabled", "Native");
            if (s.mode === "MANUAL" || (s.lockModel && s.lockEffort))
                return pass("manual", "Manual");
            if (conflict())
                return pass("conflict: disable Jev Effort Selector or Adaptive Router", "Conflict");
            // Missing manual-intent seam: conservatively pass through instead of guessing.
            const manual = manualState(agent);
            if (!manual || !("pending" in manual))
                return pass("manual-intent-unavailable", "Native");
            if (manual.pending !== null)
                return pass("native-manual", "Manual");
            const prior = held.get(agent);
            if (prior?.turn === turn && prior.selection === null)
                return original;
            if (prior?.turn === turn && prior.configKey !== JSON.stringify(s))
                return pass("settings-changed", "Native");
            const text = pending.get(agent);
            const context = ctx.sessionProjections.stateOf(agent.session, "adaptiveRouterContext");
            const previous = context?.previous ?? null;
            // Read the actual projected surface so compaction/offloading is respected.
            const images = (text?.images ?? false) ||
                agent.session
                    .deriveMessages()
                    .some((m) => m.content.some((b) => b.type === "image" && !b.offloaded));
            const { pool, currentUnavailable, available } = await withinBudget(poolFor(current, s, images, signal), s.timeoutMs, signal);
            if (prior?.turn === turn && prior.selection) {
                const info = await withinBudget(available(prior.selection), s.timeoutMs, signal);
                if (!info ||
                    (prior.selection.reasoningEffort !== undefined &&
                        !info.reasoning?.efforts.some((e) => String(e.id) === prior.selection.reasoningEffort)))
                    return pass("held-route-unavailable");
                if (!canApply(agent, s, signal))
                    return pass("decision-superseded", "Native");
                return replace(original, prior.selection);
            }
            if (step !== 1 || !context || text?.turn !== turn || !text.text.trim())
                return pass("no-user-task", "Native");
            const local = localSimple(text.text, previous, text.material);
            const decision = local ??
                (await askJev(s, s.apiUrl.trim()
                    ? await withinBudget(keyFor(s), s.timeoutMs, signal)
                    : "", [
                    {
                        role: "system",
                        content: contextBlock(previous, context.earlier, undefined),
                    },
                    { role: "user", content: text.text },
                ], previous !== null, signal));
            // Settings/manual picks can change while the classifier is awaiting I/O.
            if (!canApply(agent, s, signal))
                return pass("decision-superseded", "Native");
            if ("failure" in decision) {
                // Never pin a classifier fallback as a successful task-level decision.
                if (currentUnavailable &&
                    !s.lockModel &&
                    ["FULL_AUTO", "MODEL_AUTO"].includes(s.mode)) {
                    const fallback = pool.find((m) => `${m.provider}/${m.model}` === s.fallback &&
                        s.candidates.some((c) => c.enabled && sameModel(c, m)));
                    if (fallback) {
                        const effort = s.mode === "MODEL_AUTO" || s.lockEffort
                            ? s.lockEffort
                                ? current.reasoningEffort
                                : s.fixedEffort || current.reasoningEffort
                            : effortFor(fallback, "moderate");
                        if (effort === undefined || fallback.efforts.includes(effort)) {
                            const selected = {
                                provider: fallback.provider,
                                model: fallback.model,
                                ...(effort === undefined ? {} : { reasoningEffort: effort }),
                            };
                            save(agent, {
                                turn,
                                selection: selected,
                                reason: decision.failure,
                                control: "Fallback",
                                configKey: JSON.stringify(s),
                            });
                            return replace(original, selected);
                        }
                    }
                }
                return pass(decision.failure);
            }
            const autoModel = !s.lockModel && ["FULL_AUTO", "MODEL_AUTO"].includes(s.mode);
            // The current route is always a valid fixed-model effort candidate, but cannot
            // be silently added to the authorized pool for automatic model selection.
            const authorized = autoModel
                ? pool.filter((m) => s.candidates.some((c) => c.enabled && sameModel(c, m)))
                : pool;
            const result = chooseRoute({
                current,
                pool: authorized,
                decision,
                config: s,
                previous,
            });
            const selected = result.selection;
            const info = await withinBudget(available(selected), s.timeoutMs, signal);
            if (!info ||
                (selected.reasoningEffort !== undefined &&
                    !info.reasoning?.efforts.some((e) => String(e.id) === selected.reasoningEffort)))
                return pass("validation-failed");
            if (!canApply(agent, s, signal))
                return pass("decision-superseded", "Native");
            const control = s.mode === "FULL_AUTO" ? "Auto" : s.mode;
            save(agent, {
                turn,
                selection: selected,
                reason: result.reason === "auto"
                    ? local
                        ? "local"
                        : "jev"
                    : result.reason,
                control,
                configKey: JSON.stringify(s),
            });
            return replace(original, selected);
        }
        catch {
            return pass("router-error");
        }
    }, { prepend: true });
    class RouterRemote {
        getSessionState(sessionId) {
            return {
                enabled: settings().enabled,
                conflict: conflict(),
                decision: records.get(String(sessionId)) ?? null,
            };
        }
    }
    Object.defineProperty(RouterRemote.prototype, "@deepseek-ai/dsh-typert-protocol/remote-methods", {
        value: {
            version: 1,
            methods: [
                { method: "getSessionState", invocation: { kind: "direct" } },
            ],
        },
    });
    const remote = new RouterRemote();
    Object.assign(remote, {
        typertRemote: {
            service: remote,
            serviceKey: "adaptiveRouter",
            namespace: "adaptiveRouter",
        },
    });
    ctx.provide("adaptiveRouter", remote);
    ctx.on("agent/disposed", ({ agent }) => {
        held.delete(agent);
        pending.delete(agent);
        records.delete(String(agent.session.id));
    });
    ctx.effect(() => () => records.clear());
}
