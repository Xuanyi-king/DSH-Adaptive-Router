import { z } from 'zod';
import type { ConfigValues } from './config.js';
declare const textFields: readonly ["experimentConfigRevision", "routingMode", "classifierEngine", "classifierModel", "sessionScope", "source", "tier", "role", "relation", "confidenceKind", "plannedProvider", "plannedModel", "plannedEffort", "actualProvider", "actualModel", "actualEffort", "control", "reasonCode", "turnFinishReason", "usageSource", "durationSource", "qualitySource", "rating"];
declare const numberFields: readonly ["turnNumber", "confidence", "classifierElapsedMs", "elapsedMs", "modelRequestCount", "toolStepCount", "retryCount", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "feedbackTimestamp"];
type Route = {
    provider: string;
    model: string;
    count: number;
    efforts: Record<string, number>;
};
export type LabRow = {
    schemaVersion: 1;
    recordId: string;
    timestamp: number;
    revision: number;
    routerBuildVersion: string;
    routerBuildCommit: string | null;
    fallbackApplied: boolean;
    routes: Route[];
    routesTruncated: boolean;
} & Record<typeof textFields[number], string | null> & Record<typeof numberFields[number], number | null>;
declare const snapshotSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    salt: z.ZodString;
    records: z.ZodArray<z.ZodType<LabRow, unknown, z.core.$ZodTypeInternals<LabRow, unknown>>>;
}, z.core.$strict>;
type Snapshot = z.infer<typeof snapshotSchema>;
export interface LabDomain {
    global: {
        get(): Snapshot;
        set(value: Snapshot): Promise<void>;
    };
    close(): Promise<void>;
}
export interface LabStorage {
    open(spec: object): Promise<LabDomain>;
}
export declare function localOperator(connection: any, server: any, peer: unknown): boolean;
export declare function summarize(rows: LabRow[]): {
    turns: number;
    classified: number;
    controls: Record<string, number>;
    outcomes: Record<string, number>;
    feedback: Record<string, number>;
    feedbackCount: number;
    fallbackApplied: number;
    tokenCoverage: number;
    tokens: {
        [k: string]: {
            value: number;
            coverage: number;
        };
    };
    classifierLatency: {
        meanMs: number | null;
        coverage: number;
    };
    models: any[];
    modelsTruncated: boolean;
    distributionTruncated: number;
    configRevisions: number;
};
export declare function exportCsv(rows: LabRow[]): string;
export declare class RouterLab {
    private config;
    private version;
    private clock;
    private domain?;
    private rows;
    private salt;
    private pending;
    private active;
    private timer?;
    private chain;
    private epoch;
    private closed;
    private clearing;
    error: string | null;
    dropped: number;
    readonly domainName: string;
    constructor(config: () => ConfigValues, scope: string, version: string, clock?: () => number);
    open(storage: LabStorage): Promise<void>;
    sync(): void;
    decision(sessionId: string, decision: any): void;
    observe(session: any, event: any): void;
    forget(sessionId: string): void;
    private prune;
    private serial;
    flush(): Promise<void>;
    feedback(id: string, rating: string, revision: number): Promise<{
        available: boolean;
        domain: string;
        error: string | null;
        clearing: boolean;
        pending: number;
        dropped: number;
        summary: {
            turns: number;
            classified: number;
            controls: Record<string, number>;
            outcomes: Record<string, number>;
            feedback: Record<string, number>;
            feedbackCount: number;
            fallbackApplied: number;
            tokenCoverage: number;
            tokens: {
                [k: string]: {
                    value: number;
                    coverage: number;
                };
            };
            classifierLatency: {
                meanMs: number | null;
                coverage: number;
            };
            models: any[];
            modelsTruncated: boolean;
            distributionTruncated: number;
            configRevisions: number;
        };
        recent: LabRow[];
    }>;
    clear(): Promise<{
        available: boolean;
        domain: string;
        error: string | null;
        clearing: boolean;
        pending: number;
        dropped: number;
        summary: {
            turns: number;
            classified: number;
            controls: Record<string, number>;
            outcomes: Record<string, number>;
            feedback: Record<string, number>;
            feedbackCount: number;
            fallbackApplied: number;
            tokenCoverage: number;
            tokens: {
                [k: string]: {
                    value: number;
                    coverage: number;
                };
            };
            classifierLatency: {
                meanMs: number | null;
                coverage: number;
            };
            models: any[];
            modelsTruncated: boolean;
            distributionTruncated: number;
            configRevisions: number;
        };
        recent: LabRow[];
    }>;
    view(): {
        available: boolean;
        domain: string;
        error: string | null;
        clearing: boolean;
        pending: number;
        dropped: number;
        summary: {
            turns: number;
            classified: number;
            controls: Record<string, number>;
            outcomes: Record<string, number>;
            feedback: Record<string, number>;
            feedbackCount: number;
            fallbackApplied: number;
            tokenCoverage: number;
            tokens: {
                [k: string]: {
                    value: number;
                    coverage: number;
                };
            };
            classifierLatency: {
                meanMs: number | null;
                coverage: number;
            };
            models: any[];
            modelsTruncated: boolean;
            distributionTruncated: number;
            configRevisions: number;
        };
        recent: LabRow[];
    };
    export(format: string): Promise<string | {
        schemaVersion: number;
        exportedAt: string;
        experimentMetadata: {
            unit: string;
            observational: boolean;
            causalEvidence: boolean;
        };
        records: LabRow[];
        dataQualitySummary: {
            turns: number;
            classified: number;
            controls: Record<string, number>;
            outcomes: Record<string, number>;
            feedback: Record<string, number>;
            feedbackCount: number;
            fallbackApplied: number;
            tokenCoverage: number;
            tokens: {
                [k: string]: {
                    value: number;
                    coverage: number;
                };
            };
            classifierLatency: {
                meanMs: number | null;
                coverage: number;
            };
            models: any[];
            modelsTruncated: boolean;
            distributionTruncated: number;
            configRevisions: number;
        };
    }>;
    close(): Promise<void>;
}
export {};
