# S2 上游算法复用审查

2026-10-14；基线为已合并 PR #1 的 main `ea0853d8138379bb4f14fea02ed999bfad27d125`。
目标仍为 DSH `0.2.1-alpha.2`。先读本项目 README、package、六个 Host/策略源码、研究/验证/许可记录与两份测试，再读取以下上游实际源码。

**结论：保留现有联合路由，只恢复 Jev `deriveLadder` 中被简化掉的中点回退。**没有引入另一个分类器、路由框架、运行时依赖或 UI。结论限于这些固定版本及确定性场景，不宣称线上模型匹配准确率提高。

## 1. 审查版本、源码与复用成本

链接固定到本次实际读取的提交。下表编号也用于能力对照；具体路径在文末源码索引。

| 项目 / 提交 | 实际源码与判断 | 许可证 / 直接使用成本 | 适配与决定 |
| --- | --- | --- | --- |
| Jev Effort Selector `9b8ac7dd8668b936dbd3cde1c93c12eecbf3fca8` | [`lib/index.js`][J] `foldContext/contextBlock/deriveLadder/askJev/resolveKey/pendingPick`，pre-step/request；另读 DESIGN、package、bundle 和 [JW] Web 集成 | MIT，2026 半格 / HalfBit；与当前相同的 Schemastery、Zod 依赖 | **B，保留已提取核心**；纯函数可直接提取，但包只导出插件入口，不能安全导入内部函数。恢复 ladder 的一小段原始逻辑；不复制旧版 Settings 兼容分支和完整 UI |
| Pi Model Router `3da0b845b954b39de25eaf6f25d84989ddea4a32` | [`extensions/model-router.ts`][P] 全部 836 行，包括配置归一化、规则、LLM 分类、候选链及运行时选择 | MIT，2026 Pablo Iaria；完整模块依赖 `pi-ai` 的 `complete` 和 Pi 扩展接口；纯函数可提取，**不是全部不可移植** | **C/D**；抽取候选链还需模型引用、tag、priority、route/default/fallback、Thinking 归一化语义。无法取代当前连续性/四模式/容量适配；没有证据证明替换更好 |
| LiteLLM `148ca66ecb6b55bafefa738a8327654d0a347b08` | `litellm/router_strategy/complexity_router/` 下 [complexity_router.py][L]、[jev_classifier.py][LJ]、[config.py][LC]；[LCost]/[LLatency] 成本/延迟选择，另读 [LF] 失败链 | 所读非 enterprise 文件为 MIT，2023 Berri AI；Python、Pydantic、HTTP/Router/缓存/日志契约 | **C**；保留 tier、失败不长期粘住、逐请求容量约束的思想。数学/过滤原语虽可移植，但本项目已具备；成本/延迟策略还需要价格、部署限额、调用观测。缓存可内存运行，不能据此说它必需 Redis；仍无引入整套生命周期的收益 |
| OpenSquilla `70232da69437560033f70c91e0f5e8cb7bfa805a` | [`src/opensquilla/engine/routing/heuristic.py`][OH] 纯特征 bands；[OP] `SquillaRouter.predict`、thinking/model、sticky；[OF] 特征管线；[OG] confidence/capability/budget gates | Apache-2.0；heuristic 只需 Python 标准库及项目 tier 模块，完整推理需 NumPy、LightGBM、sklearn/joblib、资产，V4 还分派到专用 predictor | **C/D**；可移植的小规则没有连续任务语义，模型选择只是 tier pool 首项。训练置信度/特征阈值不能直接当 Jev 置信度。完整推理不纳入轻量插件 |
| Claude Code Templates `f497abcc0f2d9a6f15549598323fd1322cc8feda` | 不是只有模板：[`cli-tool/components/mods/productivity/jev-model-router/hooks/policy.ts`][CP] 有独立无 I/O 的 `route/allowed/readDecision/pendingDecisions`；[CH] 有 prompt.submit/turn.step hooks；[CD] 管理配置 | 根 MIT，2025 Daniel (San) Ávila；所查 mod 目录无单独 LICENSE/NOTICE，源码无覆盖声明。policy.ts 无运行时 imports，hooks 需 Claude Code；Dashboard 需 Express/fs-extra | **C**；值得参考升/降级置信门槛和多待处理输入保守放行。固定 `low/medium/high/xhigh`、三模型映射、家族名匹配不能直接替代 DSH 原生元数据。内置分类器和第二 Gateway 不引入；配置管理已由 DSH 提供 |

A = 原样独立使用，B = 保留算法、少量适配，C = 仅参考思想，D = 保留现有实现。没有额外 A 级 npm 模块可直接替换现有路由；现有 Jev 代码复用属于 B，不应描述成导入上游包或原样复制全部代码。

## 2. 源码级能力对照

“最佳”指最适合本插件约束的已核实实现，不代表对上游质量排名。每行列出可迁移价值、成本和修改决定。

| 能力 | 当前实现 | 最合适上游 / 函数与源码 | 复用价值、依赖成本、适配复杂度 | 是否替换 |
| --- | --- | --- | --- | --- |
| 任务分类 | `src/classifier.ts` `localSimple/askJev`，一个 Choice 请求问 tier/role/relation | Jev [J] `askJev`；备选 Pi [P] `classifyWithRules/routeScore/classifyWithLlm`、LiteLLM [L] `_score_and_classify` | 已复用 Choice/超时/低置信度倾向更强的核心。Jev 纯 fetch 成本低；Pi LLM 经 `complete`/registry，规则需新配置；LiteLLM 多维权重移植中等成本，短续问仍需上下文 | **B/D，保留**；不再加入评分分类器 |
| 上下文识别 | `src/context.js` `messageText/foldContext/contextBlock`，300 字用户头/500 字助手尾/最近三条；DSH deriveMessages 另用于完整容量 | Jev [J] 同名函数；LiteLLM [L] `_extract_prior_turns/_human_text` | Jev 的事件语义与 DSH 直接一致，JS 已保留。LiteLLM 自行解析多协议消息/reminder，已有原生 source 判据时价值低；移植成本中等 | **B/D，保留**；没有缩短上游信封的裁剪预算 |
| 任务连续性 | `src/router.ts` `chooseRoute` 使用 outcome、openTodos、relation、实际模型，保持合法档位下限 | Jev [J] request 的 `inFlight/compareEffort`；OpenSquilla [OP] `_apply_sticky_tier`、[OG] `anti_downgrade` | Jev 的“未完成且继续”最吻合。OpenSquilla 粘性本身不区分新话题，需另做 DSH 适配，否则不相关新任务也无法降级；依赖低、语义适配中等 | **B/D，保留**；模型粘性是必要的现有扩展 |
| 模型选择 | `src/router.ts` `chooseRoute`，role 匹配 + 最低足够 tier | Pi [P] `choicesForDecision/modelAllowedForRoute`；LiteLLM [L] `get_model_for_tier/_pick_model_for_tier`；OpenSquilla [OP] `_select_model` | Pi 纯候选链值得理解，但其输入不含能力 tier 或连续性；需要保留当前策略后再包一层，不能减少维护。LiteLLM 默认多模型池随机选择；OpenSquilla 取首项。纯逻辑依赖低、完整替换成本中/高 | **D，保留**；不引入第二候选决策系统 |
| 模型优先级 | `chooseRoute` 稳定按 tier 升序，同 tier 保留用户配置顺序 | Pi [P] `choicesForDecision` 显式 modelId/其 fallback→preferred→tag priority→route/fallback→default；[LCost] `async_get_available_deployments`、[LLatency] `_get_available_deployments` | 用户顺序已能表达静态偏好。Pi priority 是另一种配置语义；成本/延迟依赖价格、限额和测量，不是任务能力评分。额外网络未必必需，但状态和配置成本高 | **D，保留**；不增加 priority 字段或观测系统 |
| Effort 决策 | `src/router.ts` `deriveLadder/effortFor`，按目标声明映射，显式 per-tier 优先 | Jev [J] `deriveLadder`；Pi [P] `normalizeSelectedThinking` | Jev 可独立复用，成本低；当前漏掉了中点碰撞回退。Pi 固定 THINKING_LEVELS 和模型特例不能覆盖合法自定义 DSH ID；适配它需重写校验 | **B，小修改**；恢复中点逻辑，其他映射不变 |
| 模型能力过滤 | `src/index.ts` `poolFor/available/fitsContext/validateHeld`，目录、modality、容量、合法 effort | Pi [P] `modelAllowedForRoute` + runtime image guard；LiteLLM [L] `_request_context_fit/_context_window_placement`；OpenSquilla [OG] `capability_gate` | 白名单思想相同；DSH metadata 为最终事实来源。LiteLLM 容量升级需模型组/token计数接口；OpenSquilla 无拟合目标时可能饱和到最高 tier，仍不保证请求能装下。移植成本高 | **D，保留**；不得撤销 S1 容量保护 |
| Fallback | `src/index.ts` request `pass`/分类失败分支；当前合法即保留，明确缺失才用授权 fallback | Jev [J] `askJev` 的失败返回；LiteLLM [L] `_classifier_failure_outcome`、[LF] `async_function_with_fallbacks_common_utils` | Jev 非阻断模式已采用。LiteLLM 支持回规则/指定 tier/default 及执行失败链，但后者会接管 DSH 原生执行/重试，迁移成本高 | **B/D，保留**；容量 Blocked 是已知不安全请求的显式停止，不是分类器失败 |
| 手动选择优先级 | `src/index.ts` `manualState/canApply` + 四模式/锁，每请求先检查 native pending，await 后再检查 | Jev [J] `pendingPick` 和 request 前置判据；Pi [P] `explicitRoute/classify` | Jev DSH 投影最适合，成本低。Pi 识别 prompt alias，不能代表原生 UI 的用户意图；要新增命令行为才可迁移 | **B/D，保留**；投影缺失时当前比 Jev 更保守 |
| 缓存与会话状态 | `src/index.ts` held/pending WeakMap、configKey、registryRevision、逐步容量检查；重启 refold | Jev [J] `turnDecisions/pendingText`；LiteLLM [L] `_decision_is_pinnable/_uses_tier_pin/_pin_model_for_tier`；Claude [CP] `pendingDecisions` | 一轮一次已实现。Jev 按 session ID 的目录 ladder 长缓存没有当前修订失效保护；LiteLLM 多租户 TTL pin 需缓存接口；Claude 无 turn ID 的排队防护不适用于 DSH 已提供 turn 的 seam。移植会重复状态 | **D，保留**；正常 held 不查目录，通知后只重验目标 |
| 异常与超时 | `src/classifier.ts` AbortController/finally；`src/index.ts` `withinBudget/keyFor`，无重试 | Jev [J] `askJev/resolveKey`；Pi [P] `makeTimeoutSignal`；LiteLLM [LJ] `HttpJevClassifierClient.evaluate` | Jev 已适配；目录/凭据等待也有限制。Pi 的 timer 不能替代 metadata 等待上限；LiteLLM HTTP/日志/提供商归一化成本高，收益重复 | **B/D，保留**；不同时维护多个 Jev 客户端 |

## 3. 确定性对照与唯一行为变化

实际运行本地源码探针：TypeScript AST 提取 Pi 内部纯函数及其 THINKING_LEVELS/BUILTIN_CONFIG，transpile 后在 VM 中执行，未调用 `complete` 或 Pi runtime；直接导入 Claude 的无 I/O policy.ts。OpenSquilla 用 Python AST 仅执行 `extract_features/classify_features` 与常量，没有安装 ML 包。临时脚本不进入插件或分发包；不是线上分类质量评测。

| 场景 / 固定输入 | 当前/修改后 | 上游实际输出或契约 | 判断 |
| --- | --- | --- | --- |
| `simple/general`、`moderate/coding`、`complex/coding`、`complex/reasoning`；fast(simple)、balanced(moderate)、coder(complex)，角色分别授权 | `fast/off`、`balanced/medium`、`coder/high`、`coder/high` | Pi 的 code preferred 列表 `[balanced,coder]` 首选 balanced；提供明确 `modelId=coder` 则首选 coder | Pi 可以联合选档，但不是现有 tier 算法的直接替代；让 Jev 再选模型会改变单一能力判定职责 |
| 未完成 coder/high 后“继续” | `localSimple=null`，路由保留 coder/high | Pi **内置规则**返回 small/default；OpenSquilla **heuristic 单模块**即使 history_depth=1 也返回 c0/0.55 | 不把这些规则当分类失败后的降级捷径；这不是对它们完整运行时或 LLM/ML 准确率的判断 |
| “修复竞态条件” | 本地快速规则不分类，交 Jev；Choice 给 complex/coding 时用 coder/high | Pi 内置规则返回 small/default；OpenSquilla heuristic 返回 c0/0.55 | 短消息不能当简单任务；Pi 自定义中文规则仍可不同，不移植默认词表 |
| 自定义合法档位与不支持 xhigh 的模型 | DSH 广告列表/effortByTier 校验；无 reasoning 时不发送 effort | Pi `validThinking('max')=undefined`；Claude `effortLevel(3)='xhigh'`，route 不接收模型 legal efforts 或任务完成状态 | 不能用固定跨模型档位替代原生声明 |
| 广告顺序 `[medium, brief, standard, high, max]`，无显式映射，moderate/coding | 修改前 `brief`，修改后 `standard` | Jev `deriveLadder` 输出 `[medium, standard, high]` | **恢复原始中点优先**。ID 只是模型自己的声明；DSH 接受非空唯一字符串，不根据名字推断跨模型能力 |

唯一生产改动在 `src/router.ts`：named medium 与已选端点冲突时，先尝试声明顺序的中点，再找其他合法档。保留当前去重、声明顺序、per-tier 配置及最深档选择。`lib/router.js` 同步重建。

回归先在 main 算法上运行并失败，实际 brief/预期 standard；恢复后通过。另对八组空/单/双/常规/非标准顺序 ladders 运行原上游函数与当前函数的一致性断言，全部通过。常规 low/medium/high 和已配置映射行为不变；只有上述端点碰撞类映射可能改变。这证明 ordinal 映射恢复上游意图，不证明线上答案质量改善。

Jev 分类仍从多档 ladder Choice 改为三个任务能力 tier，并增加 role。这是联合模型路由需要的分工，不是丢弃上下文算法；默认派生 ladder 本来也只有 2–3 档，额外合法档可通过 effortByTier 配置。没有证据支持再问一个 effort 请求或引入五档任务 taxonomy。保留原有信封字段、裁剪、unfinished 判据和低置信度更强 top-2 策略；当前额外过滤未知/非有限概率，没有回退到信任任意 Choice。

两处现有取舍也保留：上游可配置最多五档 Choice，当前三个 tier 不具备五种动态深度的粒度，不能称为完全等价；`contextBlock` 保留可选标题参数，但入口未读取 SessionTitle，实际不发送该提示。标题在上游也是 advisory，核心上一轮文本/助手尾部/完成状态均保留。缺少线上证据时，不为这些差异扩展配置或分类协议。

## 4. 许可与维护结果

唯一新增复用仍来自 Jev 同一提交的 `lib/index.js/deriveLadder`。MIT Copyright/完整许可已经在 `licenses/jev-effort-selector-MIT.txt`，源码出处及修改记录更新在 `THIRD_PARTY_NOTICES.md`。其余四个仓库仅研究，没有把探针抽取的源码复制入仓库；没有 enterprise、模型资产或 Apache 衍生代码进入包，因此不新增其 LICENSE/NOTICE。

生产源码净增 **3 行**，对应 lib 净增 3 行；新增 **1 个 13 行回归测试**。没有增加模块、抽象层、网络请求、分类次数、目录查询、配置项或依赖；package.json/package-lock.json 不变。新增本审查文档，验证/来源文档作必要更新。

## 5. 验证

- 基线 `npm ci --no-audit --no-fund`，`npm test`：**39/39**，0 失败/跳过。
- 修改后 `npm test`：**40/40**，0 失败/跳过（9 个策略测试、31 个实际 DSH AgentLoop 集成测试）。原有手动异步竞态、候选移除、无候选、分类超时/失败、禁用卸载、会话隔离、同 Turn 缓存/容量增长、非推理模型回归均保留。
- 最终构建、pack、生产安装冒烟结果见 [VALIDATION.md](VALIDATION.md) 的 S2 小节。
- 典型 tier/role、Pi/Claude/OpenSquilla 对照及八组 ladder parity 探针均通过预期断言。未运行 LiteLLM/OpenSquilla 完整服务或模型；没有真实 Jev/LLM 密钥、完整浏览器/DSH CLI 安装或线上质量数据。

## 6. 最终架构与合并建议

`DSH pre-step/assembly → 当前输入 + Jev 日志信封 → localSimple 或单次 Jev tier/role/relation → 原生模型能力过滤 → chooseRoute → 目标合法 effort → native agent/request 返回 CallConfig → DSH prepareCall/dispatch/真实 Header`。

手动 intent、禁用、模式锁、冲突与 subagent 判据在自动路由之前。held 复用不会再分类/重建候选池；配置及目录通知失效判据保留，最新容量仍每步检查，已知不安全缓存请求显式停止，不假定 original 恢复强模型。生产 `src/index.ts/context.js/classifier.ts/config.ts/client.js` 没有变更。

建议合并包含该小改动和审查记录的独立 PR；风险限于少见档位声明顺序的中间档回归。没有实施更大替换，也没有开始 S3。

[J]: https://github.com/justhalfbit/dsh-plugin-jev-effort-selector/blob/9b8ac7dd8668b936dbd3cde1c93c12eecbf3fca8/lib/index.js
[JW]: https://github.com/justhalfbit/dsh-plugin-jev-effort-selector/blob/9b8ac7dd8668b936dbd3cde1c93c12eecbf3fca8/lib/client.js
[P]: https://github.com/iariap/pi-model-router/blob/3da0b845b954b39de25eaf6f25d84989ddea4a32/extensions/model-router.ts
[L]: https://github.com/BerriAI/litellm/blob/148ca66ecb6b55bafefa738a8327654d0a347b08/litellm/router_strategy/complexity_router/complexity_router.py
[LJ]: https://github.com/BerriAI/litellm/blob/148ca66ecb6b55bafefa738a8327654d0a347b08/litellm/router_strategy/complexity_router/jev_classifier.py
[LC]: https://github.com/BerriAI/litellm/blob/148ca66ecb6b55bafefa738a8327654d0a347b08/litellm/router_strategy/complexity_router/config.py
[LCost]: https://github.com/BerriAI/litellm/blob/148ca66ecb6b55bafefa738a8327654d0a347b08/litellm/router_strategy/lowest_cost.py
[LLatency]: https://github.com/BerriAI/litellm/blob/148ca66ecb6b55bafefa738a8327654d0a347b08/litellm/router_strategy/lowest_latency.py
[LF]: https://github.com/BerriAI/litellm/blob/148ca66ecb6b55bafefa738a8327654d0a347b08/litellm/router.py
[OH]: https://github.com/TokenRhythm/opensquilla/blob/70232da69437560033f70c91e0f5e8cb7bfa805a/src/opensquilla/engine/routing/heuristic.py
[OP]: https://github.com/TokenRhythm/opensquilla/blob/70232da69437560033f70c91e0f5e8cb7bfa805a/src/opensquilla/squilla_router/models/v4.2_phase3_inference/runtime_src/src/router/predictor.py
[OF]: https://github.com/TokenRhythm/opensquilla/blob/70232da69437560033f70c91e0f5e8cb7bfa805a/src/opensquilla/squilla_router/models/v4.2_phase3_inference/runtime_src/src/router/features.py
[OG]: https://github.com/TokenRhythm/opensquilla/blob/70232da69437560033f70c91e0f5e8cb7bfa805a/src/opensquilla/engine/routing/policy.py
[CP]: https://github.com/davila7/claude-code-templates/blob/f497abcc0f2d9a6f15549598323fd1322cc8feda/cli-tool/components/mods/productivity/jev-model-router/hooks/policy.ts
[CH]: https://github.com/davila7/claude-code-templates/blob/f497abcc0f2d9a6f15549598323fd1322cc8feda/cli-tool/components/mods/productivity/jev-model-router/hooks/jev-model-router.ts
[CD]: https://github.com/davila7/claude-code-templates/blob/f497abcc0f2d9a6f15549598323fd1322cc8feda/cli-tool/src/plugin-dashboard.js
