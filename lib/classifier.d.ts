import type { ConfigValues } from "./config.js";
import type { Decision, Previous } from "./router.js";
export type Classification = (Decision & {
    confidenceKnown?: boolean;
}) | {
    failure: string;
};
export declare function localSimple(text: string, previous: Previous | null, material: boolean): Decision | null;
export declare function askJev(config: ConfigValues, key: string, state: unknown, askRelation: boolean, signal?: AbortSignal): Promise<Classification>;
/** Trusted Host-only synthetic probe; intentionally not exported as a browser Remote. */
export declare function probeJev(config: ConfigValues, key: string, signal?: AbortSignal): Promise<{
    failure?: string | undefined;
    engine: import("./diagnostics.js").Engine;
    model: string;
    at: number;
    elapsedMs: number;
    ok: boolean;
}>;
