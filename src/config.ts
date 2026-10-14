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
const tier = () => Schema.union(["simple", "moderate", "complex"]);
export const Config: Schema = Schema.object({
  enabled: Schema.boolean().default(true).volatile(),
  mode: Schema.union(["FULL_AUTO", "EFFORT_AUTO", "MODEL_AUTO", "MANUAL"])
    .default("FULL_AUTO")
    .volatile(),
  lockModel: Schema.boolean()
    .default(false)
    .volatile()
    .description("Explicitly preserve the native model selection."),
  lockEffort: Schema.boolean()
    .default(false)
    .volatile()
    .description("Explicitly preserve the native effort selection."),
  fixedEffort: Schema.string()
    .default("")
    .volatile()
    .description("MODEL_AUTO effort; empty preserves the current effort."),
  candidates: Schema.array(
    Schema.object({
      provider: Schema.string().required(),
      model: Schema.string().required(),
      enabled: Schema.boolean().default(true),
      tier: tier().default("moderate"),
      roles: Schema.array(
        Schema.union(["general", "coding", "reasoning"]),
      ).default(["general"]),
      effortByTier: Schema.dict(Schema.string()).default({}),
      images: Schema.boolean().description(
        "Only fills unknown input modality metadata; cannot override a declared negative.",
      ),
    }),
  )
    .default([])
    .volatile(),
  fallback: Schema.string()
    .default("")
    .volatile()
    .description(
      "Authorized provider/model candidate; used only if current route is unavailable.",
    ),
  apiUrl: Schema.string()
    .default("")
    .volatile()
    .description(
      "Full Jev System One endpoint URL; blank disables network classification.",
    ),
  apiKeyEnv: Schema.string()
    .default("JEV_API_KEY")
    .role("credential-ref")
    .volatile(),
  classifierModel: Schema.string().default("jev-latest").volatile(),
  timeoutMs: Schema.number().min(500).max(30000).default(5000).volatile(),
  confidenceThreshold: Schema.number().min(0).max(1).default(0.6).volatile(),
});
export function readConfig(config: object): ConfigValues {
  const defaults: ConfigValues = {
    enabled: true,
    mode: "FULL_AUTO",
    lockModel: false,
    lockEffort: false,
    fixedEffort: "",
    candidates: [],
    fallback: "",
    apiUrl: "",
    apiKeyEnv: "JEV_API_KEY",
    classifierModel: "jev-latest",
    timeoutMs: 5000,
    confidenceThreshold: 0.6,
  };
  const refs = config as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    const ref = refs[key] as { get?: () => unknown } | undefined;
    const value =
      ref && typeof ref === "object" && typeof ref.get === "function"
        ? ref.get()
        : ref;
    if (value !== undefined)
      (defaults as unknown as Record<string, unknown>)[key] = value;
  }
  return defaults;
}
