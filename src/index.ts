import type { Context } from "@deepseek-ai/cordis";
import type { Agent, PreStepDecision } from "@deepseek-ai/dsh-agent";
import { createSystemMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-compaction";
import type { TokenMeter } from "@deepseek-ai/dsh-token-meter";
import type { LlmCallConfig, LlmResolvedModelInfo, UserMessage } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-session-projection";
import { renderPrompt, renderContextSnapshot, type PromptAssembly } from "@deepseek-ai/dsh-system-prompt";
import { z } from "zod";
import { mountLab } from "./lab-host.js";
import { Config, readConfig, routingKey, type ConfigValues } from "./config.js";
import { engineFor, validEndpoint } from "./diagnostics.js";
import { askJev, localSimple } from "./classifier.js";
import {
  chooseRoute,
  effortFor,
  sameModel,
  type Candidate,
  type Selection,
} from "./router.js";
import {
  ContextSchema,
  initContext,
  foldContext,
  contextBlock,
  messageText,
} from "./context.js";
export { Config };
export const name = "adaptive-router";
export const inject = ["sessionProjections", "llm", "systemPrompt"];
type ContextState = z.infer<typeof ContextSchema>;
const SelectionSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string().optional(),
});
const StatusSchema = z.object({
  tick: z.number(),
  actual: SelectionSchema.nullable(),
});
type Status = z.infer<typeof StatusSchema>;
declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionStateMap {
    adaptiveRouterContext: ContextState;
    adaptiveRouter: Status;
  }
  interface SessionProjectionMap {
    adaptiveRouter: Status;
  }
}
interface RecordState {
  turn: number;
  selection: Selection | null;
  reason: string;
  control: string;
  configKey?: string;
  registryRevision?: number;
  modelInfo?: LlmResolvedModelInfo;
  capacitySurface?: number;
  capacityControl?: string;
  capacityReason?: string;
  mode?: ConfigValues['mode'];
  source?: string;
  tier?: string;
  role?: string;
  relation?: string;
  confidence?: number;
  elapsedMs?: number;
  at?: number;
  actual?: Selection | null;
  fallbackApplied?: boolean;
  committed?: boolean;
}
class ContextCapacityError extends Error { override name = "ContextCapacityError"; }
const isSubagent = (agent: Agent) => agent.session.header.origin === "subagent";
const selectionOf = (config: LlmCallConfig): Selection => ({
  provider: config.provider,
  model: config.model,
  ...(config.reasoningEffort === undefined
    ? {}
    : { reasoningEffort: String(config.reasoningEffort) }),
});
function replace(config: LlmCallConfig, selected: Selection): LlmCallConfig {
  const { reasoningEffort: _old, ...rest } = config;
  return {
    ...rest,
    provider: selected.provider,
    model: selected.model,
    ...(selected.reasoningEffort === undefined
      ? {}
      : {
          reasoningEffort:
            selected.reasoningEffort as LlmCallConfig["reasoningEffort"],
        }),
  };
}
// Catalog listing has no AbortSignal argument in DSH. Bound our wait anyway;
// a late result stays local to poolFor and cannot alter any request or state.
async function withinBudget<T>(
  operation: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
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
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
export function apply(ctx: Context, config: object) {
  let disposed = false;
  let nativeRecovery: {auto:()=>boolean;run:(agent:Agent,signal:AbortSignal)=>Promise<unknown>}|undefined;
  // Optional public service seam. Calling the native backend must retain its
  // declared Cordis dependencies, not borrow the router's narrower injection.
  ctx.inject(["compaction","tokenMeter","sessions","llm"],child=>{
    const native=child.get("compaction") as unknown as {config?:{auto?:boolean};compactIfNeeded(agent:Agent,trigger:"context-overflow",signal:AbortSignal):Promise<unknown>};
    const bridge={auto:()=>native.config?.auto===true,run:(agent:Agent,signal:AbortSignal)=>native.compactIfNeeded(agent,"context-overflow",signal)};
    nativeRecovery=bridge;
    child.effect(()=>()=>{if(nativeRecovery===bridge)nativeRecovery=undefined;});
  });
  const held = new WeakMap<Agent, RecordState>();
  const steps = new WeakMap<Agent["session"], {turn:number;step:number;compactionAttempted:boolean;recoveryAttempted:boolean}>();
  const pending = new WeakMap<
    Agent,
    { turn: number; text: string; material: boolean; images: boolean;
      step?: number; admitted?: boolean; nativePromptTokens?: number; messages?: UserMessage[];
      assembly?: PromptAssembly; promptBytes?: number; batchRevision?: number; assemblyRevision?: number }
  >();
  const records = new Map<string, RecordState>();
  type Trace = ReturnType<typeof publicRecord>;
  const history = new Map<string, Trace[]>();
  let verification: { configKey: string; at: number; elapsedMs: number; ok: boolean; failure?: string } | undefined;
  let credentialRevision = 0;
  const credentialsChanged = () => { credentialRevision++; verification = undefined; };
  // Optional credentials service events, declared in dsh-credentials/src/types.ts.
  const onCredentialChange = ctx.on.bind(ctx) as (event: string, listener: () => void) => unknown;
  onCredentialChange("credentials/record-updated", credentialsChanged);
  onCredentialChange("credentials/reference-updated", credentialsChanged);
  function publicRecord(record: RecordState) {
    const overridden = record.committed && record.selection && record.actual
      && (!sameModel(record.selection, record.actual) || record.selection.reasoningEffort !== record.actual.reasoningEffort)
      && !["Blocked", "Conflict"].includes(record.control);
    return { turn: record.turn, at: record.at, mode: record.mode, source: record.source,
      tier: record.tier, role: record.role, relation: record.relation, confidence: record.confidence, elapsedMs: record.elapsedMs,
      selection: record.selection, actual: record.actual ?? null, reason: overridden ? "native-override" : record.reason,
      control: overridden ? "Native" : record.control, fallbackApplied: record.fallbackApplied ?? false };
  }
  const settings = () => readConfig(config);
  let registryRevision = 0;
  let prependRevision = 0, captureRevision = -1;
  let seatingCapture = false;
  let stopCapture: (() => unknown) | undefined;
  let assemblyRevision = 0, captureAssemblyRevision = -1;
  let seatingAssembly = false;
  let stopAssemblyCapture: (() => unknown) | undefined;
  function seatCapture() {
    if (captureRevision === prependRevision) return;
    seatingCapture = true;
    try {
      stopCapture?.();
      stopCapture = ctx.on("agent/pre-step", captureStep, { prepend: true });
      captureRevision = prependRevision;
    } finally { seatingCapture = false; }
  }
  ctx.on("llm/adapters-updated", () => { registryRevision++; });
  const captureAssembly = async (assembly: PromptAssembly, context: { agent?: Agent }, next: () => Promise<PromptAssembly>) => {
    const boundaryRevision = captureAssemblyRevision;
    const resolved = await next();
    const agent = context.agent;
    if (agent && !isSubagent(agent)) {
      const previous = pending.get(agent);
      try {
        // Complete sections may be restored by DSH after this waterfall returns.
        const promptBytes = Math.max(
          Buffer.byteLength(renderPrompt(resolved), "utf8"),
          Buffer.byteLength(renderPrompt({ ...resolved, sections: assembly.sections }), "utf8"),
        );
        let nativePromptTokens: number | undefined;
        try { const meter=ctx.get("tokenMeter") as TokenMeter|undefined;
          if(meter)nativePromptTokens=Math.max(meter.estimateMessage(createSystemMessage(renderPrompt(resolved))),meter.estimateMessage(createSystemMessage(renderPrompt({...resolved,sections:assembly.sections}))));
        } catch { /* Native estimation failure is distinct from a full window. */ }
        pending.set(agent, { turn: -1, text: "", material: false, images: false,
          ...previous, assembly: resolved, promptBytes, nativePromptTokens, assemblyRevision: boundaryRevision });
      } catch {
        // An unpriceable assembly must not break an otherwise valid DSH request.
        pending.set(agent, { turn: -1, text: "", material: false, images: false,
          ...previous, assembly: undefined, promptBytes: undefined });
      }
    }
    return resolved;
  };
  function seatAssembly() {
    if (captureAssemblyRevision === assemblyRevision) return;
    seatingAssembly = true;
    try {
      stopAssemblyCapture?.();
      stopAssemblyCapture = ctx.on("system-prompt/assemble", captureAssembly, { prepend: true });
      captureAssemblyRevision = assemblyRevision;
    } finally { seatingAssembly = false; }
  }
  seatAssembly();
  // These are documented Cordis notifications. Its runtime passes EventOptions
  // although the current declaration still names this argument a boolean.
  ctx.on("internal/listener", (event, _listener, rawOptions) => {
    const options: unknown = rawOptions;
    const prepend = options === true || (typeof options === "object" && options !== null
      && "prepend" in options && options.prepend === true);
    if (!prepend) return;
    if (event === "agent/pre-step" && !seatingCapture) prependRevision++;
    if (event === "system-prompt/assemble" && !seatingAssembly) assemblyRevision++;
  });
  ctx.on("internal/dispatch", (_mode, event) => {
    // Cordis takes its listener snapshot AFTER this synchronous notification.
    if (event === "agent/pre-step") seatCapture();
    // The same documented snapshot boundary lets us observe the final native
    // working-directory/session-reference transforms, even when mounted later.
    if (event === "system-prompt/assemble") seatAssembly();
  });
  function manualState(agent: Agent): { pending: unknown } | undefined {
    // SessionController owns this optional projection, not this plugin.
    const projections = ctx.sessionProjections as {
      stateOf(session: Agent["session"], key: string): unknown;
    };
    return projections.stateOf(agent.session, "modelSelection") as
      | { pending: unknown }
      | undefined;
  }
  function canApply(agent: Agent, snapshot: ConfigValues, signal: AbortSignal, revision = registryRevision) {
    if (disposed) return false;
    const live = settings();
    return (
      !signal.aborted &&
      revision === registryRevision &&
      live.enabled &&
      routingKey(live) === routingKey(snapshot) &&
      !conflict() &&
      manualState(agent)?.pending === null
    );
  }
  function conflict(): boolean {
    // Public Cordis registry + published service. Detection is rechecked each request,
    // including a conflicting plugin added later. No dependence on listener order.
    if (ctx.get("jevEffortSelector") !== undefined) return true;
    return [...ctx.registry.values()].some(
      (runtime) =>
        runtime.name === "jev-effort-selector" && runtime.fibers.length > 0,
    );
  }
  function save(agent: Agent, record: RecordState) {
    if (disposed) return;
    const id = String(agent.session.id);
    const previous = records.get(id);
    record = { at: previous?.turn === record.turn ? previous.at : Date.now(), mode: settings().mode,
      committed: previous?.turn === record.turn ? previous.committed : false,
      ...record, actual: record.actual ?? ctx.sessionProjections.stateOf(agent.session, "adaptiveRouter")?.actual ?? null };
    held.set(agent, record);
    records.set(id, record);
    const entries = history.get(id) ?? [];
    if (entries.at(-1)?.turn === record.turn) entries[entries.length - 1] = publicRecord(record);
    else entries.push(publicRecord(record));
    history.set(id, entries.slice(-20));
  }
  ctx.on("agent/request-error", async ({agent},next)=>{
    const input=pending.get(agent);if(input)input.admitted=true;
    return next();
  }, {prepend:true});
  ctx.on("session/event", (session, event) => {
    if(event.type==="compaction/start"){const step=steps.get(session);if(step&&event.data.turn===step.turn)step.compactionAttempted=true;}
    if(event.type==="compaction/prune"){const step=steps.get(session);if(step)step.compactionAttempted=true;}
    if(event.type==="turn/end")steps.delete(session);
    if (event.type !== "request/header" || session.header.origin === "subagent") return;
    const id = String(session.id), record = records.get(id);
    if (!record) return;
    record.actual = selectionOf(event.data.header.config);
    record.committed = true;
    const matches = record.selection && sameModel(record.selection, record.actual)
      && record.selection.reasoningEffort === record.actual.reasoningEffort;
    record.fallbackApplied = record.control === "Fallback" && !!matches;
    const entries = history.get(id);
    if (entries?.length) entries[entries.length - 1] = publicRecord(record);
  });
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
  async function captureStep(payload: { agent: Agent; turn: number; step: number;
    messages: UserMessage[]; signal: AbortSignal }, next: () => Promise<PreStepDecision>) {
    const boundaryRevision = captureRevision;
    if(!isSubagent(payload.agent))steps.set(payload.agent.session,{turn:payload.turn,step:payload.step,compactionAttempted:false,recoveryAttempted:false});
    const decision = await next();
    if (decision.kind !== "reject" && !isSubagent(payload.agent)) {
      const messages = decision.messages.filter(
        (m) => m.source?.kind === "user",
      );
      pending.set(payload.agent, {
        ...pending.get(payload.agent),
        step:payload.step, admitted:false,
        messages: decision.messages,
        batchRevision: boundaryRevision,
        turn: payload.turn,
        text: payload.step === 1 ? messages.map(messageText).filter(Boolean).join("\n")
          : pending.get(payload.agent)?.text ?? "",
        material: messages.some((m) =>
          m.content.some((b) => b.type !== "text"),
        ),
        images: messages.some((m) =>
          m.content.some((b) => b.type === "image" && !b.offloaded),
        ),
      });
    }
    return decision;
  }
  seatCapture();
  async function keyFor(s: ConfigValues): Promise<string> {
    const credentials = ctx.get("credentials") as
      | { resolve(name: string): Promise<{ value: string } | undefined> }
      | undefined;
    if (!credentials) return process.env[s.apiKeyEnv] ?? "";
    try {
      return (await credentials.resolve(s.apiKeyEnv))?.value ?? "";
    } catch {
      return "";
    }
  }
  function contextBytes(agent: Agent, signal: AbortSignal): number | undefined {
    const input = pending.get(agent);
    if (input?.assemblyRevision !== assemblyRevision || !input?.assembly || !input.messages || input.promptBytes === undefined
      || input.batchRevision !== prependRevision) return undefined;
    const history = agent.session.deriveMessages();
    const offered = input.admitted ? [] : input.messages;
    // Attachments and deferred tools need adapter-owned pricing: do not guess.
    if ([...history, ...offered].some(message => message.content.some(
      block => !["text", "reasoning", "tool-call"].includes(block.type),
    )) || input.assembly.tools.some(tool => tool.deferLoading)) return undefined;
    try {
      const refreshed = ctx.systemPrompt.refreshContext(input.assembly, { agent, scope: agent, signal });
      // UTF-8 bytes deliberately overcount typical text tokens. Include all offered
      // inputs, history, system/runtime text and tool schemas; no chars/4 shortcut.
      return Buffer.byteLength(JSON.stringify([...history, ...offered]), "utf8")
        + input.promptBytes + Buffer.byteLength(renderContextSnapshot(refreshed), "utf8")
        + Buffer.byteLength(JSON.stringify(input.assembly.tools), "utf8");
    } catch { return undefined; }
  }
  type Capacity = "fits" | "over-limit" | "estimate-unavailable" | "metadata-unavailable";
  function capacity(agent:Agent,original:LlmCallConfig,info:LlmResolvedModelInfo|undefined,signal:AbortSignal):Capacity {
    const window=info?.context?.contextWindow;
    if(!window||!Number.isFinite(window)||window<=0)return "metadata-unavailable";
    const bytes=contextBytes(agent,signal);
    if(bytes===undefined)return "estimate-unavailable";
    const meter=ctx.get("tokenMeter") as TokenMeter|undefined;
    if(meter){
      try {
        const input=pending.get(agent)!;
        if(input.nativePromptTokens===undefined||!Number.isFinite(input.nativePromptTokens))return "estimate-unavailable";
        const measured=meter.measure(agent.session,{config:{...original,provider:info!.provider,model:info!.id},tools:input.assembly!.tools});
        const refreshed=ctx.systemPrompt.refreshContext(input.assembly!,{agent,scope:agent,signal});
        const context=renderContextSnapshot(refreshed);
        const offered=input.admitted?[]:input.messages!.filter(message=>String(message.source.kind)!=="runtime-context");
        const additions=[input.nativePromptTokens,...offered.map(message=>meter.estimateMessage(message)),meter.estimateMessage(createUserMessage({source:{kind:"user"},content:[{type:"text",text:context}]}))];
        if(!Number.isFinite(measured.totalTokens)||measured.totalTokens<0||additions.some(n=>!Number.isFinite(n)||n<0))return "estimate-unavailable";
        // Match native completion reservation: no declared cap is not half a window.
        // The native meter is an estimate, not a tokenizer or provider admission proof.
        const output=original.maxTokens??info!.defaultMaxTokens??0;
        return measured.totalTokens+additions.reduce((sum,n)=>sum+n,0)+output+2048<=window?"fits":"over-limit";
      }catch{return "estimate-unavailable";}
    }
    // Optional native service absent: retain the existing conservative byte bound.
    const output=original.maxTokens??info!.defaultMaxTokens??Math.floor(window/2);
    return bytes+output+2048<=window?"fits":"over-limit";
  }
  function fitsContext(agent: Agent, original: LlmCallConfig, info: LlmResolvedModelInfo,
    currentInfo: LlmResolvedModelInfo | undefined, signal: AbortSignal, reuse = false): boolean {
    if (!reuse && sameModel(original, { provider: info.provider, model: info.id })) return true;
    const result=capacity(agent,original,info,signal);
    if(result==="fits")return true;
    return result==="estimate-unavailable"&&!reuse&&!!currentInfo?.context&&!!info.context&&info.context.contextWindow>=currentInfo.context.contextWindow;
  }
  async function recoverCapacity(agent:Agent,original:LlmCallConfig,selected:Selection,info:LlmResolvedModelInfo|undefined,signal:AbortSignal,s:ConfigValues){
    let fit=capacity(agent,original,info,signal);
    const frame=steps.get(agent.session);
    const native=nativeRecovery;
    const actual=agent.session.requestHeader()?.config;
    // Public native force policy, not a synthetic Provider failure or Session Header.
    // Never compact toward an uncommitted new route or retry a pressure attempt.
    if(fit!=="over-limit"||!frame||frame.compactionAttempted||frame.recoveryAttempted||!native?.auto()
      ||!ctx.get("tokenMeter")||!actual||!sameModel(actual,selected))return{fit,info};
    frame.recoveryAttempted=true;
    try {if(s.labEnabled)(ctx.get("adaptiveRouterLab") as {lab:{capacityRecovery(id:string,turn:number):void}}|undefined)?.lab.capacityRecovery(String(agent.session.id),frame.turn);}catch{/* Telemetry cannot change recovery. */}
    try {await native.run(agent,signal);}catch{/* Partial native progress is still remeasured; cancellation is checked by the caller. */}
    try {info=await withinBudget(ctx.llm.resolveModelInfo(selected.provider,selected.model,signal),s.timeoutMs,signal);}catch{info=undefined;}
    fit=capacity(agent,original,info,signal);
    return{fit,info};
  }
  async function validateHeld(selected: Selection, signal: AbortSignal) {
    if (!ctx.llm.listProviders().some(provider => provider.id === selected.provider)) return undefined;
    if (!(await ctx.llm.listModels(selected.provider)).some(model => model.id === selected.model)) return undefined;
    const info = await ctx.llm.resolveModelInfo(selected.provider, selected.model, signal);
    return selected.reasoningEffort === undefined || info.reasoning?.efforts.some(
      effort => String(effort.id) === selected.reasoningEffort,
    ) ? info : undefined;
  }
  async function poolFor(
    current: LlmCallConfig,
    agent: Agent,
    s: ConfigValues,
    images: boolean,
    signal: AbortSignal,
  ) {
    const llm = ctx.llm;
    const providers = new Set(llm.listProviders().map((p) => p.id));
    const catalogs = new Map<string, Set<string> | null>();
    async function available(
      route: Selection,
    ): Promise<LlmResolvedModelInfo | undefined> {
      if (!providers.has(route.provider)) return undefined;
      try {
        if (!catalogs.has(route.provider)) {
          catalogs.set(route.provider, null); // A failed catalog is not retried per candidate.
          catalogs.set(
            route.provider,
            new Set((await llm.listModels(route.provider)).map((m) => m.id)),
          );
        }
        if (!catalogs.get(route.provider)?.has(route.model)) return undefined;
        return await llm.resolveModelInfo(route.provider, route.model, signal);
      } catch {
        return undefined;
      }
    }
    const currentInfo = await available(current);
    const pool: (Candidate & { modelInfo: LlmResolvedModelInfo })[] = [];
    for (const candidate of s.candidates.filter((m) => m.enabled)) {
      if (pool.some((m) => sameModel(m, candidate))) continue;
      const info = await available(candidate);
      if (!info) continue;
      if (
        images &&
        !(info.inputModalities
          ? info.inputModalities.includes("image")
          : candidate.images === true)
      )
        continue;
      if (!fitsContext(agent, current, info, currentInfo, signal)) continue;
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
        efforts: (currentInfo.reasoning?.efforts ?? []).map((e) =>
          String(e.id),
        ),
      });
    const currentUnavailable =
      !providers.has(current.provider) ||
      catalogs.get(current.provider)?.has(current.model) === false;
    return { pool, currentInfo, currentUnavailable, available };
  }
  ctx.on(
    "agent/request",
    async (payload, next) => {
      const original = await next(); // Upstream errors stay upstream errors.
      const { agent, turn, step, signal } = payload;
      if (isSubagent(agent)) return original;
      const current = selectionOf(original);
      let diagnostic: Partial<RecordState> = { mode: settings().mode };
      const pass = (reason: string, control = "Bypass") => {
        save(agent, { ...diagnostic, turn, selection: null, reason, control });
        return original;
      };
      try {
        const s = settings();
        if (!s.enabled) return pass("disabled", "Native");
        if (s.mode === "MANUAL" || (s.lockModel && s.lockEffort))
          return pass("manual", "Manual");
        if (conflict())
          return pass(
            "conflict",
            "Conflict",
          );
        // Missing manual-intent seam: conservatively pass through instead of guessing.
        const manual = manualState(agent);
        if (!manual || !("pending" in manual))
          return pass("manual-intent-unavailable", "Native");
        if (manual.pending !== null) return pass("native-manual", "Manual");
        const inspectedRevision = registryRevision;
        const prior = held.get(agent);
        if (prior?.turn === turn && prior.selection === null) return original;
        if (prior?.turn === turn && prior.configKey !== routingKey(s))
          return pass("settings-changed", "Native");
        if (prior?.turn === turn && prior.selection) {
          // Never permanently latch a capacity error: native compaction may have
          // durably replaced the surface between attempts in this same step.
          let info = prior.modelInfo;
          if (prior.registryRevision !== inspectedRevision) {
            info = await withinBudget(validateHeld(prior.selection, signal), s.timeoutMs, signal);
            if (!info) return pass("held-route-unavailable");
          }
          if(prior.registryRevision===inspectedRevision&&prior.capacitySurface!==agent.session.surface.replaceGeneration){
            try {info=await withinBudget(ctx.llm.resolveModelInfo(prior.selection.provider,prior.selection.model,signal),s.timeoutMs,signal);}catch{info=undefined;}
          }
          if (!canApply(agent, s, signal, inspectedRevision)) return pass("decision-superseded", "Native");
          const recovered=await recoverCapacity(agent,original,prior.selection,info,signal,s);
          const fit=recovered.fit;info=recovered.info;
          if (!canApply(agent, s, signal, inspectedRevision)) return pass("decision-superseded", "Native");
          if (fit!=="fits") {
            const reason=fit==="metadata-unavailable"?"context-capacity-unknown":fit==="estimate-unavailable"?"context-estimate-unavailable":"context-capacity-blocked";
            const detail=fit==="metadata-unavailable"?"model context capacity is unavailable":fit==="estimate-unavailable"?"context estimation is unavailable":"estimated input plus reserved output exceeds the model capacity";
            const message = `Adaptive Router stopped this turn: ${detail} for cached ${prior.selection.provider}/${prior.selection.model} (${info?.context?.contextWindow ?? "unknown"}). Native compaction could not make this request safely admissible; select a larger-context model or use native /compact before continuing.`;
            save(agent, { ...prior, reason, control: "Blocked", capacityControl:prior.capacityControl??prior.control, capacityReason:prior.capacityReason??prior.reason });
            throw new ContextCapacityError(message);
          }
          if (!canApply(agent, s, signal, inspectedRevision)) return pass("decision-superseded", "Native");
          save(agent, { ...prior, modelInfo: info, registryRevision: inspectedRevision, capacitySurface:agent.session.surface.replaceGeneration, control:prior.capacityControl??prior.control, reason:prior.capacityReason??prior.reason, capacityControl:undefined, capacityReason:undefined });
          return replace(original, prior.selection);
        }
        const text = pending.get(agent);
        const context = ctx.sessionProjections.stateOf(
          agent.session,
          "adaptiveRouterContext",
        );
        const previous = context?.previous ?? null;
        if (step !== 1 || !context || text?.turn !== turn || !text.text.trim())
          return pass("no-user-task", "Native");
        // Read the actual projected surface so compaction/offloading is respected.
        const images =
          (text?.images ?? false) ||
          agent.session
            .deriveMessages()
            .some((m) =>
              m.content.some((b) => b.type === "image" && !b.offloaded),
            );
        const { pool, currentInfo, currentUnavailable, available } = await withinBudget(
          poolFor(original, agent, s, images, signal),
          s.timeoutMs,
          signal,
        );
        const local = localSimple(text.text, previous, text.material);
        const started = Date.now(), classifiedCredentialRevision = credentialRevision;
        const decision =
          local ??
          (await askJev(
            s,
            s.apiUrl.trim()
              ? await withinBudget(keyFor(s), s.timeoutMs, signal)
              : "",
            [
              {
                role: "system",
                content: contextBlock(previous, context.earlier, undefined),
              },
              { role: "user", content: text.text },
            ],
            previous !== null,
            signal,
          ));
        const elapsedMs = Date.now() - started;
        diagnostic = { mode: s.mode, source: local ? "Local" : engineFor(s), elapsedMs,
          ...("failure" in decision ? {} : { tier: decision.tier, role: decision.role, relation: decision.relation, confidence: "confidenceKnown" in decision && decision.confidenceKnown === false ? undefined : decision.confidence }) };
        if (!disposed && !local && classifiedCredentialRevision === credentialRevision && routingKey(settings()) === routingKey(s) && !signal.aborted)
          verification = { configKey: routingKey(s), at: Date.now(), elapsedMs, ok: !("failure" in decision),
            ...("failure" in decision ? { failure: decision.failure } : {}) };
        // Settings/manual picks can change while the classifier is awaiting I/O.
        if (!canApply(agent, s, signal, inspectedRevision))
          return pass("decision-superseded", "Native");
        if ("failure" in decision) {
          // Never pin a classifier fallback as a successful task-level decision.
          if (
            currentUnavailable &&
            !s.lockModel &&
            ["FULL_AUTO", "MODEL_AUTO"].includes(s.mode)
          ) {
            const fallback = pool.find(
              (m) =>
                `${m.provider}/${m.model}` === s.fallback &&
                s.candidates.some((c) => c.enabled && sameModel(c, m)),
            );
            if (fallback) {
              const effort =
                s.mode === "MODEL_AUTO" || s.lockEffort
                  ? s.lockEffort
                    ? current.reasoningEffort
                    : s.fixedEffort || current.reasoningEffort
                  : effortFor(fallback, "moderate");
              if (effort === undefined || fallback.efforts.includes(effort)) {
                const selected: Selection = {
                  provider: fallback.provider,
                  model: fallback.model,
                  ...(effort === undefined ? {} : { reasoningEffort: effort }),
                };
                save(agent, {
                  ...diagnostic, turn,
                  selection: selected,
                  reason: decision.failure,
                  control: "Fallback",
                  configKey: routingKey(s),
                  registryRevision: inspectedRevision,
                  modelInfo: fallback.modelInfo,
                  capacitySurface:agent.session.surface.replaceGeneration,
                });
                return replace(original, selected);
              }
            }
          }
          return pass(decision.failure);
        }
        const autoModel =
          !s.lockModel && ["FULL_AUTO", "MODEL_AUTO"].includes(s.mode);
        // The current route is always a valid fixed-model effort candidate, but cannot
        // be silently added to the authorized pool for automatic model selection.
        const authorized = autoModel
          ? pool.filter((m) =>
              s.candidates.some((c) => c.enabled && sameModel(c, m)),
            )
          : pool;
        const result = chooseRoute({
          current,
          pool: authorized,
          decision,
          config: s,
          previous,
        });
        const selected = result.selection;
        const info = await withinBudget(
          available(selected),
          s.timeoutMs,
          signal,
        );
        if (
          !info ||
          (selected.reasoningEffort !== undefined &&
            !info.reasoning?.efforts.some(
              (e) => String(e.id) === selected.reasoningEffort,
            ))
        )
          return pass("validation-failed");
        if (!fitsContext(agent, original, info, currentInfo, signal)) {
          const kind=capacity(agent,original,info,signal);
          return pass(kind==="metadata-unavailable"?"context-capacity-unknown":kind==="estimate-unavailable"?"context-estimate-unavailable":"context-too-large");
        }
        if (!canApply(agent, s, signal, inspectedRevision))
          return pass("decision-superseded", "Native");
        const control = result.reason === "no-compatible-model" ? "Bypass" : result.reason === "manual" ? "Manual" : "Auto";
        save(agent, {
          ...diagnostic, turn,
          selection: selected,
          reason:
            result.reason === "auto"
              ? local
                ? "local"
                : engineFor(s) === "NeoHorse" ? "neohorse" : "jev"
              : result.reason,
          control,
          configKey: routingKey(s),
          registryRevision: inspectedRevision,
          modelInfo: info,
          capacitySurface:agent.session.surface.replaceGeneration,
        });
        return replace(original, selected);
      } catch (error) {
        // A capacity stop, including unavailable evidence, cannot silently pass
        // the small model already recorded in the native Header.
        if (error instanceof ContextCapacityError) throw error;
        return pass("router-error");
      }
    },
    { prepend: true },
  );
  class RouterRemote {
    // Host-only: not included in the Remote descriptor below.
    getRecentDecisions(sessionId: string) { return structuredClone(history.get(String(sessionId)) ?? []); }
    async getSetupState() {
      const started = Date.now(), s = settings(), inspectedCredentialRevision = credentialRevision;
      let keyAvailable = false;
      try { keyAvailable = !!await withinBudget(keyFor(s), Math.min(s.timeoutMs, 5000), new AbortController().signal); } catch { /* Unknown key stays unavailable. */ }
      const current = inspectedCredentialRevision === credentialRevision && routingKey(settings()) === routingKey(s);
      const checked = current && verification?.configKey === routingKey(s) ? verification : undefined;
      return { keyAvailable: current ? keyAvailable : undefined, conflict: conflict(), engine: engineFor(s),
        verified: checked?.ok ?? false, verification: checked ? { at: checked.at, elapsedMs: checked.elapsedMs, ok: checked.ok, failure: checked.failure } : null,
        networkTestAvailable: false, networkTestReason: "静态检查已完成，未进行网络验证。当前版本不开放带凭据的远程网络探针；真实分类成功后才验证连接。",
        checkedAt: Date.now(), inspectionMs: Date.now() - started,
        endpointValid: validEndpoint(s.apiUrl), model: s.classifierModel };
    }
    getSessionState(sessionId: string) {
      const record = records.get(String(sessionId));
      return {
        enabled: settings().enabled,
        conflict: conflict(),
        decision: record ? publicRecord(record) : null,
      };
    }
  }
  Object.defineProperty(
    RouterRemote.prototype,
    "@deepseek-ai/dsh-typert-protocol/remote-methods",
    {
      value: {
        version: 1,
        methods: [
          { method: "getSessionState", invocation: { kind: "direct" } },
          { method: "getSetupState", invocation: { kind: "direct" } },
        ],
      },
    },
  );
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
    history.delete(String(agent.session.id));
  });
  ctx.on("session/disposed", session => { records.delete(String(session.id)); history.delete(String(session.id)); });
  ctx.effect(() => () => { disposed = true; records.clear(); history.clear(); verification = undefined; });
  mountLab(ctx,config,id=>{const record=records.get(id);return record ? publicRecord(record) : null;});
}
