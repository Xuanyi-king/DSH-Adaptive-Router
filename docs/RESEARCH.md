# 第一阶段源码审查

审查时间：2026-10-14。以下均读取实际源码，而不是仅阅读 README。

| 上游 | 审查提交 |
| --- | --- |
| DeepSeek Harness | `d743267388641bc76f17c45ce8b4c231aed1d32c` |
| Jev Effort Selector | `9b8ac7dd8668b936dbd3cde1c93c12eecbf3fca8` |
| Pi Model Router | `3da0b845b954b39de25eaf6f25d84989ddea4a32` |
| LiteLLM | `083d48f62f1e3dd9a4c6da393e9464013aff7929` |
| OpenSquilla | `70232da69437560033f70c91e0f5e8cb7bfa805a` |
| Jevcore | `da5bd49a60c93a86f8b7c261f88ac5f9b736c66a` |

## 采用与舍弃

- **DSH**：`packages/core/agent/src/runtime-types.ts` 的 `pre-step/request` 契约；`agent-loop/src/agent.ts` 的请求准备、实际 Header 记录、Admission 和 Streaming；`agent/src/model-selection.ts` 原生选择器请求覆盖；`api/session-controller/src/model-selection-projection.ts` 的持久手动意图；`llm/src/types.ts`、`llm/src/call-config.ts` 与 `llm/src/index.ts` 的 Catalog、ModelInfo、Reasoning 和 PrepareCall；`session/session-projection` 的 fold/wire 接口；`settings/settings/src/index.ts` 的生成表单和 volatile 配置；`docs/user/develop/basic/publish.md` 的 Bundle 安装契约。目标 npm 版本固定 `0.2.1-alpha.2`，不是 npm 的旧 latest 标签。Cordis 对应 `4.0.5-alpha.1`。
- **Jev Effort Selector**：读 `README.md`、`DESIGN.md`、`package.json`、`cordis.patch.yml`，及 `lib/index.js` 的 `foldContext`、`contextBlock`、`askJev`、`deriveLadder`、密钥解析、pre-step/request、pendingPick、子 Agent 判据；`lib/client.js` 的 Slot、Projection、SRC Remote 和配置分支。直接提取上下文 fold/envelope，保留 JS，增加实际 provider/model；通信、取消、低置信度策略和档位派生适配成 TS。没有复制整套浏览器设置 UI 或双版本配置兼容层。
- **Pi Model Router**：`extensions/model-router.ts` 的 `routeScore`、`modelAllowedForRoute`、`normalizeSelectedThinking`、`classifyWithLlm`、`choicesForDecision` 与输入生命周期。采用候选允许列表、角色匹配、联合模型与档位决策、合法 Thinking 校验的设计。没有直接复制代码，不迁移 Pi 运行时、内置模型名称、费用统计或模型名特例。
- **LiteLLM**：`litellm/router_strategy/complexity_router/complexity_router.py` 的 `_score_token_count`、`_keyword_matches`、`_score_keyword_match`、`_score_and_classify`、tier pools、分类失败和 session affinity；`jev_classifier.py` 的 HTTP 客户端和 `build_jev_request`；`config.py` 的 tiers、effort 映射配置。读取官方 https://docs.litellm.ai/docs/proxy/auto_routing 。采用任务→能力 Tier→模型池、保守回退和用户轮次粘性思想；没有移植整套加权评分。特别拒绝把“短消息”直接当简单任务。未读取或复制 enterprise 代码。
- **OpenSquilla**：`src/opensquilla/engine/routing/heuristic.py` 的依赖无关 feature bands；`squilla_router/models/v4.2_phase3_inference/runtime_src/src/router/predictor.py` 的 `SquillaRouter.predict` 联合 route/thinking 和 trajectory；同目录 `features.py` 的代码、调试、架构、上下文特征。只参考保守特征门控、历史依赖与能力层级的思想。LightGBM、TF-IDF、嵌入、ONNX 和权重不适合轻量插件，全部舍弃。没有直接复制 Apache 代码。
- **Jevcore**：`packages/core/package.json`、`src/provider/live.ts`、`provider/classify.ts`、`answers.ts`、LICENSE/NOTICE。提供独立 SystemOne + Choice 能力，但引入 SDK optional dependency、完整 resilience 和 provider 策略对本阶段无收益。选用 Jev Selector 的单一 fetch 客户端，不同时维护第二客户端。

## 关键边界

1. `pre-step` 捕获直接用户文本；`request` 决策时该文本还不在日志。只在第一步分类，失败也缓存本轮，不在工具步骤或重试重新分类。
2. `request/header` 由 DSH 自己记录；插件只返回新的原生 CallConfig，绝不伪造事件、HTTP Header 或修改 Core。
3. 上下文投影只 fold DSH 自有事件，继承省略 Header 的轮次；未完成依据 turn/end 和最后 todo/write，而非下一轮已清空的 todo 投影。
4. 手动意图读 `modelSelection.pending`。不存在该投影的入口保守放行；不是把当前默认模型误当手动。插件内 lockModel/lockEffort 为显式长效锁定。
5. 调用结果按主 Agent 对象 WeakMap 缓存，不跨 Agent 复用。只有原生 Header 能成为展示的实际配置；重启用该会话日志重建上下文。
6. 公开 ModelInfo 不含统一编程/智力等级，必须用户配置 tier/roles；reasoning.efforts 与上下文容量由 DSH 提供。原生元数据没有统一工具能力等级，本阶段不虚构它。
7. 能力容量使用实际请求内容的保守字节估计：历史、已接受输入、原生渲染提示词与工具声明，并预留输出和结构余量；无法定价的附件/未知块采用不缩小已知窗口策略。目录失败不等于模型不存在；元数据等待也有超时上限。
8. 通过公开 Cordis Registry / 已发布 Jev Remote 检测冲突，退出本插件所有自动修改。其他未声明的 request 插件无法通用识别，展示始终以最终 Header 为准。
