import type { ConfigValues } from "./config.js";
import type { Decision, Previous } from "./router.js";
export type Classification = Decision | {
    failure: string;
};
export declare function localSimple(text: string, previous: Previous | null, material: boolean): Decision | null;
export declare function askJev(config: ConfigValues, key: string, state: unknown, askRelation: boolean, signal?: AbortSignal): Promise<Classification>;
