import type { ConfigValues } from './config.js';
import type { Selection } from './router.js';
export type Engine = 'Jev' | 'NeoHorse';
export declare const engineFor: (config: Pick<ConfigValues, "classifierModel">) => Engine;
export declare function validEndpoint(value: string): boolean;
export declare const presets: {
    jev: string;
    'neohorse-hosted': string;
    'neohorse-local': string;
    custom: string;
};
export declare function presetPatch(id: string, config: Pick<ConfigValues, 'apiKeyEnv'>): Partial<ConfigValues>;
export declare function explainReason(code: string): {
    reason: string;
    action: string;
};
export interface SetupFacts {
    catalog: {
        groups: {
            id: string;
            models: {
                id: string;
                reasoning?: {
                    efforts: {
                        id: string;
                    }[];
                };
            }[];
        }[];
    } | null;
    current?: Selection | null;
    keyAvailable?: boolean;
    verified?: boolean;
    conflict?: boolean;
    failure?: string;
    nativeManual?: boolean;
}
export declare function readiness(config: ConfigValues, facts: SetupFacts): {
    action: string;
    reason: string;
    state: string;
    code: string;
};
