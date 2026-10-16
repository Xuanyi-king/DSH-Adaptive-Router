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
            if (/(?:^github:|github\.com[/:])Xuanyi-king\/DSH-Adaptive-Router(?:\.git)?#/i.test(source))
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
    evidenceKey = null;
    abort = new AbortController();
    constructor(fetcher = fetch, clock = () => Date.now()) {
        this.fetcher = fetcher;
        this.clock = clock;
    }
    get state() { return this.last; }
    async check(current) {
        const key = JSON.stringify(current);
        if (this.pending) {
            await this.pending;
            return this.check(current);
        }
        if (this.last && key === this.evidenceKey && this.clock() - this.last.checkedAt < 300000)
            return this.last;
        this.pending = this.run(current).then(result => { this.evidenceKey = key; return this.last = result; }).finally(() => { this.pending = undefined; });
        return this.pending;
    }
    async compare(current, head) {
        const valid = (sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha);
        const basis = valid(current.installedCommit) ? 'installed' : valid(current.declaredCommit) ? 'declared' : null;
        const commit = basis === 'installed' ? current.installedCommit : basis === 'declared' ? current.declaredCommit : null;
        const result = { basis, commit, head, status: 'unknown', changeKind: 'unknown', filesComplete: false, aheadBy: null, behindBy: null, error: null };
        if (!commit)
            return result;
        if (commit.toLowerCase() === head.toLowerCase())
            return { ...result, status: 'identical', changeKind: 'no-file-changes', filesComplete: true, aheadBy: 0, behindBy: 0 };
        try {
            const diff = await this.json(`${api}/compare/${commit}...${head}`);
            if (!diff)
                return { ...result, status: 'unavailable', error: 'comparison-not-found' };
            const count = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
            if (!['ahead', 'behind', 'identical', 'diverged'].includes(diff.status) || diff.base_commit?.sha?.toLowerCase() !== commit.toLowerCase()
                || !count(diff.ahead_by) || !count(diff.behind_by) || !count(diff.total_commits) || diff.total_commits !== diff.ahead_by
                || !(diff.status === 'ahead' ? diff.ahead_by > 0 && diff.behind_by === 0 : diff.status === 'behind' ? diff.ahead_by === 0 && diff.behind_by > 0 : diff.status === 'diverged' ? diff.ahead_by > 0 && diff.behind_by > 0 : diff.ahead_by === 0 && diff.behind_by === 0))
                return { ...result, error: 'invalid-comparison' };
            if (diff.status === 'identical')
                return { ...result, error: 'invalid-comparison' };
            result.status = diff.status;
            result.aheadBy = diff.ahead_by;
            result.behindBy = diff.behind_by;
            // Unpaginated Compare returns <=250 commits and <=300 files. At either
            // boundary, or without a complete commit disclosure, do not claim docs-only.
            const files = diff.files;
            result.filesComplete = diff.status === 'ahead' && diff.total_commits < 250 && Array.isArray(diff.commits) && diff.commits.length === diff.total_commits && diff.commits.every((c) => typeof c.sha === 'string' && /^[a-f0-9]{40}$/i.test(c.sha)) && diff.commits.at(-1)?.sha?.toLowerCase() === head.toLowerCase()
                && Array.isArray(files) && files.length < 300 && diff.truncated !== true && diff.files_truncated !== true
                && files.every((f) => typeof f.filename === 'string' && ['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'].includes(f.status) && (f.status !== 'renamed' || typeof f.previous_filename === 'string'));
            const documentation = (path) => /\.(md|mdx|rst|txt|png|jpe?g|svg|webp)$/i.test(path);
            if (result.filesComplete && diff.status === 'ahead')
                result.changeKind = !files.length ? 'no-file-changes' : files.every((f) => documentation(f.filename) && (f.previous_filename === undefined || typeof f.previous_filename === 'string' && documentation(f.previous_filename))) ? 'documentation-only' : 'code-or-unknown';
            return result;
        }
        catch (error) {
            const code = error.message;
            return { ...result, status: 'unavailable', error: ['rate-limited', 'timeout', 'network-unavailable', 'response-too-large', 'invalid-response'].includes(code) ? code : 'comparison-failed' };
        }
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
            const comparison = await this.compare(current, main.sha);
            const mainStatus = comparison.basis !== 'installed' ? 'installed-commit-unknown' : comparison.status === 'ahead' ? 'development-ahead' : comparison.status === 'behind' ? 'installed-ahead' : comparison.status === 'diverged' ? 'diverged' : current.installedCommit?.toLowerCase() === main.sha.toLowerCase() ? 'confirmed-current' : 'comparison-unknown';
            const changeKind = comparison.basis === 'installed' ? comparison.changeKind : 'unknown';
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
            return { checkedAt: this.clock(), releaseStatus, tag, mainStatus, mainCommit: main.sha, comparison, changeKind, compatibility, npmStatus, error: null, repository };
        }
        catch (error) {
            const known = ['rate-limited', 'timeout', 'network-unavailable', 'response-too-large', 'invalid-response'];
            return { checkedAt: this.clock(), error: known.includes(error.message) ? error.message : 'check-failed', repository };
        }
    }
    close() { this.abort.abort(); }
}
