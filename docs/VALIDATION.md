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

## S2 上游复用审查验证

基线：PR #1 已合并的 main `ea0853d8138379bb4f14fea02ed999bfad27d125`。
`npm ci --no-audit --no-fund` 成功，基线 `npm test` **39/39 通过**。

唯一生产修改是恢复 Jev `deriveLadder` 的原始中点回退顺序。当 advertised
`medium` 正好是最低档时，先尝试声明顺序的中点，再寻找其他合法档位。
新增回归在修改前明确失败（实际 brief、预期 standard），恢复后
`npm test` **40/40 通过，0 失败、0 跳过**；原有 39 项回归保留。
没有更改 DSH Adapter、缓存、上下文保护、手动控制或配置。

- 本地确定性探针执行提取的 Pi 纯函数、Claude 的纯 policy 和 OpenSquilla 的
  heuristic 函数，对照 tier/role、短续问、中文编程、固定档位限制；没有调用
  它们的 LLM/ML runtime。八组 ladder 与 Jev 原始函数对照通过。
- `npm run build`、`npm pack`、`node --check lib/client.js`、`git diff --check` 成功。
  包含更新后的 `lib/router.js`、审查文档、Bundle patch、项目 LICENSE、
  THIRD_PARTY_NOTICES 和完整 Jev MIT 许可。package.json/lockfile 未变，未增加运行时依赖。
- 在新的 `/tmp/dsh-s2-smoke.*` 目录以 `npm install --omit=dev` 安装 tarball，
  实际动态导入正式插件入口、执行中点路由、检查 bundle/client/审查文档和许可证，全部通过。
  原生 `dsh-system-prompt` peer 仍为 `0.2.1-alpha.2`；没有安装 AgentLoop testkit。
  这是生产包安装冒烟，不等同于完整 DSH Web/CLI profile 验证。

详细能力对照、固定上游提交、行为变化与未采用理由见
[S2-UPSTREAM-AUDIT.md](S2-UPSTREAM-AUDIT.md)。没有线上准确率或性能测评；
原有真实服务、完整 Web/CLI 安装验证限制不变。


## 合并前 review 补充：具名 high 上限

发现上游 `deriveLadder` 对 `[low, high, max]` 的排序可能把 max 当成默认复杂档位。
在不改变 Jev/选模/会话生命周期的前提下，将默认梯度限制在具名 high 及之前的广告档位；显式 `effortByTier` 的 max/xhigh 仍合法。
直接执行同步后的 `lib/router.js` 六组边界与复杂档映射探针通过，并添加 1 个策略回归。
**本补丁之后的完整 `npm test` 和 PR #3 合并后的集成组合尚未在当前环境重新执行**；先前的 S2 40/40、PR #3 40/40 属于各自分支的验证记录。


## S3 原生配置与交互验证

基于 PR #1/#2/#3 已合并的 main `f9d4325ccb03367ba8fe629eb0f1b23ad31dc9de`。
Node.js ≥22；目标 DSH `0.2.1-alpha.2`。本轮基线 **42/42** 通过，也补齐了此前记录中合并组合未执行的检查。

- `npm ci`、`npm test`：**52/52 通过，0 失败、0 跳过**。保留全部 42 项策略、手动优先、缓存、容量增长和真实 AgentLoop 回归；增加 10 项真实 React DOM 交互测试。UI primitives、配置 transport 使用契约夹具，不能单独视为完整 Web 验收。
- 新增回归覆盖：原生目录授权/修订保存、合法 max 与用途、不再可用的旧候选保留、保存拒绝保留草稿、保存前目录变化、真实 Header 与 Native override、执行中暂停快捷切换、空目录/读取失败/只读、重复保存、全局模式写入、非推理模型显式清除旧映射和未执行计划状态。
- `npm run build`、`npm pack`、`node --check lib/client.js`、`git diff --check` 通过。打包包含同步的 lib、Bundle patch、S3 文档、LICENSE、THIRD_PARTY_NOTICES 和完整 Jev MIT 许可。运行时依赖未变；React/ReactDOM/jsdom/esbuild 仅开发依赖。
- 独立 `/tmp/dsh-s3-package-smoke` 执行 `npm install --omit=dev <tarball>`，实际导入正式插件入口和 effortFor 预览，检查 Bundle/文档/完整许可齐备：通过。生产安装没有 React/ReactDOM/jsdom/esbuild/AgentLoop testkit；仅原有两项依赖和原生 system-prompt peer。

### 实际 DSH Web / Chromium

在独立 `/tmp` 目录安装官方 `@deepseek-ai/dsh@0.2.1-alpha.2`，用隔离 DSH_HOME，执行
`dsh plugin --profile web add link:/workspace/dsh-adaptive-router`，再运行
`dsh web --patch <离线 adapter overlay> --no-open --port 18731`。
Playwright/Chromium 同样安装于临时目录，不进入项目依赖或发布包。
使用真实原生 LlmAdapter fixture 声明两款 64K/200K 模型及 off/low/medium/high/max；仅返回固定离线文本，不调用线上模型或 Jev。

| 实际浏览器步骤 | 结果 |
| --- | --- |
| 打开原生 Plugins → Bundle，发现 Provider/模型，勾选候选、选择 simple、保存 | 通过；Host 原生配置写入成功，无手工编辑插件 YAML |
| 停止并重新启动 Host，重新打开配置 | 通过；候选勾选与能力恢复 |
| 快捷菜单切换插件级模式，再发送简单问候 | 通过；实际 Header/标签为 Auto · Native Quick · off |
| 用原生模型选择器改为 Native Balanced | 通过；提交前仍显示上一请求；提交后 Manual · Native Balanced · Default。fixture 未声明默认档位，正确显示 Default |
| 禁用后创建会话、重新启用 | 通过；禁用时没有标签，配置未清空，重新启用仍保留候选 |
| 原生插件管理器确认卸载后创建会话，再用官方 CLI 重装 | 通过；卸载后 Slot 标签移除；重装恢复此前勾选的候选与 simple 能力 |
| 暗色、亮色及 390px 窄屏 | 通过；截图检查；窄屏无横向页面溢出，标签不覆盖发送按钮 |
| 上述最终浏览器流程的 pageerror | 0 |

浏览器依赖与 adapter fixture 只用于验证，不向用户暴露测试模型或添加第二套目录。
未执行真实付费 Provider/Jev 在线请求、远端只读部署端到端、跨提供商质量评测；目录异常与只读由上述 DOM 回归覆盖。
源算法和 PR #3 生命周期未改；没有 Release、npm 发布或合并 main。

### PR #4 收尾：快捷互斥与原生表单丢弃

增加两项回归，修复前分别复现「同批点击提交两次」与「原生 SettingsForm 卸载后旧草稿仍保留」。
快捷写入使用同步 ref 互斥，拒绝/成功后均释放，仍使用 ConfigForms 原生修订号；onDiscard 接入现有 discard，清理草稿、基线和失败提示。
修复后 `npm test` **54/54 通过，0 失败、0 跳过**，原有 52 项全部保留。
`npm run build`、`npm pack`、`node --check lib/client.js` 和 `git diff --check` 通过，lib/client.js 与源文件同步。
没有修改路由算法、配置结构、依赖或安装/卸载逻辑。本补丁未重新执行完整浏览器流程；上述 S3 完整 Web 验证属于收尾前的记录。

## S4.1 路由可靠性与 NeoHorse 协议

基于最新 main `6505471`；`npm ci`、`npm test`、`npm run build` 基线 **54/54**。
本轮最终完整回归 **91/91 通过，0 失败、0 跳过**；保留全部原有测试。

- 纯逻辑：四模式、Manual 无服务依赖、EFFORT_AUTO 无候选依赖、无档位模型默认、缺 URL/密钥/未知目录、已配置未验证、验证成功、固定档位不兼容、合法预设与自定义引用/阈值保留。
- 本地真实 HTTP：Jev 和 NeoHorse tier/role/relation Choice、缺省与异常 confidence、完整概率、401/403/413/422/429/529/503、超时/取消、无效 JSON、缺字段/非法标签、网络失败、重定向、请求/响应大小限制、可信 Host 合成探针。无付费 API。
- 真实 AgentLoop：Bypass 保留原生、授权备用真实 Header 确认、最终 request 覆盖、20 Turn 记录上限/会话隔离/无正文或凭据、dispose/卸载清理、晚到响应、凭据变更期间不得恢复旧验证。原有多步/缓存/目录变化/手动选择/容量增长与 ContextCapacityError 全保留。
- React DOM：模式诊断、预设仅写草稿、静态检查零参数、不发送聊天/URL、旧端点失败不污染新草稿；原有保存互斥、修订拒绝、onDiscard 生命周期和目录异常回归保留。
- `npm ci`、`npm test`、`npm run build`、`npm pack`、`node --check lib/client.js`、`git diff --check` 完成；lib 同步，运行时与开发依赖均未增加。

### 完整目标 Web 验证

隔离 `/tmp/dsh-s41-web` 安装官方 DSH `0.2.1-alpha.2` 和临时 Playwright；独立 DSH_HOME，通过官方 `dsh plugin --profile web add link:<repo>` 安装，`dsh web --patch <offline overlay> --no-open --port 18731` 启动。
overlay 用官方 insert 语法注册离线原生 LlmAdapter，另启本地 HTTP System One fixture；所有 Key 均为合成值。

| Chromium 中的实际操作 | 结果 |
| --- | --- |
| EFFORT_AUTO 无 URL 的提示；切换 Manual；恢复自动 | 正确显示 Needs Setup / Manual；无需编辑 YAML |
| 应用 NeoHorse 托管预设并核对 URL、模型、默认凭据引用，再改为离线 fixture 保存 | 通过；原生 ConfigForms 持久化 |
| 点击静态连接检查 | 展示未网络验证；HTTP fixture 请求数不增加 |
| 发送合成编程请求，经 NeoHorse 格式 fixture 分类 | 完成；原生 Adapter 响应，真实 Header/标签为 自动 · Native Balanced |
| 点击原生 Menu | 显示 Ready、NeoHorse 来源、真实档位及建议；仅一次分类 |
| 深色/浅色、390px 窄屏、截图检查 | 通过；无页面横向溢出，未遮盖发送按钮 |
| 最终浏览器流程 pageerror | 0 |

验证夹具首次 overlay 缺少 insert 导致未注册 Adapter、首次自动化选择器与欢迎弹窗不匹配，均修正夹具后重新验证；不把这些失败尝试记为成功流程。
本轮未重新做完整浏览器卸载/重装或 Windows Desktop 实机测试；这些流程的旧版 Web 记录见 S3，本轮卸载/中途卸载由 AgentLoop 回归覆盖。
**未调用真实 Jev/NeoHorse 托管 API，也未测在线准确率。Web 网络探针按 D3 的保守替代未开放**；只提供静态检查和真实分类后的验证结果。
另在隔离目录用 `npm install --omit=dev <tgz>` 安装生产包，导入正式入口与 diagnostics，核对所有 lib 字节一致、Bundle/文档/完整许可存在、没有 React/jsdom/esbuild/testkit：通过。最终构建重启 Host 后重跑上述 Chromium 流程通过。
技术边界、固定源码版本和记录隐私见 [S4.1-RELIABILITY.md](S4.1-RELIABILITY.md)。没有 Release/npm 发布或合并 main。

## S4.2A Router Lab 与只读更新检查

基线 main `2835c8f`：`npm ci`、`npm test`、`npm run build`，**91/91**。保留原有全部单元与真实 AgentLoop 回归，未改 chooseRoute/effort/classifier 算法。

新增验证包括：默认关闭/插件禁用停止采集、Turn 多步骤与原生 Header/Usage、缺失 Usage 为 null、失败尝试最终 usage 去重、反馈修订与清空竞态、失败在途写入不可复活、5000条/90天/有界队列与长 Turn 档位分布上限、跨 Profile/Session 隔离、真实原生 JSON Domain 跨 Host 重启与0600文件、采集偏好不影响路由修订、Fallback 已确认发生语义、有效远程分类延迟分母、原生认证 operator / 只读限制 / 4 KiB 请求上限 / 精确路径卸载清理。

更新使用固定源合成响应测试：无 Release、较新 Release、main/仅文档差异、未知/声明/已确认安装 SHA、npm/tgz/link、兼容性未确认与不匹配、403/404/429、网络失败、5秒超时、取消、非法 JSON/重定向/大响应、并发合并与缓存。无 shell/安装/lock 修改路径。

React DOM 覆盖原生采集草稿保存、权限/空状态、反馈绑定和 revision、清空第二次确认、JSON/CSV 下载、只读禁写、连接重置迟到结果丢弃；保留修订冲突、onDiscard 和快捷互斥回归。

### 实际目标 Web / Chromium

隔离 `/tmp/dsh-s42-web` 安装官方 DSH `0.2.1-alpha.2` / 临时 Playwright，独立 `DSH_HOME=/tmp/dsh-s42-home`，仅测试 Profile 用官方管理器 link 本工作目录；真实用户 Profile 未动。原生离线 Adapter 提供 64K/200K 目录和固定文本/Usage，未调用付费模型。使用真实浏览器鉴权、ConfigForms、模型目录、Session、Storage Domain 与 Header。

| 交互 | 结果 |
| --- | --- |
| 原生配置发现模型，启用采集/候选并保存 | 通过；无需编辑插件 YAML |
| 两次日常 Turn，第一轮 Local 自动路由、下一轮 no-url Bypass | 2条；每 Turn 一条，实际模型为 Native Quick；Provider Usage 覆盖2/2 |
| 反馈达到预期，导出 JSON/CSV | 通过；UUID/revision 对应原记录，JSON 2条、反馈1条 |
| 用户主动检查真实 GitHub | 返回暂无正式 Release、link来源、无法确认安装SHA，不判最新；无安装/升级 |
| 浏览器未认证 POST | 401；授权后可读；远程/foreign Peer 另由权限回归验证 |
| 明暗主题、390px窄屏、截图 | 已实际浏览器检查；无页面横向溢出 |

首轮 Web 暴露 `/api` interceptor 单例冲突；替换 rpc.handle 后又实际复现目标版本 Cordis shadow Context 的 webServer 注入错误。最终使用官方 `connection.fetch.register` 精确路由 + `connection.admit(request)`，不修改 Core、不绕过权限。初次自动化遇到欢迎弹窗及发送后 composer 可访问名称变化，修正夹具后重新跑通，不把失败尝试计为成功。

最终 `npm ci`、`npm test` **135/135 通过，0失败、0跳过**，`npm run build`、`npm pack`、`node --check lib/client.js`、`git diff --check` 通过。最终构建重启后恢复2条记录、1条反馈、采集与候选配置；取消清空保留2条、二次确认后为0，并关闭采集保存；再次重启最终构建确认仍为0条且采集关闭。暗色/亮色、390px和键盘折叠通过，最终浏览器 pageerror 0。

隔离 `npm install --omit=dev <tgz>` 成功，导入正式入口、逐文件核对 lib 字节与完整许可证/文档，未安装 React/jsdom/esbuild/Storage测试包。运行时依赖不变；新增3个0.2.1-alpha.2 Storage开发测试包，没有新增存储服务。tarball 35项、约96 KiB，排除 screenshots、测试夹具、原始实验数据、缓存和本地凭据；截图仅提交到仓库用于审查。真实 Windows Desktop、真实 Jev/NeoHorse 和付费 Provider 在线请求未执行；没有因果效果、节省费用或分类准确率结论。

### PR #7 两项 P1 收尾

起点/最新审查 HEAD `40214850a8556bd04a860997383301202f6b1ac8`，现有分支继续；先运行 npm ci/test/build，基线135/135。最终156/156通过，原135项保留（旧“档位分布”用例按原生事件不披露逐请求档位修正为 unknown）。

新增21项：真实AgentLoop同Turn fast→coder和原生Session契约的错误Header/失败尝试/成功结算/重复seq/Usage有无；模型请求已确认2+unknown2=总4，Token覆盖1/2；内存与真实原生Domain旧schema重启/反馈/导出兼容；固定声明SHA的ahead/behind/identical/diverged、404/422/429/500、元数据矛盾/外仓库、长历史/300文件/不完整清单/重命名代码、tgz不判最新、证据变更缓存失效、Host无需先读面板即可检查、React UI区分实际/声明/main。

真实固定源只读探针（临时Node使用环境代理，无个人Token）：S4.1固定SHA→main `2835c8f` 返回ahead 1、完整文件清单仅文档；审查SHA `4021485`→main 返回behind 1。均显示actual unknown且无Release；没有执行安装、shell、lock修改或重启。初次直接网络超时/失败，与后续成功分开记录。

本轮不声称新增Windows Desktop或完整DSH Web验证；使用真实AgentLoop、原生Session/Storage及jsdom。旧版Web截图属于此前S4.2A验收。兼容性与模型归属边界见S4.2A说明的P1节。

收尾重新执行 `npm ci`、`npm test`（156/156）、`npm run build`、`npm pack`、`node --check lib/client.js`、`git diff --check`，全部通过。Runtime/peer 依赖和锁文件未修改；tarball 35项，lib 与工作区字节一致，不含测试、截图、实验数据或凭据。

## P1 原生自动压缩与容量保护

基线 main `91926d56434dc386b8ac987faf72b2b0d81fa85c`：npm ci/test/build，156/156。目标源码为 DSH 0.2.1-alpha.2（`d743267`），实际核对 pre-step → request → Provider error → 原生压缩重试顺序。

新增17项回归：原生 Token Meter 文本估算、旧长会话原生压力压缩、已提交缓存模型的主动原生恢复、真实 Provider 超限事件及一次重试、重复超限的原生预算、失败压缩不重复执行、缓存不永久锁存、投影替换后重新解析容量、未知容量与估算失败分别处理、压缩中取消不发迟到请求。Lab 测试覆盖事件匹配、恢复/失败/未知、后一次失败不继承早先恢复、旧数据缺失字段、CSV 和 UI 元数据。原有156项全部保留。

最终 npm ci、npm test **173/173，0失败、0跳过**、npm run build、npm pack、node --check lib/client.js、git diff --check 通过。使用真实 AgentLoop / 原生 Token Meter / BasicCompactionEngine 的选择与投影替换，摘要生成采用离线确定性替身；没有调用在线付费模型。Runtime/peer 依赖不变，新增固定目标版本的 token-meter 与 compaction-basic 两个开发测试依赖，锁文件原有包版本保持不变。

Windows Desktop 和完整 Web 原生压缩流程未实机验证，不将此前 UI 浏览器截图作为本次压缩验收证据。Windows 操作步骤、自动压缩关闭/无法压缩单个大单元等保守限制、可选实验字段及回滚注意事项见 [NATIVE-COMPACTION-FIX.md](NATIVE-COMPACTION-FIX.md)。

生产包另在隔离目录执行 `npm install --omit=dev <tgz>` 并导入正式入口通过，未安装 token-meter / compaction-basic 开发包。tarball 36项、约109 KiB，逐字节核对 lib 一致；含新增说明、不含测试/截图/实验数据/本地日志。可选原生服务不存在不影响插件加载。
