export declare const repository = "https://github.com/Xuanyi-king/DSH-Adaptive-Router";
export declare function identifySource(source?: string): {
    sourceKind: string;
    declaredCommit: string | null;
    installedCommit: null;
};
export interface Installation {
    version: string;
    sourceKind: string;
    installedCommit: string | null;
    declaredCommit: string | null;
    profile: string | null;
    targetDsh: string;
}
export declare class UpdateChecker {
    private fetcher;
    private clock;
    private pending?;
    private last;
    private evidenceKey;
    private abort;
    constructor(fetcher?: typeof fetch, clock?: () => number);
    get state(): any;
    check(current: Installation): Promise<any>;
    private compare;
    private json;
    private run;
    close(): void;
}
