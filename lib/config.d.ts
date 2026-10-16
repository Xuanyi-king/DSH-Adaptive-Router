import Schema from "@deepseek-ai/schemastery";
import type { Role, Tier } from "./router.js";
export interface CandidateConfig {
    provider: string;
    model: string;
    enabled: boolean;
    tier: Tier;
    roles: Role[];
    effortByTier: Partial<Record<Tier, string>>;
    images?: boolean;
}
export interface ConfigValues {
    enabled: boolean;
    labEnabled: boolean;
    mode: "FULL_AUTO" | "EFFORT_AUTO" | "MODEL_AUTO" | "MANUAL";
    lockModel: boolean;
    lockEffort: boolean;
    fixedEffort: string;
    candidates: CandidateConfig[];
    fallback: string;
    apiUrl: string;
    apiKeyEnv: string;
    classifierModel: string;
    timeoutMs: number;
    confidenceThreshold: number;
}
export declare const Config: Schema;
export declare function readConfig(config: object): ConfigValues;
export declare function routingKey(config: ConfigValues): string;
