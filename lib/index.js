import { renderPrompt, renderContextSnapshot } from "@deepseek-ai/dsh-system-prompt";
import { z } from "zod";
import { Config, readConfig } from "./config.js";
import { askJev, localSimple } from "./classifier.js";
import { chooseRoute, effortFor, sameModel, } from "./router.js";
import { ContextSchema, initContext, foldContext, contextBlock, messageText, } from "./context.js";
export { Config };
export const name = "adaptive-router";
export const inject = ["sessionProjections", "llm", "systemPrompt"];
const SelectionSchema = z.object({
    provider: z.string(),
    model: z.string(),
    reasoningEffort: z.string().optional(),
});
const StatusSchema = z.object({
    tick: z.number(),
    actual: SelectionSchema.nullable(),
});
class ContextCapacityError extends Error {
}
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
    let registryRevision = 0;
    let prependRevision = 0, captureRevision = -1;
    let seatingCapture = false;
    let stopCapture;
    let assemblyReliable = true;
    function seatCapture() {
        if (captureRevision === prependRevision)
            return;
        seatingCapture = true;
        try {
            stopCapture?.();
            stopCapture = ctx.on("agent/pre-step", captureStep, { prepend: true });
            captureRevision = prependRevision;
        }
        finally {
            seatingCapture = false;
        }
    }
    ctx.on("llm/adapters-updated", () => { registryRevision++; });
    ctx.on("system-prompt/assemble", async (assembly, context, next) => {
        const resolved = await next();
        const agent = context.agent;
        if (agent && !isSubagent(agent)) {
            const previous = pending.get(agent);
            try {
                // Complete sections may be restored by DSH after this waterfall returns.
                const promptBytes = Math.max(Buffer.byteLength(renderPrompt(resolved), "utf8"), Buffer.byteLength(renderPrompt({ ...resolved, sections: assembly.sections }), "utf8"));
                pending.set(agent, { turn: -1, text: "", material: false, images: false,
                    ...previous, assembly: resolved, promptBytes });
            }
            catch {
                // An unpriceable assembly must not break an otherwise valid DSH request.
                pending.set(agent, { turn: -1, text: "", material: false, images: false,
                    ...previous, assembly: undefined, promptBytes: undefined });
            }
        }
        return resolved;
    }, { prepend: true });
    // These are documented Cordis notifications. Its runtime passes EventOptions
    // although the current declaration still names this argument a boolean.
    ctx.on("internal/listener", (event, _listener, rawOptions) => {
        const options = rawOptions;
        const prepend = options === true || (typeof options === "object" && options !== null
            && "prepend" in options && options.prepend === true);
        if (!prepend || seatingCapture)
            return;
        if (event === "agent/pre-step")
            prependRevision++;
        if (event === "system-prompt/assemble")
            assemblyReliable = false;
    });
    ctx.on("internal/dispatch", (_mode, event) => {
        // Cordis takes its listener snapshot AFTER this synchronous notification.
        if (event === "agent/pre-step")
            seatCapture();
    });
    function manualState(agent) {
        // SessionController owns this optional projection, not this plugin.
        const projections = ctx.sessionProjections;
        return projections.stateOf(agent.session, "modelSelection");
    }
    function canApply(agent, snapshot, signal, revision = registryRevision) {
        const live = settings();
        return (!signal.aborted &&
            revision === registryRevision &&
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
    async function captureStep(payload, next) {
        const boundaryRevision = captureRevision;
        const decision = await next();
        if (decision.kind !== "reject" && !isSubagent(payload.agent)) {
            const messages = decision.messages.filter((m) => m.source?.kind === "user");
            pending.set(payload.agent, {
                ...pending.get(payload.agent),
                messages: decision.messages,
                batchRevision: boundaryRevision,
                turn: payload.turn,
                text: payload.step === 1 ? messages.map(messageText).filter(Boolean).join("\n")
                    : pending.get(payload.agent)?.text ?? "",
                material: messages.some((m) => m.content.some((b) => b.type !== "text")),
                images: messages.some((m) => m.content.some((b) => b.type === "image" && !b.offloaded)),
            });
        }
        return decision;
    }
    seatCapture();
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
    function contextBytes(agent, signal) {
        const input = pending.get(agent);
        if (!assemblyReliable || !input?.assembly || !input.messages || input.promptBytes === undefined
            || input.batchRevision !== prependRevision)
            return undefined;
        const history = agent.session.deriveMessages();
        // Attachments and deferred tools need adapter-owned pricing: do not guess.
        if ([...history, ...input.messages].some(message => message.content.some(block => !["text", "reasoning", "tool-call"].includes(block.type))) || input.assembly.tools.some(tool => tool.deferLoading))
            return undefined;
        try {
            const refreshed = ctx.systemPrompt.refreshContext(input.assembly, { agent, scope: agent, signal });
            // UTF-8 bytes deliberately overcount typical text tokens. Include all offered
            // inputs, history, system/runtime text and tool schemas; no chars/4 shortcut.
            return Buffer.byteLength(JSON.stringify([...history, ...input.messages]), "utf8")
                + input.promptBytes + Buffer.byteLength(renderContextSnapshot(refreshed), "utf8")
                + Buffer.byteLength(JSON.stringify(input.assembly.tools), "utf8");
        }
        catch {
            return undefined;
        }
    }
    function fitsContext(agent, original, info, currentInfo, signal, reuse = false) {
        if (!reuse && sameModel(original, { provider: info.provider, model: info.id }))
            return true;
        const window = info.context?.contextWindow;
        if (!window)
            return false;
        const bytes = contextBytes(agent, signal);
        if (bytes === undefined)
            return !reuse && !!currentInfo?.context && window >= currentInfo.context.contextWindow;
        const output = original.maxTokens ?? info.defaultMaxTokens ?? Math.floor(window / 2);
        // Leave framing slack plus the configured/native output cap, or half the
        // window when the provider has not declared its output default.
        return bytes + output + 2048 <= window;
    }
    async function validateHeld(selected, signal) {
        if (!ctx.llm.listProviders().some(provider => provider.id === selected.provider))
            return undefined;
        if (!(await ctx.llm.listModels(selected.provider)).some(model => model.id === selected.model))
            return undefined;
        const info = await ctx.llm.resolveModelInfo(selected.provider, selected.model, signal);
        return selected.reasoningEffort === undefined || info.reasoning?.efforts.some(effort => String(effort.id) === selected.reasoningEffort) ? info : undefined;
    }
    async function poolFor(current, agent, s, images, signal) {
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
            if (!fitsContext(agent, current, info, currentInfo, signal))
                continue;
            pool.push({
                ...candidate,
                efforts: (info.reasoning?.efforts ?? []).map((e) => String(e.id)),
                contextWindow: info.context?.contextWindow,
                modelInfo: info,
            });
        }
        if (currentInfo && !pool.some((m) => sameModel(m, current)))
            pool.push({
                ...current,
                tier: "complex",
                modelInfo: currentInfo,
                roles: ["general", "coding", "reasoning"],
                efforts: (currentInfo.reasoning?.efforts ?? []).map((e) => String(e.id)),
            });
        const currentUnavailable = !providers.has(current.provider) ||
            catalogs.get(current.provider)?.has(current.model) === false;
        return { pool, currentInfo, currentUnavailable, available };
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
            const inspectedRevision = registryRevision;
            const prior = held.get(agent);
            if (prior?.turn === turn && prior.selection === null)
                return original;
            if (prior?.turn === turn && prior.configKey !== JSON.stringify(s))
                return pass("settings-changed", "Native");
            if (prior?.turn === turn && prior.selection) {
                // An explicit capacity stop must remain a stop on a retry: original
                // may already be the small model recorded in DSH's persisted header.
                if (prior.capacityBlocked)
                    throw new ContextCapacityError(prior.capacityBlocked);
                let info = prior.modelInfo;
                if (prior.registryRevision !== inspectedRevision) {
                    info = await withinBudget(validateHeld(prior.selection, signal), s.timeoutMs, signal);
                    if (!info)
                        return pass("held-route-unavailable");
                }
                if (!canApply(agent, s, signal, inspectedRevision))
                    return pass("decision-superseded", "Native");
                const fits = info && fitsContext(agent, original, info, undefined, signal, true);
                if (!canApply(agent, s, signal, inspectedRevision))
                    return pass("decision-superseded", "Native");
                if (!fits) {
                    const message = `Adaptive Router stopped this turn: the latest context exceeds or cannot safely be priced within the cached ${prior.selection.provider}/${prior.selection.model} window (${info?.context?.contextWindow ?? "unknown"}). Select a larger-context model or compact the conversation before continuing.`;
                    save(agent, { ...prior, reason: "context-capacity-blocked", control: "Blocked", capacityBlocked: message });
                    throw new ContextCapacityError(message);
                }
                if (!canApply(agent, s, signal, inspectedRevision))
                    return pass("decision-superseded", "Native");
                save(agent, { ...prior, modelInfo: info, registryRevision: inspectedRevision });
                return replace(original, prior.selection);
            }
            const text = pending.get(agent);
            const context = ctx.sessionProjections.stateOf(agent.session, "adaptiveRouterContext");
            const previous = context?.previous ?? null;
            if (step !== 1 || !context || text?.turn !== turn || !text.text.trim())
                return pass("no-user-task", "Native");
            // Read the actual projected surface so compaction/offloading is respected.
            const images = (text?.images ?? false) ||
                agent.session
                    .deriveMessages()
                    .some((m) => m.content.some((b) => b.type === "image" && !b.offloaded));
            const { pool, currentInfo, currentUnavailable, available } = await withinBudget(poolFor(original, agent, s, images, signal), s.timeoutMs, signal);
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
            if (!canApply(agent, s, signal, inspectedRevision))
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
                                registryRevision: inspectedRevision,
                                modelInfo: fallback.modelInfo,
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
            if (!fitsContext(agent, original, info, currentInfo, signal))
                return pass("context-too-large");
            if (!canApply(agent, s, signal, inspectedRevision))
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
                registryRevision: inspectedRevision,
                modelInfo: info,
            });
            return replace(original, selected);
        }
        catch (error) {
            // Known unsafe cached input is an intentional, visible stop, not a
            // router malfunction that should silently pass the persisted route.
            if (error instanceof ContextCapacityError)
                throw error;
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
