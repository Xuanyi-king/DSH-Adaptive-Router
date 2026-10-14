# 第一阶段验证记录

环境：2026-10-14，Linux，Node.js `v24.19.0`，npm `11.9.0`。
DSH 测试包固定 `0.2.1-alpha.2`，Cordis `4.0.5-alpha.1`。

## 已执行

- `npm install --no-audit --no-fund`：依赖安装成功。最初误选 Cordis `4.0.4`，npm peer 校验拒绝，按目标 DSH 的 peer 范围改为 `4.0.5-alpha.1`；未使用 force/legacy-peer-deps。
- `npm test`：构建成功，**31/31 测试通过，0 失败、0 跳过**（8 个策略单元测试，23 个真实 AgentLoop 集成测试）。
- `node --check lib/client.js`：浏览器插件产物语法检查通过。
- 独立只读代码审查确认两项异步边界问题：最终元数据等待后的控制权复查、凭据无限等待。已先复现失败，再修复并通过对应回归。

| 场景 | 实际验证方式 | 结果 |
| --- | --- | --- |
| 简单问候 | 真实 DSH AgentLoop → 测试 Adapter，检查实际 model/effort 与原生 Header | 通过 |
| 复杂编程 | 本地 System One HTTP Choice → coder/high → 真实请求 | 通过 |
| 未完成任务“继续” | 第一轮 max-tokens，第二轮继承实际日志信封、模型与深度 | 通过 |
| 用户显式选择 | modelSelection 契约夹具 + 真实 installModelSelection 请求覆盖；final/held await 期间的手动选择 | 通过 |
| Jev 超时/失败 | 无响应、503、坏 JSON、未知 Choice；首步重试只一次分类 | 通过 |
| 停用与卸载 | disabled 放行，fiber.dispose 后继续真实原生请求 | 通过 |
| 不存在模型、非法 effort | 真实目录过滤；非法 max 映射不发送；无 reasoning 目标清除继承 effort | 通过 |
| 每轮一次 | 首步重试与后续步骤复用成功/失败决定 | 通过 |
| 会话隔离与重启 | 独立 SessionId；卸载/重新加载后从该会话实际日志恢复 | 通过 |
| 安全等待 | 挂起 catalog 有上限；凭据等待可取消；空 URL 不解析凭据 | 通过 |
| 候选授权变化 | 完成配置重载后旧自动模型不再使用；目录失败不被误认作模型缺失 | 通过 |
| 模型能力与兼容 | 窗口缩水过滤；冲突插件后加载退出；subagent origin 放行 | 通过 |

这些测试保留 DSH 的真实生命周期、日志投影、请求校验、prepareCall 和 provider dispatch。
测试 LLM Adapter 与本地 HTTP Jev 服务是离线夹具，不证明线上分类准确率或模型质量。
modelSelection 的 intent projection 是测试契约夹具；原生请求覆盖器用真实 DSH `installModelSelection`。

## 未验证

- 付费线上 Jev / LLM：环境未配置真实密钥，未调用。
- 完整 Web SessionController、Plugin Manager、浏览器状态标签的人眼/端到端验证：未启动完整 Web profile。
- DSH CLI 安装：环境没有预装 `dsh`，安装命令按审查过的官方 Bundle 文档提供；不宣称执行过该 CLI。
- 图片 Provider 实际视觉请求和跨提供商效果：没有真实模型/图片服务验证；过滤实现使用原生 modality 声明，仍需线上补验。
- 旧 DSH 版本：不在本阶段兼容承诺内。

## 安装包冒烟

`npm pack` 成功生成 `dsh-plugin-adaptive-router-0.1.0.tgz`。
在新的 `/tmp/dsh-router-smoke.*` 目录中仅执行 `npm install --omit=dev` 安装该 tarball，
随后动态导入包的正式入口，检查 Config 默认值、Bundle patch、client.js、项目/上游许可证与验证文档，全部通过。
确认干净安装中不存在 DSH AgentLoop 测试包：运行包不依赖开发用的整套 DSH。
这个验证覆盖 npm 分发包闭包，不等价于执行完整 DSH CLI/Web profile 安装。


## S1 最终修复验证

以 `main` 提交 `1b3cc4e` 为基线，保持基线 31 项测试通过；仅新增六项回归，当前 `npm test` **37/37 通过**。

- 默认 200K 模型 + 简单问候 → 64K 快速模型，真实 AgentLoop dispatch 验证。
- 长历史不切到容量不足的 64K 模型；已有窗口过滤测试改为真正超过 8K 容量的系统提示词，而不再要求“大窗口一定不能切小窗口”。
- 本轮首次决定后，首步重试和步骤 2/3 的目录查询及能力查询次数均保持不变；中途手动选择仍立即优先，亦不查询目录。
- 原生 adapter 更新通知后重新校验原目标，目录移除模型时不再复用。
- 现有配置修改、手动选择、异步手动竞态、取消和安全回退测试保持通过。held 验证期间的手动竞态测试明确先触发目录通知，以覆盖真正需要重新校验的分支。

容量估计采用 UTF-8 字节数的保守代理，不是精确 tokenizer：计入 DSH 原生提示词、运行时快照、工具定义、已接受输入及完整可见历史，再留 2048 结构余量与输出上限；未知输出默认预留半个目标窗口。无法可靠定价时保守拒绝缩小窗口。DSH 原生 `prepareCall` 继续在每次真实请求验证模型/档位；插件不改 Core、不绕过该流程。

复用依赖公开 `llm/adapters-updated` 通知和配置快照：每轮一次分类，目录更新时仅重验目标，没有全局模型缓存或外部缓存依赖。使用现有 DSH `systemPrompt` 服务和其公开渲染函数，新增 peer 声明不引入预测框架。

- 额外两项必要容量边界回归：后加载的 prepend 消息注入（100KB 确实进入实际请求）计入容量判断；后加载的外层提示词变换无法保证快照完整时保守不缩窗。捕获监听仅在外层 pre-step 注册修订改变时，通过公开 Cordis dispatch 通知重挂；不读取私有 listener 数组、不重复执行 hook。


## PR #1 缓存复用容量保护

本次仅修复同一 Turn 后续上下文增长的缓存边界：保留首次决策和目标能力元数据，每步更新已接受的消息批次并重新做容量检查，不调用 Jev、不重建候选池、不在正常复用时查询模型目录。原生目录通知仍可刷新目标元数据。

超限或无法安全定价时，保存 `Blocked / context-capacity-blocked` 状态并抛出明确的容量保护错误，让真实 AgentLoop 以可解释的 error 结束本轮；重试不能退回放行 `original`（persisted Header 已可能是快速模型）。异常回退仍保留，只有明确容量保护错误不会被吞掉。用户明确手动选择优先，不实现模型升级或自动恢复强模型。

验证：`npm test` **39/39 通过**，保留之前全部 37 项测试，新增两个真实 AgentLoop 回归：

1. 第一请求选择 64K 快速模型，执行真实工具取得 100KB 文本结果；同一 Turn 的第二请求在到达 Provider 之前被阻止。确认实际 Header 仍为快速模型、工具结果确实在可见历史中、目录只查询一次、重试保持阻止，以及显式选择 balanced 模型仍优先。
2. 工具仅返回短文本，第二步骤的 pre-step 另行提供 100KB 尚未提交的消息；确认这些最新输入也触发容量保护，不盲目复用首次输入快照。

容量仍是保守字节估计，不宣称 DSH prepareCall 执行精确上下文 Token 验证；本次没有线上模型调用或 UI 改动。
