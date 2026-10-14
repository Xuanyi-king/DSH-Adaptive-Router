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
export declare const sameModel: (a: Selection, b: Selection) => boolean;
export declare function deriveLadder(ids: string[]): string[];
export declare function effortFor(model: Candidate, tier: Tier): string | undefined;
export declare function chooseRoute(input: {
    current: Selection;
    pool: Candidate[];
    decision: Decision;
    config: Pick<ConfigValues, "mode" | "lockModel" | "lockEffort" | "fixedEffort" | "fallback">;
    previous: Previous | null;
}): {
    selection: Selection;
    reason: string;
};
