import Schema from "@deepseek-ai/schemastery";
const tier = () => Schema.union(["simple", "moderate", "complex"]);
export const Config = Schema.object({
    enabled: Schema.boolean().default(true).volatile(),
    labEnabled: Schema.boolean().default(false).volatile().description("Opt-in local Router Lab metadata collection."),
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
    candidates: Schema.array(Schema.object({
        provider: Schema.string().required(),
        model: Schema.string().required(),
        enabled: Schema.boolean().default(true),
        tier: tier().default("moderate"),
        roles: Schema.array(Schema.union(["general", "coding", "reasoning"])).default(["general"]),
        effortByTier: Schema.dict(Schema.string()).default({}),
        images: Schema.boolean().description("Only fills unknown input modality metadata; cannot override a declared negative."),
    }))
        .default([])
        .volatile(),
    fallback: Schema.string()
        .default("")
        .volatile()
        .description("Authorized provider/model candidate; used only if current route is unavailable."),
    apiUrl: Schema.string()
        .default("")
        .volatile()
        .description("Full Jev System One endpoint URL; blank disables network classification."),
    apiKeyEnv: Schema.string()
        .default("JEV_API_KEY")
        .role("credential-ref")
        .volatile(),
    classifierModel: Schema.string().default("jev-latest").volatile(),
    timeoutMs: Schema.number().min(500).max(30000).default(5000).volatile(),
    confidenceThreshold: Schema.number().min(0).max(1).default(0.6).volatile(),
});
export function readConfig(config) {
    const defaults = {
        enabled: true,
        labEnabled: false,
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
    const refs = config;
    for (const key of Object.keys(defaults)) {
        const ref = refs[key];
        const value = ref && typeof ref === "object" && typeof ref.get === "function"
            ? ref.get()
            : ref;
        if (value !== undefined)
            defaults[key] = value;
    }
    return defaults;
}
// Collection preference is deliberately excluded from routing/verification revisions.
export function routingKey(config) { const { labEnabled: _lab, ...routing } = config; return JSON.stringify(routing); }
