const tiers = ["simple", "moderate", "complex"];
export const sameModel = (a, b) => a.provider === b.provider && a.model === b.model;
// Adapted from Jev Effort Selector deriveLadder: adapter order is authoritative.
export function deriveLadder(ids) {
    if (ids.length <= 2)
        return ids.slice();
    const low = ids[0];
    let high = ids.includes("high") ? "high" : ids.at(-1);
    if (high === low)
        high = ids.at(-1);
    let mid = ids.includes("medium") ? "medium" : ids[Math.floor(ids.length / 2)];
    if (mid === low || mid === high)
        mid = ids.find((id) => id !== low && id !== high) ?? mid;
    return [...new Set([low, mid, high])].sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
}
export function effortFor(model, tier) {
    const configured = model.effortByTier?.[tier];
    if (configured && model.efforts.includes(configured))
        return configured;
    const ladder = deriveLadder(model.efforts);
    if (!ladder.length)
        return undefined;
    return ladder[Math.round((tiers.indexOf(tier) * (ladder.length - 1)) / 2)];
}
export function chooseRoute(input) {
    const { current, pool, decision, config, previous } = input;
    const autoModel = !config.lockModel && ["FULL_AUTO", "MODEL_AUTO"].includes(config.mode);
    const autoEffort = !config.lockEffort && ["FULL_AUTO", "EFFORT_AUTO"].includes(config.mode);
    if (!autoModel && !autoEffort)
        return { selection: current, reason: "manual" };
    const fixedEffort = config.lockEffort
        ? current.reasoningEffort
        : config.fixedEffort || current.reasoningEffort;
    const eligible = autoModel
        ? pool.filter((m) => autoEffort ||
            fixedEffort === undefined ||
            m.efforts.includes(fixedEffort))
        : pool.filter((m) => sameModel(m, current));
    const inFlight = previous && (previous.outcome !== "completed" || previous.openTodos > 0);
    const sticky = inFlight && decision.relation === "continues"
        ? eligible.find((m) => m.provider === previous.provider && m.model === previous.model)
        : undefined;
    const suitable = eligible.filter((m) => m.roles.includes(decision.role) &&
        tiers.indexOf(m.tier) >= tiers.indexOf(decision.tier));
    suitable.sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier));
    const adequateSticky = sticky && suitable.includes(sticky) ? sticky : undefined;
    const target = autoModel
        ? (adequateSticky ?? suitable[0] ?? sticky)
        : eligible[0];
    if (!target)
        return { selection: current, reason: "no-compatible-model" };
    let effort = autoEffort ? effortFor(target, decision.tier) : fixedEffort;
    if (target === sticky &&
        autoEffort &&
        previous?.effort &&
        target.efforts.includes(previous.effort) &&
        (effort === undefined ||
            target.efforts.indexOf(previous.effort) > target.efforts.indexOf(effort)))
        effort = previous.effort;
    // A changed model must not inherit the caller's model-specific effort.
    const selection = {
        provider: target.provider,
        model: target.model,
    };
    if (effort !== undefined)
        selection.reasoningEffort = effort;
    return { selection, reason: target === sticky ? "anchored" : "auto" };
}
