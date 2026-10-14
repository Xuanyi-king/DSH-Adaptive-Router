import type { ConfigValues } from "./config.js";
export type Tier = "simple" | "moderate" | "complex";
export type Role = "general" | "coding" | "reasoning";
export interface Selection {
  provider: string;
  model: string;
  reasoningEffort?: string;
}
export interface Candidate extends Selection {
  tier: Tier;
  roles: Role[];
  efforts: string[];
  effortByTier?: Partial<Record<Tier, string>>;
  contextWindow?: number;
}
export interface Decision {
  tier: Tier;
  role: Role;
  relation: "new" | "continues";
  confidence?: number;
}
export interface Previous {
  provider?: string | null;
  model?: string | null;
  effort: string | null;
  outcome: string | null;
  openTodos: number;
}
const tiers: Tier[] = ["simple", "moderate", "complex"];
export const sameModel = (a: Selection, b: Selection) =>
  a.provider === b.provider && a.model === b.model;
// Adapted from Jev Effort Selector deriveLadder: adapter order is authoritative.
export function deriveLadder(ids: string[]): string[] {
  if (ids.length <= 2) return ids.slice();
  const low = ids[0];
  let high = ids.includes("high") ? "high" : ids.at(-1)!;
  if (high === low) high = ids.at(-1)!;
  let mid = ids.includes("medium") ? "medium" : ids[Math.floor(ids.length / 2)];
  if (mid === low || mid === high)
    mid = ids.find((id) => id !== low && id !== high) ?? mid;
  return [...new Set([low, mid, high])].sort(
    (a, b) => ids.indexOf(a) - ids.indexOf(b),
  );
}
export function effortFor(model: Candidate, tier: Tier): string | undefined {
  const configured = model.effortByTier?.[tier];
  if (configured && model.efforts.includes(configured)) return configured;
  const ladder = deriveLadder(model.efforts);
  if (!ladder.length) return undefined;
  return ladder[Math.round((tiers.indexOf(tier) * (ladder.length - 1)) / 2)];
}
export function chooseRoute(input: {
  current: Selection;
  pool: Candidate[];
  decision: Decision;
  config: Pick<
    ConfigValues,
    "mode" | "lockModel" | "lockEffort" | "fixedEffort" | "fallback"
  >;
  previous: Previous | null;
}): { selection: Selection; reason: string } {
  const { current, pool, decision, config, previous } = input;
  const autoModel =
    !config.lockModel && ["FULL_AUTO", "MODEL_AUTO"].includes(config.mode);
  const autoEffort =
    !config.lockEffort && ["FULL_AUTO", "EFFORT_AUTO"].includes(config.mode);
  if (!autoModel && !autoEffort)
    return { selection: current, reason: "manual" };
  const fixedEffort = config.lockEffort
    ? current.reasoningEffort
    : config.fixedEffort || current.reasoningEffort;
  const eligible = autoModel
    ? pool.filter(
        (m) =>
          autoEffort ||
          fixedEffort === undefined ||
          m.efforts.includes(fixedEffort),
      )
    : pool.filter((m) => sameModel(m, current));
  const inFlight =
    previous && (previous.outcome !== "completed" || previous.openTodos > 0);
  const sticky =
    inFlight && decision.relation === "continues"
      ? eligible.find(
          (m) => m.provider === previous.provider && m.model === previous.model,
        )
      : undefined;
  const suitable = eligible.filter(
    (m) =>
      m.roles.includes(decision.role) &&
      tiers.indexOf(m.tier) >= tiers.indexOf(decision.tier),
  );
  suitable.sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier));
  const adequateSticky =
    sticky && suitable.includes(sticky) ? sticky : undefined;
  const target = autoModel
    ? (adequateSticky ?? suitable[0] ?? sticky)
    : eligible[0];
  if (!target) return { selection: current, reason: "no-compatible-model" };
  let effort = autoEffort ? effortFor(target, decision.tier) : fixedEffort;
  if (
    target === sticky &&
    autoEffort &&
    previous?.effort &&
    target.efforts.includes(previous.effort) &&
    (effort === undefined ||
      target.efforts.indexOf(previous.effort) > target.efforts.indexOf(effort))
  )
    effort = previous.effort;
  // A changed model must not inherit the caller's model-specific effort.
  const selection: Selection = {
    provider: target.provider,
    model: target.model,
  };
  if (effort !== undefined) selection.reasoningEffort = effort;
  return { selection, reason: target === sticky ? "anchored" : "auto" };
}
