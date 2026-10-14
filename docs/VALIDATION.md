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
