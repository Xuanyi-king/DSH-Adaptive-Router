// Optional observation layer. Never called from Provider admission or awaited by routing.
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { engineFor } from './diagnostics.js';
const textFields = ['experimentConfigRevision', 'routingMode', 'classifierEngine', 'classifierModel', 'sessionScope', 'source', 'tier', 'role', 'relation', 'confidenceKind', 'plannedProvider', 'plannedModel', 'plannedEffort', 'actualProvider', 'actualModel', 'actualEffort', 'control', 'reasonCode', 'turnFinishReason', 'usageSource', 'durationSource', 'qualitySource', 'rating'];
const numberFields = ['turnNumber', 'confidence', 'classifierElapsedMs', 'elapsedMs', 'modelRequestCount', 'toolStepCount', 'retryCount', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens', 'feedbackTimestamp'];
const tokenFields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'];
const textShape = Object.fromEntries(textFields.map(k => [k, z.string().max(160).nullable()]));
const numberShape = Object.fromEntries(numberFields.map(k => [k, z.number().finite().nonnegative().nullable()]));
const rowSchema = z.object({ schemaVersion: z.literal(1), recordId: z.string().uuid(), timestamp: z.number().nonnegative(), revision: z.number().int().positive(), routerBuildVersion: z.string().max(80), routerBuildCommit: z.string().max(40).nullable(), fallbackApplied: z.boolean(), routesTruncated: z.boolean(),
    routes: z.array(z.object({ provider: z.string().max(160), model: z.string().max(160), count: z.number().int().nonnegative(), efforts: z.record(z.string().max(80), z.number().int().nonnegative()) }).strict()).max(16),
    ...textShape, ...numberShape }).strict().refine(r => Buffer.byteLength(JSON.stringify(r)) <= 4096);
const snapshotSchema = z.object({ schemaVersion: z.literal(1), salt: z.string().uuid(), records: z.array(rowSchema).max(5000) }).strict();
const accepted = new Set(['turn/start', 'turn/end', 'step/start', 'request/header', 'tool/call', 'assistant/message', 'assistant/attempt', 'llm/retry-started']);
const str = (v) => typeof v === 'string' && v.length <= 160 ? v : null;
const count = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const blank = () => ({ schemaVersion: 1, salt: randomUUID(), records: [] });
export function localOperator(connection, server, peer) {
    return !!connection?.operator && peer === connection.operator && connection.allowsRemoteAuthorities === false
        && ['127.0.0.1', '::1', 'localhost', '[::1]'].includes(server?.host);
}
export function summarize(rows) {
    const totals = Object.fromEntries(tokenFields.map(k => [k, { value: 0, coverage: 0 }]));
    const controls = {}, outcomes = {}, feedback = {}, models = new Map();
    let classified = 0, elapsed = 0, latencyCount = 0;
    for (const r of rows) {
        controls[r.control ?? 'unknown'] = (controls[r.control ?? 'unknown'] ?? 0) + 1;
        outcomes[r.turnFinishReason ?? 'unknown'] = (outcomes[r.turnFinishReason ?? 'unknown'] ?? 0) + 1;
        if (r.rating)
            feedback[r.rating] = (feedback[r.rating] ?? 0) + 1;
        if (r.tier)
            classified++;
        if (r.tier && ['Jev', 'NeoHorse'].includes(r.source ?? '') && r.classifierElapsedMs !== null) {
            elapsed += r.classifierElapsedMs;
            latencyCount++;
        }
        for (const k of tokenFields)
            if (r[k] !== null) {
                totals[k].value += r[k];
                totals[k].coverage++;
            }
        for (const route of r.routes) {
            const key = JSON.stringify([route.provider, route.model]);
            const m = models.get(key) ?? { provider: route.provider, model: route.model, requests: 0, efforts: Object.create(null), tiers: Object.create(null) };
            m.requests += route.count;
            for (const [effort, n] of Object.entries(route.efforts))
                m.efforts[effort] = (m.efforts[effort] ?? 0) + n;
            m.tiers[r.tier ?? 'unknown'] = (m.tiers[r.tier ?? 'unknown'] ?? 0) + route.count;
            models.set(key, m);
        }
    }
    for (const k of tokenFields)
        if (!totals[k].coverage)
            totals[k].value = null;
    return { turns: rows.length, classified, controls, outcomes, feedback, feedbackCount: Object.values(feedback).reduce((a, b) => a + b, 0), fallbackApplied: rows.filter(r => r.fallbackApplied).length,
        tokenCoverage: rows.filter(r => r.inputTokens !== null && r.outputTokens !== null).length, tokens: totals, classifierLatency: { meanMs: latencyCount ? elapsed / latencyCount : null, coverage: latencyCount },
        models: [...models.values()].slice(0, 50), modelsTruncated: models.size > 50, distributionTruncated: rows.filter(r => r.routesTruncated).length, configRevisions: new Set(rows.map(r => r.experimentConfigRevision)).size };
}
const csvColumns = ['schemaVersion', 'recordId', 'timestamp', 'routerBuildVersion', 'routerBuildCommit', ...textFields, ...numberFields, 'fallbackApplied'];
export function exportCsv(rows) { const cell = (v) => { let s = v == null ? '' : String(v); if (/^[\s]*[=+\-@\t\r\n]/u.test(s))
    s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }; return '\uFEFF' + csvColumns.join(',') + '\r\n' + rows.map(r => csvColumns.map(k => cell(r[k])).join(',')).join('\r\n'); }
export class RouterLab {
    config;
    version;
    clock;
    domain;
    rows = [];
    salt = randomUUID();
    pending = new Map();
    active = new Map();
    timer;
    chain = Promise.resolve();
    epoch = 0;
    closed = false;
    clearing = false;
    error = null;
    dropped = 0;
    domainName;
    constructor(config, scope, version, clock = () => Date.now()) {
        this.config = config;
        this.version = version;
        this.clock = clock;
        this.domainName = 'adaptive_router_lab_' + createHash('sha256').update(scope).digest('hex').slice(0, 16);
    }
    async open(storage) {
        try {
            this.domain = await storage.open({ name: this.domainName, version: 1, tables: {}, global: { schema: snapshotSchema, initial: blank() } });
            if (this.closed) {
                await this.domain.close();
                return;
            }
            const saved = snapshotSchema.parse(this.domain.global.get());
            this.salt = saved.salt;
            this.rows = this.prune(saved.records);
            if (this.rows.length !== saved.records.length)
                await this.domain.global.set({ schemaVersion: 1, salt: this.salt, records: this.rows });
        }
        catch {
            await this.domain?.close().catch(() => { });
            this.domain = undefined;
            this.error = 'storage-unavailable';
        }
    }
    sync() { if (!this.config().enabled || !this.config().labEnabled)
        this.active.clear(); }
    decision(sessionId, decision) {
        const a = this.active.get(String(sessionId));
        if (!a || (decision.turn !== undefined && decision.turn !== a.row.turnNumber))
            return;
        const r = a.row;
        // Later manual/native passes have no new classification; do not erase known facts.
        if (str(decision.source) !== null)
            r.source = str(decision.source);
        if (str(decision.tier) !== null) {
            r.tier = str(decision.tier);
            r.role = str(decision.role);
            r.relation = str(decision.relation);
            r.confidence = typeof decision.confidence === 'number' && decision.confidence >= 0 && decision.confidence <= 1 ? decision.confidence : null;
            r.confidenceKind = r.confidence === null ? 'unknown' : r.source === 'NeoHorse' ? 'distribution-statistic' : r.source === 'Local' ? 'local-rule' : 'jev-reported';
        }
        if (count(decision.elapsedMs) !== null)
            r.classifierElapsedMs = count(decision.elapsedMs);
        r.control = str(decision.control);
        r.reasonCode = typeof decision.reason === 'string' && /^[a-z0-9-]{1,64}$/.test(decision.reason) ? decision.reason : 'unknown';
        if (decision.selection) {
            r.plannedProvider = str(decision.selection.provider);
            r.plannedModel = str(decision.selection.model);
            r.plannedEffort = str(decision.selection.reasoningEffort);
        }
        r.fallbackApplied = r.fallbackApplied || decision.fallbackApplied === true;
    }
    observe(session, event) {
        if (!accepted.has(event.type) || this.closed)
            return;
        try {
            const c = this.config();
            if (!c.enabled || !c.labEnabled) {
                this.active.clear();
                return;
            }
            if (!this.domain || this.clearing || session.header.origin === 'subagent') {
                if (event.type === 'turn/start' && session.header.origin !== 'subagent')
                    this.dropped++;
                return;
            }
            const id = String(session.id), d = event.data;
            if (event.type === 'turn/start') {
                if (this.active.size >= 64 && !this.active.has(id)) {
                    this.dropped++;
                    return;
                }
                const strings = Object.fromEntries(textFields.map(k => [k, null])), numbers = Object.fromEntries(numberFields.map(k => [k, null]));
                const fingerprint = { mode: c.mode, lockModel: c.lockModel, lockEffort: c.lockEffort, fixedEffort: c.fixedEffort, candidates: c.candidates, threshold: c.confidenceThreshold, classifierModel: c.classifierModel, apiUrl: c.apiUrl, apiKeyEnv: c.apiKeyEnv };
                const hash = (s) => createHmac('sha256', this.salt).update(s).digest('hex').slice(0, 32);
                const row = { ...strings, ...numbers, schemaVersion: 1, recordId: randomUUID(), timestamp: event.time, revision: 1, routerBuildVersion: this.version, routerBuildCommit: null,
                    experimentConfigRevision: hash(JSON.stringify(fingerprint)), sessionScope: hash(id), routingMode: c.mode, classifierEngine: engineFor(c), classifierModel: str(c.classifierModel), turnNumber: d.turn,
                    modelRequestCount: 0, toolStepCount: 0, usageSource: 'unavailable', durationSource: 'observed', qualitySource: 'unknown', fallbackApplied: false, routes: [], routesTruncated: false };
                this.active.set(id, { row, lastSeq: event.seq, lastTool: -1, lastStep: 0 });
                return;
            }
            const a = this.active.get(id);
            if (!a || event.seq <= a.lastSeq || (d.turn !== undefined && d.turn !== a.row.turnNumber))
                return;
            a.lastSeq = event.seq;
            const r = a.row;
            const header = session.requestHeader().config;
            r.actualProvider = str(header.provider);
            r.actualModel = str(header.model);
            r.actualEffort = str(header.reasoningEffort);
            if (event.type === 'step/start')
                a.lastStep = d.step;
            if (event.type === 'tool/call' && a.lastTool !== d.step) {
                a.lastTool = d.step;
                r.toolStepCount++;
            }
            if (event.type === 'llm/retry-started')
                r.retryCount = (r.retryCount ?? 0) + 1;
            if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
                const usage = d.usage ?? d.stream?.findLast((s) => s.type === 'chunk' && s.chunk?.type === 'usage')?.chunk.usage;
                const first = r.modelRequestCount === 0;
                r.modelRequestCount++;
                for (const k of tokenFields) {
                    const n = count(usage?.[k]);
                    r[k] = first ? n : r[k] === null || n === null ? null : r[k] + n;
                    if (r[k] !== null && !Number.isSafeInteger(r[k]))
                        r[k] = null;
                }
                r.usageSource = r.inputTokens !== null && r.outputTokens !== null ? 'provider-reported' : (usage || r.usageSource !== 'unavailable') ? 'provider-reported-partial' : 'unavailable';
                const provider = r.actualProvider ?? 'unknown', model = r.actualModel ?? 'unknown', effort = r.actualEffort ?? 'default';
                let route = r.routes.find(m => m.provider === provider && m.model === model);
                if (!route && r.routes.length < 16) {
                    route = { provider, model, count: 0, efforts: {} };
                    r.routes.push(route);
                }
                if (route) {
                    route.count++;
                    const known = Object.hasOwn(route.efforts, effort);
                    if (effort.length > 80 || (!known && Object.keys(route.efforts).length >= 16))
                        r.routesTruncated = true;
                    else
                        Object.defineProperty(route.efforts, effort, { value: (known ? route.efforts[effort] : 0) + 1, enumerable: true, configurable: true, writable: true });
                }
                else
                    r.routesTruncated = true;
            }
            if (event.type === 'turn/end') {
                this.active.delete(id);
                r.turnFinishReason = ['completed', 'error', 'aborted', 'interrupted', 'blocked', 'max-tokens', 'forked'].includes(d.reason?.kind) ? d.reason.kind : 'unknown';
                r.elapsedMs = event.time >= r.timestamp ? event.time - r.timestamp : null;
                r.durationSource = r.elapsedMs === null ? 'unavailable' : 'observed';
                if (r.plannedProvider && (r.plannedProvider !== r.actualProvider || r.plannedModel !== r.actualModel || (r.plannedEffort ?? null) !== r.actualEffort) && !['Blocked', 'Conflict', 'Manual'].includes(r.control ?? '')) {
                    r.control = 'Native';
                    r.reasonCode = 'native-override';
                }
                if (!rowSchema.safeParse(r).success) {
                    this.dropped++;
                    return;
                }
                this.pending.set(r.recordId, r);
                if (this.pending.size > 128) {
                    this.pending.delete(this.pending.keys().next().value);
                    this.dropped++;
                }
                if (!this.timer)
                    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 1000);
            }
        }
        catch {
            this.error = 'observation-failed';
        }
    }
    forget(sessionId) { this.active.delete(String(sessionId)); }
    prune(rows) { let result = rows.filter(r => r.timestamp >= this.clock() - 90 * 86400000).sort((a, b) => a.timestamp - b.timestamp).slice(-5000); let bytes = result.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r)), 0); while (bytes > 8 * 1024 * 1024 - 65536 && result.length)
        bytes -= Buffer.byteLength(JSON.stringify(result.shift())); return result; }
    serial(fn) { const job = this.chain.then(fn); this.chain = job.catch(() => { }); return job; }
    async flush() {
        clearTimeout(this.timer);
        this.timer = undefined;
        if (!this.domain)
            return;
        const epoch = this.epoch;
        await this.serial(async () => {
            if (epoch !== this.epoch)
                return;
            const batch = [...this.pending.values()];
            this.pending.clear();
            const rows = this.prune([...this.rows, ...batch]);
            if (!batch.length && rows.length === this.rows.length)
                return;
            try {
                await this.domain.global.set({ schemaVersion: 1, salt: this.salt, records: rows });
                this.rows = rows;
                this.error = null;
            }
            catch {
                if (epoch !== this.epoch)
                    return;
                for (const r of batch)
                    if (!this.pending.has(r.recordId))
                        this.pending.set(r.recordId, r);
                while (this.pending.size > 128) {
                    this.pending.delete(this.pending.keys().next().value);
                    this.dropped++;
                }
                this.error = 'write-failed';
            }
        });
    }
    async feedback(id, rating, revision) {
        if (!['met', 'rework', 'unknown'].includes(rating))
            throw Error('invalid-rating');
        await this.flush();
        const epoch = this.epoch;
        return this.serial(async () => {
            if (this.closed || epoch !== this.epoch || !this.domain)
                throw Error('unavailable');
            const index = this.rows.findIndex(r => r.recordId === id);
            if (index < 0 || this.rows[index].revision !== revision)
                throw Error('record-conflict');
            const rows = this.rows.slice();
            rows[index] = { ...rows[index], rating, feedbackTimestamp: this.clock(), qualitySource: 'user-feedback', revision: revision + 1 };
            await this.domain.global.set({ schemaVersion: 1, salt: this.salt, records: rows });
            this.rows = rows;
            return this.view();
        });
    }
    async clear() {
        this.clearing = true;
        this.epoch++;
        this.active.clear();
        this.pending.clear();
        clearTimeout(this.timer);
        this.timer = undefined;
        return this.serial(async () => { if (this.closed || !this.domain)
            throw Error('unavailable'); const next = blank(); await this.domain.global.set(next); this.rows = []; this.pending.clear(); this.salt = next.salt; this.error = null; return this.view(); }).finally(() => { this.clearing = false; });
    }
    view() { return { available: !!this.domain && !this.closed, domain: this.domainName, error: this.error, clearing: this.clearing, pending: this.pending.size, dropped: this.dropped, summary: summarize(this.rows), recent: structuredClone(this.rows.slice(-25).reverse()) }; }
    async export(format) { await this.flush(); if (!this.domain || this.error)
        throw Error('storage-unavailable'); if (format === 'csv')
        return exportCsv(this.rows); if (format !== 'json')
        throw Error('invalid-format'); return { schemaVersion: 1, exportedAt: new Date(this.clock()).toISOString(), experimentMetadata: { unit: 'DSH Turn', observational: true, causalEvidence: false }, records: structuredClone(this.rows), dataQualitySummary: summarize(this.rows) }; }
    async close() { this.closed = true; this.active.clear(); await this.flush(); await this.chain; await this.domain?.close(); }
}
