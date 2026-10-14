# Third-party notices

## Directly reused / adapted code

**Jev Effort Selector** — https://github.com/justhalfbit/dsh-plugin-jev-effort-selector

MIT; Copyright (c) 2026 半格 / HalfBit.

- `lib/index.js` → `src/context.js`: extracted message text reading, clipping, fresh turn,
  context initialization, event fold and context envelope. Kept JavaScript. Added actual
  provider/model inheritance and image presence; renamed the projection.
- `lib/index.js` `deriveLadder` → `src/router.ts`: adapted adapter-ordered effort ladder;
  deduplicated results and added validated per-tier mappings.
- `lib/index.js` `askJev`, `resolveKey`, `readConfig`, pre-step/request/manual/abort
  mechanisms → `src/classifier.ts`, `src/index.ts`, `src/config.ts`: adapted to a single
  capability-tier/role classifier, registered model pool, four modes and current DSH.
- `lib/client.js` Slot/Projection/SRC Remote pattern → `src/client.js`: independently
  reduced to a small actual-header chip; no upstream UI layout, icons or settings form copied.

The full required MIT copyright and permission notice is shipped in
[licenses/jev-effort-selector-MIT.txt](licenses/jev-effort-selector-MIT.txt).
Compiled copies in `lib/` derive from the same source and have the same attribution.

## Design references (no source code copied)

| Project | Repository | License | Reference scope |
| --- | --- | --- | --- |
| Pi Model Router | https://github.com/iariap/pi-model-router | MIT, Copyright (c) 2026 Pablo Iaria | Candidate allowlists, role/model/thinking matching, supported-thinking validation. No Pi runtime or model catalog copied. |
| LiteLLM | https://github.com/BerriAI/litellm | MIT for reviewed non-enterprise code, Copyright (c) 2023 Berri AI | Complexity tiers, conservative heuristic gating, classification fallback, session continuity. No enterprise code copied. |
| OpenSquilla | https://github.com/TokenRhythm/opensquilla | Apache-2.0 | Surface-feature gating, history-sensitive routing and joint route/thinking design. No source, weights or runtime copied; no Apache derivative distributed. |
| Jevcore | https://github.com/PerryLink/jevcore | Apache-2.0 | Evaluated independent SystemOne/Choice client and resilience costs. Not included as code or dependency; its NOTICE was reviewed. |
| DeepSeek Harness | https://github.com/deepseek-ai/deepseek-harness | MIT, Copyright (c) 2026 DeepSeek | Public lifecycle, metadata, projection, settings, bundle and slot contracts. Core is unmodified; the native `dsh-system-prompt` peer supplies public prompt rendering, and other npm packages are development test dependencies. No DSH source copied into the production plugin. |

Reviewed commit identifiers and source paths are in [docs/RESEARCH.md](docs/RESEARCH.md).

## Runtime npm dependencies

- `@deepseek-ai/schemastery`: MIT; configuration schema validation. Distributed by npm with its own license.
- `zod`: MIT; projection state validation. Distributed by npm with its own license.

No Python, proxy, ML runtime or model weights are bundled. Lockfile records the
actual development test dependencies; their license files remain in their npm packages.
