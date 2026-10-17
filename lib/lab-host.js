import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { RouterLab, localOperator } from './lab.js';
import { UpdateChecker, identifySource } from './updates.js';
import { readConfig } from './config.js';
export function mountLab(ctx, config, recordFor) {
    const profile = ctx.get('profileContext');
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const lab = new RouterLab(() => readConfig(config), profile?.dir ?? 'unavailable', manifest.version);
    const updates = new UpdateChecker();
    let ready = Promise.resolve();
    let closed = false;
    let installation = { version: manifest.version, installedCommit: null, declaredCommit: null, sourceKind: 'unknown', profile: profile?.name ?? null, targetDsh: '0.2.1-alpha.2' };
    ctx.provide('adaptiveRouterLab', { lab, updates, get ready() { return ready; } });
    ctx.inject(['storageDomain'], child => { if (!profile?.dir)
        return; ready = lab.open(child.get('storageDomain')); child.effect(() => async () => { await ready; await lab.close(); }); });
    ctx.on('session/event', (session, event) => {
        if (!readConfig(config).labEnabled)
            return;
        try {
            const record = recordFor(String(session.id));
            if (record)
                lab.decision(String(session.id), record);
            lab.observe(session, event);
        }
        catch { /* Lab must never fail a native Session append. */ }
    });
    ctx.on('agent/request-error', async ({ agent, turn, failure }, next) => { if (readConfig(config).labEnabled && failure.code === CONTEXT_WINDOW_EXCEEDED_CODE)
        lab.overflow(String(agent.session.id), turn); return next(); }, { prepend: true });
    ctx.on('agent/disposed', ({ agent }) => lab.forget(String(agent.session.id)));
    ctx.on('session/disposed', session => lab.forget(String(session.id)));
    const on = ctx.on.bind(ctx);
    on('settings/document-updated', () => lab.sync());
    ctx.inject(['connection', 'webServer'], child => {
        const connection = child.connection;
        const inspectInstallation = async () => {
            let next = { version: manifest.version, ...identifySource(), profile: profile?.name ?? null, targetDsh: '0.2.1-alpha.2' };
            try {
                const bundles = await child.get('pluginManager')?.listBundles();
                const bundle = bundles?.find((b) => b.name === manifest.name);
                next = { ...next, ...identifySource(bundle?.source), version: bundle?.version ?? manifest.version };
            }
            catch { /* Failed public discovery must not reuse stale source evidence. */ }
            installation = next;
            return next;
        };
        const handle = async (endpoint, payload, _signal, peer) => {
            const denied = (reason) => ({ ok: false, error: { code: 'lab/forbidden', message: reason === 'environment' ? '当前环境无法查看实验数据' : '当前账户无权执行此操作', details: { reason } } });
            if (closed)
                return { ok: false, error: { code: 'lab/disconnected', message: '连接已断开，请重试', details: {} } };
            if (!localOperator(connection, child.get('webServer'), peer)) {
                const server = child.get('webServer');
                return denied(connection.allowsRemoteAuthorities !== false || !['127.0.0.1', '::1', 'localhost', '[::1]'].includes(server?.host ?? '') ? 'environment' : 'permission');
            }
            try {
                const op = endpoint, args = payload?.args ?? {};
                if (!args || typeof args !== 'object' || Array.isArray(args))
                    throw Error('invalid-request');
                if (['feedback', 'clear'].includes(op) && child.get('settings')?.writable !== true)
                    return denied('permission');
                await ready;
                let value;
                if (op === 'read') {
                    if (Object.keys(args).length)
                        throw Error('invalid-request');
                    await lab.flush();
                    await inspectInstallation();
                    let storagePath = null;
                    try {
                        const descriptors = child.get('settings')?.describe({ redactSecrets: true }) ?? [];
                        const route = descriptors.find((d) => d.ns === 'storage-domain')?.value;
                        const root = descriptors.find((d) => d.ns === 'storage-json')?.value?.root;
                        if ((route?.routes?.[lab.domainName] ?? route?.backend) === 'json' && typeof root === 'string')
                            storagePath = join(root, lab.domainName + '.json');
                    }
                    catch { /* No guessed paths. */ }
                    value = { ...lab.view(), installation, update: updates.state, storagePath };
                }
                else if (op === 'feedback') {
                    if (Object.keys(args).sort().join(',') !== 'id,rating,revision' || typeof args.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(args.id) || typeof args.rating !== 'string' || !Number.isSafeInteger(args.revision))
                        throw Error('invalid-request');
                    value = await lab.feedback(args.id, args.rating, args.revision);
                }
                else if (op === 'clear') {
                    if (Object.keys(args).length !== 1 || args.confirm !== true)
                        throw Error('confirmation-required');
                    value = await lab.clear();
                }
                else if (op === 'export') {
                    if (Object.keys(args).length !== 1 || !['json', 'csv'].includes(args.format))
                        throw Error('invalid-request');
                    value = await lab.export(args.format);
                }
                else if (op === 'checkUpdates') {
                    if (Object.keys(args).length)
                        throw Error('invalid-request');
                    const evidence = await inspectInstallation();
                    value = { ...await updates.check(evidence), installation: evidence };
                }
                else
                    throw Error('unknown-operation');
                return { ok: true, value };
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : '';
                const known = { 'record-conflict': '记录已更新，请刷新后重试', 'storage-unavailable': '数据存储暂不可用', unavailable: '数据存储暂不可用' };
                const code = Object.hasOwn(known, reason) ? reason === 'unavailable' ? 'storage-unavailable' : reason : 'rejected';
                return { ok: false, error: { code: 'lab/' + code, message: code === 'rejected' ? '加载失败，请重试' : known[reason], details: {} } };
            }
        };
        // The target's rpc.handle captures a shadow Context without webServer injection.
        // Exact Fetch routes share native /api admission without taking Gateway's interceptor.
        for (const op of ['read', 'feedback', 'clear', 'export', 'checkUpdates'])
            child.effect(() => connection.fetch.register({
                path: '/api/adaptiveRouterLab/' + op, methods: ['POST'], requestBody: 'streaming',
                async fetch(request) {
                    const admission = connection.admit(request);
                    if (!admission || 'rejection' in admission)
                        return new Response(null, { status: admission?.rejection ?? 403 });
                    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
                        return new Response(null, { status: 415 });
                    const reader = request.body?.getReader();
                    let bytes = 0;
                    const parts = [];
                    try {
                        if (reader)
                            for (;;) {
                                const part = await reader.read();
                                if (part.done)
                                    break;
                                bytes += part.value.length;
                                if (bytes > 4096) {
                                    await reader.cancel();
                                    return new Response(null, { status: 413 });
                                }
                                parts.push(part.value);
                            }
                        const message = JSON.parse(Buffer.concat(parts).toString('utf8'));
                        if (message.type !== 'client-request' || typeof message.rpcId !== 'string' || !message.rpcId.length || message.rpcId.length > 128 || message.method !== 'adaptiveRouterLab/' + op)
                            return new Response(null, { status: 400 });
                        const result = await handle(op, message.payload, request.signal, admission.peer);
                        return Response.json({ type: 'server-response', rpcId: message.rpcId, result });
                    }
                    catch {
                        return new Response(null, { status: 400 });
                    }
                },
            }));
    });
    ctx.effect(() => async () => { closed = true; updates.close(); await lab.close(); });
}
