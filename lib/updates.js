// Read-only, user-triggered fixed-origin queries. No process execution or profile writes.
const api = 'https://api.github.com/repos/Xuanyi-king/DSH-Adaptive-Router';
export const repository = 'https://github.com/Xuanyi-king/DSH-Adaptive-Router';
export function identifySource(source) {
    source = source?.replace(/^(?:@[^/@:]+\/)?[^/@:]+@(?=.)/, '');
    let sourceKind = 'unknown', declaredCommit = null;
    if (source?.startsWith('link:') || source?.startsWith('workspace:'))
        sourceKind = 'link';
    else if (source && /\.tgz(?:$|[?#])/.test(source))
        sourceKind = 'tgz';
    else if (source && /github|github\.com/.test(source)) {
        const ref = source.split('#')[1];
        if (ref && /^[a-f0-9]{40}$/i.test(ref)) {
            sourceKind = 'fixed-sha';
            declaredCommit = ref;
        }
        else
            sourceKind = ref && ref !== 'main' ? 'git-tag' : 'github-main';
    }
    else if (source && /^(?:npm:|[\^~\d]|latest$|next$)/.test(source))
        sourceKind = 'npm';
    return { sourceKind, declaredCommit, installedCommit: null };
}
function newer(target, current) { const parse = (s) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(s)?.slice(1).map(Number); const a = parse(target), b = parse(current); if (!a || !b)
    return null; for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i])
        return a[i] > b[i];
} return false; }
export class UpdateChecker {
    fetcher;
    clock;
    pending;
    last = null;
    abort = new AbortController();
    constructor(fetcher = fetch, clock = () => Date.now()) {
        this.fetcher = fetcher;
        this.clock = clock;
    }
    get state() { return this.last; }
    async check(current) {
        if (this.pending)
            return this.pending;
        if (this.last && this.clock() - this.last.checkedAt < 300000)
            return this.last;
        this.pending = this.run(current).then(result => this.last = result).finally(() => { this.pending = undefined; });
        return this.pending;
    }
    async json(url) {
        const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(5000)]);
        let response;
        try {
            response = await this.fetcher(url, { signal, redirect: 'error', headers: { accept: 'application/vnd.github+json', 'user-agent': 'DSH-Adaptive-Router-read-only-update-check' } });
        }
        catch {
            throw Error(signal.aborted ? 'timeout' : 'network-unavailable');
        }
        if ([403, 429].includes(response.status)) {
            await response.body?.cancel();
            throw Error('rate-limited');
        }
        if (response.status === 404) {
            await response.body?.cancel();
            return null;
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw Error('check-failed');
        }
        const parts = [];
        let bytes = 0;
        const reader = response.body?.getReader();
        if (reader)
            for (;;) {
                const p = await reader.read();
                if (p.done)
                    break;
                bytes += p.value.length;
                if (bytes > 256 * 1024) {
                    await reader.cancel();
                    throw Error('response-too-large');
                }
                parts.push(p.value);
            }
        try {
            return JSON.parse(Buffer.concat(parts).toString('utf8'));
        }
        catch {
            throw Error('invalid-response');
        }
    }
    async run(current) {
        try {
            const [release, main] = await Promise.all([this.json(api + '/releases/latest'), this.json(api + '/commits/main')]);
            if (!main || !/^[a-f0-9]{40}$/i.test(main.sha))
                throw Error('invalid-response');
            let mainStatus = current.installedCommit === main.sha ? 'confirmed-current' : current.installedCommit ? 'comparison-unknown' : 'installed-commit-unknown', changeKind = 'unknown';
            if (current.installedCommit && /^[a-f0-9]{40}$/i.test(current.installedCommit) && current.installedCommit !== main.sha) {
                const diff = await this.json(`${api}/compare/${current.installedCommit}...${main.sha}`);
                if (diff?.status === 'ahead') {
                    mainStatus = 'development-ahead';
                    const files = Array.isArray(diff.files) ? diff.files : [];
                    changeKind = files.length && files.length < 300 && files.every((f) => typeof f.filename === 'string' && (/\.(md|txt|png|jpe?g|svg)$/i.test(f.filename) || f.filename.startsWith('docs/'))) ? 'documentation-only' : 'code-or-unknown';
                }
            }
            let releaseStatus = release ? 'release-uncomparable' : 'no-release', compatibility = 'unknown', tag = null;
            if (release && !release.draft && !release.prerelease && typeof release.tag_name === 'string' && release.tag_name.length <= 100) {
                const releaseTag = release.tag_name;
                tag = releaseTag;
                const n = newer(releaseTag, current.version);
                releaseStatus = n === true ? 'newer-release' : n === false ? 'no-newer-release' : 'release-uncomparable';
                const pkg = await this.json(`${api}/contents/package.json?ref=${encodeURIComponent(releaseTag)}`);
                if (pkg?.encoding === 'base64' && typeof pkg.content === 'string') {
                    try {
                        const manifest = JSON.parse(Buffer.from(pkg.content, 'base64').toString('utf8'));
                        const peers = Object.entries(manifest.peerDependencies ?? {}).filter(([k]) => k.startsWith('@deepseek-ai/dsh-'));
                        if (peers.length && peers.every(([, v]) => v === current.targetDsh))
                            compatibility = 'declared-target-match';
                        else if (peers.length && peers.some(([, v]) => typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v) && v !== current.targetDsh))
                            compatibility = 'target-mismatch';
                    }
                    catch { /* Unreadable declaration never establishes compatibility. */ }
                }
            }
            let npmStatus = 'not-checked';
            if (current.sourceKind === 'npm') {
                const pkg = await this.json('https://registry.npmjs.org/dsh-plugin-adaptive-router/latest');
                npmStatus = !pkg ? 'no-release' : newer(pkg.version, current.version) === true ? 'newer-version' : 'comparison-unknown';
            }
            return { checkedAt: this.clock(), releaseStatus, tag, mainStatus, mainCommit: main.sha, changeKind, compatibility, npmStatus, error: null, repository };
        }
        catch (error) {
            const known = ['rate-limited', 'timeout', 'network-unavailable', 'response-too-large', 'invalid-response'];
            return { checkedAt: this.clock(), error: known.includes(error.message) ? error.message : 'check-failed', repository };
        }
    }
    close() { this.abort.abort(); }
}
