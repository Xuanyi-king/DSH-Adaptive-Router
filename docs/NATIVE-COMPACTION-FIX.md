# P1：容量保护与 DSH 原生自动压缩

基线 main `91926d56434dc386b8ac987faf72b2b0d81fa85c`，156 项测试。目标 DSH `0.2.1-alpha.2`，核对官方源码提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。不修改 Core、路由算法或分类协议。

## 根因与真实执行顺序

| 顺序 | 官方源码 / 行为 | 原问题 |
| --- | --- | --- |
| 1 | `packages/core/agent-loop/src/agent.ts`：组装输入、`agent/pre-step`；`packages/compaction/compaction-basic/src/index.ts` 的压力压缩在此执行 | 压力阈值不一定覆盖插件更保守的容量预算；原生压力压缩失败会记录后继续 |
| 2 | `step/start` → `agent/request` → `prepareCall` | 插件在此抛错会直接结束 Turn，尚未发 Provider 请求，无法进入原生错误恢复 |
| 3 | 输入入日志、提交 Header、Provider 调用 | persisted Header 可能已是自动选中的小窗口模型，返回 original 不能保证恢复强模型 |
| 4 | Provider 真正返回 `CONTEXT_WINDOW_EXCEEDED` → `agent/request-error` → 原生压缩 → 有限重试 | 重试再次进入 request，但不经过 pre-step。旧插件再次计算已入日志的 pending 输入，可能重复计数并阻断恢复 |

原来容量判断还使用文本 UTF-8 字节上界和未声明输出上限时的半窗口预留，可能把原生预算能接纳的文本误判为超限；缓存曾保存永久阻断状态，即使原生投影已被替换也不能恢复。

## 最小修复

- 原生 Token Meter 存在时使用公开 `measure()` / `estimateMessage()`，包括实时投影、尚未入日志的输入、系统/运行时提示词和工具声明。输出预留遵循原生 `maxTokens ?? defaultMaxTokens ?? 0`，另留 2048 结构余量。它仍是估算，不是精确 Tokenizer 或 Provider 接纳证明。
- 初次选择仍过滤装不下的候选并保留当前合法原生配置，不为未提交的候选伪造 Header 或压缩历史。新增路由路径没有新增提前抛错。
- 已提交的缓存模型预算不足时，原生 compaction/tokenMeter 可用、公开后端配置 `auto: true`，且本步没有发生压力压缩/裁剪或恢复尝试，才调用公开 `compactIfNeeded(agent, 'context-overflow', signal)` 一次。这里复用原生强制恢复策略，原因明确标为 **router-capacity-check**，不是伪造 Provider 超限事件。
- 复用原生范围选择、摘要、工具配对、表面替换和取消。没有第二套压缩器，也不启用原本关闭的自动压缩。原生压缩本身可以调用其摘要模型；插件不重复原任务请求、不重新分类、不重建候选池。
- 完成或失败后都重新读取目标模型声明与真实投影；允许原生失败时已形成的安全部分进展。再次不安全才阻断。没有无限重试；真实 Provider 超限继续受原生 `maxOverflowRetries` 约束。
- 原生请求错误重试时，明确标记输入已经入日志，不再次叠加旧 batch。表面替换后只解析原目标能力，普通缓存复用不增加目录查询。
- 容量阻断不再永久锁存；后续真实压缩恢复后可重新通过。异步边界后仍复查取消、配置修订与手动优先。

### 安全边界

| 证据 | 行为 |
| --- | --- |
| Provider 实际超限代码 | 原生错误恢复；Lab 记录 provider-overflow |
| 本地可靠估算超过输入/输出预算 | 给符合条件的原生恢复一次机会；仍超预算则 context-capacity-blocked |
| 估算失败/无法覆盖附件或延迟工具 | context-estimate-unavailable；不冒充真实 Token 超限 |
| 模型窗口声明缺失/非法 | context-capacity-unknown；不虚报窗口 |

没有原生服务时保留已有保守字节策略；未知后端的自动开关不猜测为开启。无法压缩的最新单个大输入/工具输出、原生摘要失败、自动压缩关闭等仍可能阻断，需手动选较大模型或使用原生 `/compact`。手动模型选择和子 Agent 策略不变。

## Router Lab

采集仍默认关闭。可选 `compaction` 元数据记录原生 start/end 的尝试/完成/失败数、实际 Provider 超限数和可证实的触发来源；只有压缩结束后观察到非中断 assistant/message 才标记请求恢复。恢复不代表用户任务成功。

原生事件没有说明压力触发原因时，来源为 unknown；缺失、取消或无法确认恢复时为 null。后一次失败不会继承前一次成功的恢复状态。不保存摘要、正文、错误原文或临时 compactionId。旧 schemaVersion 1 数据缺少此可选字段时仍可读，统计按未知覆盖处理；CSV 末尾追加 compaction JSON 列。回滚旧严格读取器前应导出备份并按需清空新记录，旧版本不保证接受新增可选字段。

## 验证

最终测试与构建记录见 [VALIDATION.md](VALIDATION.md)。新增 17 项回归，保留原 156 项：真实目标 AgentLoop、原生 Token Meter、BasicCompactionEngine 的范围选择/生命周期/投影替换与重试策略；仅摘要生成用确定性替身，不调用付费服务。

覆盖旧长历史自动压缩、缓存恢复、低于原生压力阈值的主动恢复、压缩失败、成功后容量改变、Provider 超限与第二次超限、取消、重复 batch、未知容量、估算失败、Lab 覆盖未知/失败/重复恢复，以及最小记录展示。此轮没有 Windows Desktop 实机或完整 DSH Web 压缩验收，不把 AgentLoop 测试称作 Windows 验收。

## Windows Desktop 本地复现与验收

1. 先备份 **desktop Profile** 与现有插件来源，使用测试会话副本；不要修改 web Profile。人工审查后，如需安装修复，用官方 Plugin Manager 指定已审查完整 SHA 或本地 tgz；安装前完全退出 Desktop/Host，保留旧固定来源用于回滚。插件不执行升级命令。
2. 在 Node.js ≥22 的外部终端运行 `npm ci`、`npm test`、`npm run build`。可单独运行：`node --test --test-name-pattern="native|capacity|compaction" test/integration.test.mjs test/lab.test.mjs`。
3. 启动 Desktop，确认目标版本原生 Token Meter / Basic Compaction 已 active 且开启 auto，摘要模型可用、原生输出预算/保留量合理。选择已授权的小窗口候选，保留较大原生模型。Router Lab 仅在希望查看记录时主动启用并保存。
4. 先建立可压缩的旧长历史，再让同一 Turn 的工具输出使小模型接近容量；分别观察原生压力压缩和尚未达到原生压力阈值、但触发插件预算的情形。应看到原生压缩后继续、同 Turn 仅一次分类、真实 Header 模型不冒充强模型、没有额外重复的原任务请求。
5. 用不可用的测试摘要服务复查失败；用最新一个超大保留单元复查无法压缩；两者应停止不安全请求而非循环。再测试原生 Provider 超限恢复的有限重试、手动模型优先和压缩中取消，不应有取消后的迟到请求。
6. 检查 Lab：本地预算触发不能记成 Provider 确认超限；观察不到触发/恢复时必须 unknown；成功记录只表明请求恢复。目录缺失声明与估算失败须显示不同原因。关闭采集/禁用/卸载后不产生新记录。
7. 只提交脱敏事件类型、时间和结构化结果，不上传会话正文、工具内容、凭据或原始日志。记录 Windows/Desktop/DSH 版本和原生压缩配置。只有此实机流程通过后，才能确认用户最初的 Windows 复现已解决。

没有修改原生存储权限或卸载规则。Runtime 依赖不增加；新增两个固定版本开发依赖用于真实原生组件回归，不为用户 Profile 安装新服务。
