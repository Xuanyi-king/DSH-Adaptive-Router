import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Context } from "@deepseek-ai/cordis";
import { z } from "zod";
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness,
} from "@deepseek-ai/dsh-agent-loop-testkit";
import { LlmAdapter, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { agentEvents, installModelSelection } from "@deepseek-ai/dsh-agent";
import * as plugin from "../lib/index.js";
const selectionSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string().optional(),
});
const stateSchema = z.object({ pending: selectionSchema.nullable() });
// Test fixture for the public modelSelection intent seam; the real loop, event
// validation, request admission, header logging and provider dispatch run unchanged.
function installIntent(ctx) {
  ctx.sessionProjections.register({
    key: "modelSelection",
    stateVersion: 1,
    stateSchema,
    init: () => ({ pending: null }),
    apply(state, event) {
      if (event.type === "model/selection") return { pending: event.data };
      if (event.type === "request/header" && state.pending) {
        const c = event.data.header.config;
        if (
          c.provider === state.pending.provider &&
          c.model === state.pending.model &&
          c.reasoningEffort === state.pending.reasoningEffort
        )
          return { pending: null };
      }
      return state;
    },
  });
}
const candidates = [
  { provider: "p", model: "fast", tier: "simple", roles: ["general"] },
  {
    provider: "p",
    model: "balanced",
    tier: "moderate",
    roles: ["general", "coding", "reasoning"],
  },
  {
    provider: "p",
    model: "coder",
    tier: "complex",
    roles: ["coding", "reasoning", "general"],
  },
];
class Adapter extends LlmAdapter {
  requests = [];
  finish = "stop";
  async listModels(provider) {
    return candidates.map((m) => ({ provider, id: m.model, name: m.model }));
  }
  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: model,
      inputModalities: ["text"],
      context: { contextWindow: 64000 },
      reasoning: {
        efforts: (model === "fast"
          ? ["off", "low"]
          : ["low", "medium", "high"]
        ).map((id) => ({ id, name: id })),
      },
    };
  }
  async *stream(options) {
    this.requests.push(options);
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "response" };
    yield {
      type: "block-end",
      index: 0,
      block: { type: "text", text: "response" },
    };
    yield { type: "finish", reason: { kind: this.finish } };
  }
}
async function setup(t, config = {}, intent = true) {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await mountAgentLoopTestDependencies(ctx);
  if (intent) installIntent(ctx);
  const adapter = new Adapter();
  ctx.effect(() => ctx.llm.registerAdapter(["p"], adapter));
  const fiber = await ctx.plugin(plugin, { candidates, ...config });
  const harness = await mountAgentLoopTestHarness(ctx);
  const agent = await harness.create(SessionId("test-main"), {
    provider: "p",
    model: "balanced",
    reasoningEffort: "medium",
  });
  return { ctx, adapter, agent, harness, fiber };
}
async function send(agent, text) {
  agent.followup(
    createUserMessage({
      content: [{ type: "text", text }],
      source: { kind: "user" },
    }),
  );
  await agent.whenIdle();
}
const selected = (r) => ({
  provider: r.provider,
  model: r.model,
  reasoningEffort: r.reasoningEffort,
});
async function jevServer(t, respond) {
  let calls = 0;
  const bodies = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    calls++;
    bodies.push(JSON.parse(body));
    respond(res, calls);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return {
    url: `http://127.0.0.1:${server.address().port}/system-one`,
    get calls() {
      return calls;
    },
    bodies,
  };
}
function verdict(tier = "complex", role = "coding", relation = "new") {
  return {
    answers: {
      tier: { choice: tier, confidence: 0.95 },
      role: { choice: role, confidence: 0.95 },
      relation: { choice: relation, confidence: 0.95 },
    },
  };
}
// A test credential, scoped to this process, never a real service credential.
process.env.DSH_ROUTER_TEST_KEY = "offline-test-token";
const classifierConfig = (url) => ({
  apiUrl: url,
  apiKeyEnv: "DSH_ROUTER_TEST_KEY",
});
test("real DSH loop dispatches and logs both routed model and effort", async (t) => {
  const { ctx, adapter, agent } = await setup(t);
  await send(agent, "你好");
  assert.equal(adapter.requests.length, 1);
  assert.deepEqual(selected(adapter.requests[0]), {
    provider: "p",
    model: "fast",
    reasoningEffort: "off",
  });
  assert.deepEqual(
    selected(agent.session.requestHeader().config),
    selected(adapter.requests[0]),
  );
  assert.equal(
    ctx.sessionProjections.stateOf(agent.session, "adaptiveRouter").actual
      .model,
    "fast",
  );
});
test("complex coding and unfinished continue preserve route through real log projection", async (t) => {
  const server = await jevServer(t, (res, n) =>
    res.end(
      JSON.stringify(
        n === 1 ? verdict() : verdict("simple", "coding", "continues"),
      ),
    ),
  );
  const { adapter, agent } = await setup(t, classifierConfig(server.url));
  adapter.finish = "max-tokens";
  await send(agent, "实现跨文件重构和并发竞态修复");
  assert.deepEqual(selected(adapter.requests[0]), {
    provider: "p",
    model: "coder",
    reasoningEffort: "high",
  });
  await send(agent, "继续");
  assert.deepEqual(
    selected(adapter.requests[1]),
    selected(adapter.requests[0]),
  );
  assert.equal(server.calls, 2);
  assert.match(server.bodies[1].state[0].content, /not completed/);
});
test("native explicit pick overrides routing, including on a later step", async (t) => {
  const { ctx, adapter, agent } = await setup(t);
  agent.session.append("model/selection", {
    provider: "p",
    model: "balanced",
    reasoningEffort: "low",
  });
  // The caller supplies the native resolved selection, as SessionController does.
  installModelSelection(agent.ctx, {
    current: { provider: "p", model: "balanced", reasoningEffort: "low" },
    assembled: undefined,
  });
  await send(agent, "你好");
  assert.deepEqual(selected(adapter.requests[0]), {
    provider: "p",
    model: "balanced",
    reasoningEffort: "low",
  });
  const next = await agentEvents(ctx, agent).waterfall(
    "agent/request",
    { turn: 1, step: 2, signal: new AbortController().signal },
    () =>
      Promise.resolve({
        provider: "p",
        model: "balanced",
        reasoningEffort: "low",
      }),
  );
  assert.equal(next.reasoningEffort, "low");
  assert.equal(next.model, "balanced");
});
test("timeout preserves original request and a retry does not classify again", async (t) => {
  const server = await jevServer(t, () => {});
  const { ctx, adapter, agent } = await setup(t, {
    ...classifierConfig(server.url),
    timeoutMs: 500,
  });
  await send(agent, "设计一个复杂架构");
  assert.deepEqual(selected(adapter.requests[0]), {
    provider: "p",
    model: "balanced",
    reasoningEffort: "medium",
  });
  const retry = await agentEvents(ctx, agent).waterfall(
    "agent/request",
    { turn: 1, step: 1, signal: new AbortController().signal },
    () => Promise.resolve(agent.session.requestHeader().config),
  );
  assert.equal(retry.model, "balanced");
  assert.equal(server.calls, 1);
  assert.equal(
    ctx.get("adaptiveRouter").getSessionState(String(agent.session.id)).decision
      .reason,
    "timeout",
  );
});
test("invalid model excluded; bad effort mapping is filtered before DSH dispatch", async (t) => {
  const server = await jevServer(t, (res) =>
    res.end(JSON.stringify(verdict())),
  );
  const { adapter, agent } = await setup(t, {
    ...classifierConfig(server.url),
    candidates: [
      { provider: "p", model: "missing", tier: "complex", roles: ["coding"] },
      { ...candidates[2], effortByTier: { complex: "max" } },
    ],
  });
  await send(agent, "复杂编程");
  assert.equal(adapter.requests[0].model, "coder");
  assert.equal(adapter.requests[0].reasoningEffort, "high");
});
test("disabled or unloaded plugin leaves native DSH calls unchanged", async (t) => {
  const { adapter, agent, fiber } = await setup(t, { enabled: false });
  await send(agent, "你好");
  assert.equal(adapter.requests[0].model, "balanced");
  await fiber.dispose();
  await send(agent, "你好");
  assert.equal(adapter.requests[1].model, "balanced");
  assert.equal(adapter.requests[1].reasoningEffort, "medium");
});
test("session decisions do not leak; unrecognized manual seam is conservative", async (t) => {
  const { adapter, agent, harness } = await setup(t);
  await send(agent, "你好");
  const other = await harness.create(SessionId("other"), {
    provider: "p",
    model: "balanced",
    reasoningEffort: "high",
  });
  await send(other, "继续");
  assert.equal(adapter.requests[1].model, "balanced");
  assert.equal(adapter.requests[1].reasoningEffort, "high");
  const absent = await setup(t, {}, false);
  await send(absent.agent, "你好");
  assert.equal(absent.adapter.requests[0].model, "balanced");
});
test("conflicting effort plugin added later disables automatic control", async (t) => {
  const { ctx, adapter, agent } = await setup(t);
  await ctx.plugin({
    name: "jev-effort-selector",
    apply(c) {
      c.provide("jevEffortSelector", {});
    },
  });
  await send(agent, "你好");
  assert.equal(adapter.requests[0].model, "balanced");
  assert.match(
    ctx.get("adaptiveRouter").getSessionState(String(agent.session.id)).decision
      .reason,
    /conflict/,
  );
});

test("Jev HTTP failure, malformed JSON and unknown labels preserve legal native config", async (t) => {
  const cases = [
    (res) => {
      res.statusCode = 503;
      res.end("unavailable");
    },
    (res) => res.end("{broken"),
    (res) => res.end(JSON.stringify(verdict("unknown-model", "coding"))),
  ];
  for (const respond of cases) {
    const server = await jevServer(t, respond);
    const { adapter, agent } = await setup(t, classifierConfig(server.url));
    await send(agent, "复杂请求");
    assert.deepEqual(selected(adapter.requests[0]), {
      provider: "p",
      model: "balanced",
      reasoningEffort: "medium",
    });
    assert.equal(server.calls, 1);
  }
});
test("unexpected metadata errors cannot prevent an otherwise valid original request", async (t) => {
  const { adapter, agent } = await setup(t);
  adapter.listModels = async () => {
    throw new Error("catalog failure");
  };
  await send(agent, "你好");
  assert.equal(adapter.requests[0].model, "balanced");
});
test("restart rebuilds context from each actual session log and preserves unfinished work", async (t) => {
  const server = await jevServer(t, (res, n) =>
    res.end(
      JSON.stringify(
        n === 1 ? verdict() : verdict("simple", "coding", "continues"),
      ),
    ),
  );
  const config = classifierConfig(server.url);
  const { ctx, adapter, agent, fiber } = await setup(t, config);
  adapter.finish = "max-tokens";
  await send(agent, "修复复杂竞态");
  await fiber.dispose();
  await ctx.plugin(plugin, { candidates, ...config });
  await send(agent, "继续");
  assert.equal(adapter.requests[1].model, "coder");
  assert.equal(adapter.requests[1].reasoningEffort, "high");
  assert.match(server.bodies[1].state[0].content, /model used: p\/coder/);
});
test("successful classification is reused for later steps and first-step retry", async (t) => {
  const server = await jevServer(t, (res) =>
    res.end(JSON.stringify(verdict())),
  );
  const { ctx, agent } = await setup(t, classifierConfig(server.url));
  await send(agent, "复杂编程");
  for (const step of [1, 2, 3]) {
    const result = await agentEvents(ctx, agent).waterfall(
      "agent/request",
      { turn: 1, step, signal: new AbortController().signal },
      () =>
        Promise.resolve({
          provider: "p",
          model: "balanced",
          reasoningEffort: "medium",
        }),
    );
    assert.equal(result.model, "coder");
    assert.equal(result.reasoningEffort, "high");
  }
  assert.equal(server.calls, 1);
});
test("candidate with smaller context window is excluded rather than shrinking capacity", async (t) => {
  const { adapter, agent } = await setup(t);
  const resolve = adapter.resolveModel.bind(adapter);
  adapter.resolveModel = async (provider, model) => ({
    ...(await resolve(provider, model)),
    context: { contextWindow: model === "fast" ? 8000 : 64000 },
  });
  await send(agent, "你好");
  assert.equal(adapter.requests[0].model, "balanced");
});

test("live candidate removal must invalidate a held automatic route", async (t) => {
  const server = await jevServer(t, (res) =>
    res.end(JSON.stringify(verdict())),
  );
  const { ctx, agent, fiber } = await setup(t, classifierConfig(server.url));
  await send(agent, "复杂编程");
  fiber.update({
    candidates: candidates.filter((c) => c.model !== "coder"),
    ...classifierConfig(server.url),
  });
  await fiber;
  const result = await agentEvents(ctx, agent).waterfall(
    "agent/request",
    { turn: 1, step: 2, signal: new AbortController().signal },
    () =>
      Promise.resolve({
        provider: "p",
        model: "balanced",
        reasoningEffort: "medium",
      }),
  );
  assert.equal(result.model, "balanced");
  assert.equal(server.calls, 1);
});

test("stalled catalog lookup cannot stall an otherwise valid DSH request", async (t) => {
  const { adapter, agent } = await setup(t, { timeoutMs: 500 });
  adapter.listModels = () => new Promise(() => {});
  await Promise.race([
    send(agent, "你好"),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("router stalled DSH")),
        900,
      );
      t.after(() => clearTimeout(timer));
    }),
  ]);
  assert.equal(adapter.requests[0].model, "balanced");
});

test("catalog failure is not proof current route is missing, even with configured fallback", async (t) => {
  const { adapter, agent } = await setup(t, { fallback: "p/coder" });
  const list = adapter.listModels.bind(adapter);
  let reads = 0;
  adapter.listModels = async (provider) => {
    if (++reads === 1) throw new Error("temporarily offline");
    return list(provider);
  };
  await send(agent, "复杂请求");
  assert.equal(adapter.requests[0].model, "balanced");
});
test("explicit authorized fallback is usable when current model is absent from catalog", async (t) => {
  const { adapter, agent } = await setup(t, { fallback: "p/coder" });
  adapter.listModels = async (provider) => [
    { provider, id: "coder", name: "coder" },
  ];
  await send(agent, "复杂请求");
  assert.equal(adapter.requests[0].model, "coder");
});
test("subagent origin is left untouched by the router", async (t) => {
  const { ctx, adapter } = await setup(t);
  const child = await ctx.agentLoop.create(
    SessionId("test-child"),
    { provider: "p", model: "balanced", reasoningEffort: "high" },
    { origin: "subagent" },
  );
  await send(child, "你好");
  assert.equal(adapter.requests[0].model, "balanced");
  assert.equal(adapter.requests[0].reasoningEffort, "high");
  assert.equal(
    ctx.get("adaptiveRouter").getSessionState(String(child.session.id))
      .decision,
    null,
  );
});

test("native manual choice arriving during final model validation supersedes automatic decision", async (t) => {
  const server = await jevServer(t, (res) =>
    res.end(JSON.stringify(verdict())),
  );
  const { adapter, agent } = await setup(t, classifierConfig(server.url));
  const resolve = adapter.resolveModel.bind(adapter);
  let coderReads = 0;
  adapter.resolveModel = async (provider, model) => {
    if (model === "coder" && ++coderReads === 2)
      agent.session.append("model/selection", {
        provider: "p",
        model: "balanced",
        reasoningEffort: "low",
      });
    return resolve(provider, model);
  };
  await send(agent, "复杂编程");
  assert.equal(adapter.requests[0].model, "balanced");
});
test("native manual choice arriving during held model validation supersedes held decision", async (t) => {
  const server = await jevServer(t, (res) =>
    res.end(JSON.stringify(verdict())),
  );
  const { ctx, adapter, agent } = await setup(t, classifierConfig(server.url));
  await send(agent, "复杂编程");
  const resolve = adapter.resolveModel.bind(adapter);
  let fired = false;
  adapter.resolveModel = async (provider, model) => {
    if (!fired) {
      fired = true;
      agent.session.append("model/selection", {
        provider: "p",
        model: "balanced",
        reasoningEffort: "low",
      });
    }
    return resolve(provider, model);
  };
  const result = await agentEvents(ctx, agent).waterfall(
    "agent/request",
    { turn: 1, step: 2, signal: new AbortController().signal },
    () =>
      Promise.resolve({
        provider: "p",
        model: "balanced",
        reasoningEffort: "low",
      }),
  );
  assert.equal(result.model, "balanced");
  assert.equal(result.reasoningEffort, "low");
  assert.equal(server.calls, 1);
});

test("hanging credential service respects cancellation before Jev starts", async (t) => {
  const server = await jevServer(t, (res) =>
    res.end(JSON.stringify(verdict())),
  );
  const { ctx, agent } = await setup(t, {
    ...classifierConfig(server.url),
    timeoutMs: 500,
  });
  ctx.provide("credentials", { resolve: () => new Promise(() => {}) });
  const controller = new AbortController();
  const msg = createUserMessage({
    content: [{ type: "text", text: "复杂任务" }],
    source: { kind: "user" },
  });
  await agentEvents(ctx, agent).waterfall(
    "agent/pre-step",
    { turn: 1, step: 1, messages: [msg], signal: controller.signal },
    () => Promise.resolve({ kind: "accept", messages: [msg] }),
  );
  const work = agentEvents(ctx, agent).waterfall(
    "agent/request",
    { turn: 1, step: 1, signal: controller.signal },
    () =>
      Promise.resolve({
        provider: "p",
        model: "balanced",
        reasoningEffort: "medium",
      }),
  );
  const abortTimer = setTimeout(() => controller.abort(), 50);
  t.after(() => clearTimeout(abortTimer));
  const outcome = await Promise.race([
    work.then((result) => ({ settled: true, result })),
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ settled: false }), 750);
      t.after(() => clearTimeout(timer));
    }),
  ]);
  assert.equal(outcome.settled, true);
  assert.equal(outcome.result.model, "balanced");
  assert.equal(server.calls, 0);
});

test("no configured Jev endpoint never waits on a credential lookup", async (t) => {
  const { ctx, adapter, agent } = await setup(t);
  let reads = 0;
  ctx.provide("credentials", {
    resolve() {
      reads++;
      return new Promise(() => {});
    },
  });
  await send(agent, "复杂任务");
  assert.equal(reads, 0);
  assert.equal(adapter.requests[0].model, "balanced");
});
test("non-reasoning target omits inherited unsupported effort before native dispatch", async (t) => {
  const { adapter, agent } = await setup(t);
  const resolve = adapter.resolveModel.bind(adapter);
  adapter.resolveModel = async (provider, model) => {
    const info = await resolve(provider, model);
    if (model === "fast") delete info.reasoning;
    return info;
  };
  await send(agent, "你好");
  assert.equal(adapter.requests[0].model, "fast");
  assert.equal(adapter.requests[0].reasoningEffort, undefined);
});
