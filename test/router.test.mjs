import test from "node:test";
import assert from "node:assert/strict";
import { chooseRoute } from "../lib/router.js";
import { localSimple, askJev } from "../lib/classifier.js";
const current = { provider: "p", model: "balanced", reasoningEffort: "medium" };
const pool = [
  {
    provider: "p",
    model: "fast",
    tier: "simple",
    roles: ["general"],
    efforts: ["off", "low"],
    effortByTier: { simple: "off" },
    contextWindow: 64000,
  },
  {
    provider: "p",
    model: "balanced",
    tier: "moderate",
    roles: ["general", "coding"],
    efforts: ["low", "medium", "high"],
    contextWindow: 64000,
  },
  {
    provider: "p",
    model: "coder",
    tier: "complex",
    roles: ["coding"],
    efforts: ["low", "high"],
    contextWindow: 128000,
  },
];
const config = {
  mode: "FULL_AUTO",
  lockModel: false,
  lockEffort: false,
  fixedEffort: "medium",
  fallback: "",
};
const route = (decision, overrides = {}) =>
  chooseRoute({
    current,
    pool,
    decision,
    config,
    previous: null,
    ...overrides,
  });
test("greeting selects fast model and a legal low effort", () => {
  assert.equal(localSimple("你好", null, false)?.tier, "simple");
  assert.deepEqual(
    route({ tier: "simple", role: "general", relation: "new" }).selection,
    { provider: "p", model: "fast", reasoningEffort: "off" },
  );
});
test("complex coding chooses capability and legal effort together", () => {
  assert.equal(localSimple("修复竞态条件", null, false), null);
  assert.deepEqual(
    route({ tier: "complex", role: "coding", relation: "new" }).selection,
    { provider: "p", model: "coder", reasoningEffort: "high" },
  );
});
test("unfinished continuation keeps prior model and depth", () => {
  const previous = {
    provider: "p",
    model: "coder",
    effort: "high",
    outcome: "aborted",
    openTodos: 1,
  };
  assert.equal(localSimple("继续", previous, false), null);
  assert.deepEqual(
    route(
      { tier: "simple", role: "coding", relation: "continues" },
      { previous },
    ).selection,
    { provider: "p", model: "coder", reasoningEffort: "high" },
  );
});
test("four modes and explicit locks", () => {
  const d = { tier: "complex", role: "coding", relation: "new" };
  assert.deepEqual(
    route(d, { config: { ...config, mode: "MANUAL" } }).selection,
    current,
  );
  assert.deepEqual(
    route(d, { config: { ...config, mode: "EFFORT_AUTO" } }).selection,
    { ...current, reasoningEffort: "high" },
  );
  assert.deepEqual(
    route(d, { config: { ...config, mode: "MODEL_AUTO", fixedEffort: "low" } })
      .selection,
    { provider: "p", model: "coder", reasoningEffort: "low" },
  );
  assert.deepEqual(
    route(d, { config: { ...config, lockModel: true, lockEffort: true } })
      .selection,
    current,
  );
});
test("unsupported fixed effort prevents incompatible model switch", () => {
  const r = route(
    { tier: "complex", role: "coding", relation: "new" },
    { config: { ...config, mode: "MODEL_AUTO", fixedEffort: "max" } },
  );
  assert.deepEqual(r.selection, current);
});
test("unknown effort mapping is never sent and empty candidates preserve caller", () => {
  const broken = [{ ...pool[2], effortByTier: { complex: "max" } }];
  assert.equal(
    route(
      { tier: "complex", role: "coding", relation: "new" },
      { pool: broken },
    ).selection.reasoningEffort,
    "high",
  );
  assert.deepEqual(
    route({ tier: "complex", role: "coding", relation: "new" }, { pool: [] })
      .selection,
    current,
  );
});
test("simple acknowledgement with context always goes to classifier", () => {
  assert.equal(
    localSimple("ok", { outcome: "completed", openTodos: 0 }, false),
    null,
  );
  assert.equal(localSimple("你好", null, true), null);
});
test("continuation can upgrade a model whose configured capability no longer meets the task", () => {
  const previous = {
    provider: "p",
    model: "fast",
    effort: "low",
    outcome: "aborted",
    openTodos: 1,
  };
  assert.equal(
    route(
      { tier: "complex", role: "coding", relation: "continues" },
      { previous },
    ).selection.model,
    "coder",
  );
});
