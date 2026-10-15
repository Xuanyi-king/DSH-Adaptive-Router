import type { CandidateConfig } from "./config.js";
export declare const modes: {
    FULL_AUTO: string;
    EFFORT_AUTO: string;
    MODEL_AUTO: string;
    MANUAL: string;
};
export declare const tiers: {
    simple: string;
    moderate: string;
    complex: string;
};
export declare const roles: {
    general: string;
    coding: string;
    reasoning: string;
};
export interface Catalog {
    groups: {
        id: string;
        name: string;
        models: {
            id: string;
            name: string;
            reasoning?: {
                efforts: {
                    id: string;
                    name: string;
                }[];
            };
        }[];
    }[];
    failures: {
        id: string;
        name: string;
    }[];
}
export declare function catalogRows(catalog: Catalog | null): {
    provider: string;
    providerName: string;
    model: string;
    name: string;
    efforts: {
        id: string;
        name: string;
    }[];
}[];
export declare function candidateError(candidates: CandidateConfig[], catalog: Catalog, saved: CandidateConfig[]): string | null;
export declare function autoEffort(candidate: CandidateConfig, efforts: string[], tier: keyof typeof tiers): string | undefined;
export declare function actualControl(actual: {
    provider: string;
    model: string;
    reasoningEffort?: string;
} | null, status: {
    conflict?: boolean;
    decision?: {
        selection?: typeof actual;
        control?: string;
        reason?: string;
    } | null;
} | null): {
    control: string;
    reason: string;
};
