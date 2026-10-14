# DSH Adaptive Router

轻量 DSH 原生插件：把主会话的任务复杂度、能力需求和上下文转为 **Provider + Model + 合法 Reasoning Effort**。没有后台服务、Gateway、Python 或本地模型。

第一阶段目标版本：**DeepSeek Harness `0.2.1-alpha.2`，Node.js ≥22**。已在对应 npm 包的真实 AgentLoop 中验证；未承诺旧 DSH 版本兼容。运行时只有 Schemastery 和 Zod 两个直接依赖。

## 功能

- 一个 Jev System One Choice 请求判断能力层级、任务角色和是否继续旧任务。
- 只路由到用户启用且 DSH 目录中存在的候选模型；不根据名称猜能力。
- 读取 DSH `reasoning.efforts`，按模型自身声明顺序选择，允许用户配置各层级的档位映射。
- 上下文信封来自 DSH 原生会话日志，包含上一轮用户要求、助手结尾、步骤/工具数、未完成 Todo 和真实模型/档位。
- 未完成任务的继续优先保持模型和档位；需求超过模型配置能力时允许升级。
- 每轮只分类一次；后续工具步骤与第一步重试复用决策，失败也不重复分类。
- 原生显式模型/档位选择优先；四种模式和长期手动锁；子 Agent 不干预。
- 超时、缺密钥、无地址、异常标签、模型目录错误均保留原调用；目录等待也有上限。
- 检测 Jev Effort Selector 冲突后，本插件退出自动控制。
- 最小 Web 状态标签只显示 DSH 已记录的实际模型/档位；悬浮说明决策或回退原因。使用 DSH 自动生成的配置表单，不另建设置页面。

## 安装

仓库提供预构建的 `lib/`，可直接从 GitHub 安装（需要已安装目标版本 DSH 和 pnpm）：

```bash
dsh plugin --profile web add github:Xuanyi-king/dsh-adaptive-router
# 重启 dsh web
```

尚未发布 npm 包。也可克隆源码后构建并使用本地 tarball：

```bash
git clone https://github.com/Xuanyi-king/dsh-adaptive-router.git
cd dsh-adaptive-router
npm ci
npm test
npm pack

dsh plugin --profile web add ./dsh-plugin-adaptive-router-0.1.0.tgz
# 重启 dsh web
```

开发时也可以链接已构建目录：

```bash
dsh plugin --profile web add link:/workspace/dsh-adaptive-router
```

其他 profile 将 `web` 换为实际名称。这里是标准 DSH Plugin Bundle，安装命令自动维护 profile 依赖与 bundle 列表；不改 DSH Core。

停用：配置 `enabled: false`，或移除包：

```bash
dsh plugin --profile web remove dsh-plugin-adaptive-router
# 重启对应 profile
```

停用后插件不改写任何请求。DSH 会继续使用其当前合法原生选择；插件不会偷偷改回旧模型或修改用户选择记录。

## 配置

在 Web「插件」中打开本包的生成配置表单。也可在
`$DSH_HOME/profiles/web/cordis.patch.yml` 中加入以下标准配置覆盖层。
下面的 provider/model 是占位符，必须替换为 DSH 原生模型选择器中的真实注册 ID。

```yaml
- id: adaptive-router
  name: dsh-plugin-adaptive-router
  config:
    enabled: true
    mode: FULL_AUTO
    apiUrl: 'https://YOUR-JEV-ENDPOINT/FULL-SYSTEM-ONE-PATH'
    apiKeyEnv: JEV_API_KEY
    classifierModel: jev-latest
    timeoutMs: 5000
    confidenceThreshold: 0.6
    lockModel: false
    lockEffort: false
    fixedEffort: ''
    fallback: 'YOUR_PROVIDER/YOUR_BALANCED_MODEL'
    candidates:
      - provider: YOUR_PROVIDER
        model: YOUR_FAST_MODEL
        enabled: true
        tier: simple
        roles: [general]
        effortByTier:
          simple: off
      - provider: YOUR_PROVIDER
        model: YOUR_BALANCED_MODEL
        enabled: true
        tier: moderate
        roles: [general, coding, reasoning]
      - provider: YOUR_PROVIDER
        model: YOUR_CODING_MODEL
        enabled: true
        tier: complex
        roles: [coding, reasoning, general]
        effortByTier:
          moderate: medium
          complex: high
```

该补丁按 row id 覆盖，替换整段 config；其余字段使用插件默认值。保存后重启，或在生成表单中保存 volatile 配置即时生效。轮中更改候选池/模式会停止复用旧自动决定，下一轮重新决策。

### Jev 密钥与隐私

`apiUrl` 是完整的 System One URL，默认空，不猜测服务地址。插件发送
`{ model, state, questions }`，使用 Bearer Token；服务必须支持 Choice 问题。

密钥通过 DSH Credentials Service 按引用解析，可用原生凭据界面保存 `JEV_API_KEY`，
也可以在启动 DSH 前导出：

```bash
export JEV_API_KEY='YOUR_TOKEN'
dsh web
```

未提供 Credentials Service 时才直接读取指定环境变量。不保存明文密钥，不在状态或日志返回密钥，不调用 OpenAI API。

除确定独立的问候外，分类请求会把当前用户文本及裁剪后的上一轮上下文发给配置的 Jev 地址。保留了中文/英文“继续”、确认和简短修改请求的上下文依赖；不会因消息短就判定简单。未配置 Jev 时这些任务保持 DSH 当前模型/档位，不擅自降级。

### 候选模型与档位

`tier` 为用户声明的能力上限：`simple < moderate < complex`；`roles` 为用户授权的适用任务。
同一层级按配置顺序选择，优先最低足够能力层级。强模型可以承担低层级任务。
DSH 目前没有统一智力或编程评分，因此这些不能自动推断。

档位只使用 `resolveModelInfo().reasoning.efforts` 中的合法 ID。默认派生最浅、中间和较深档位，优先 `medium/high`，不会默认把 `max/xhigh` 用于所有复杂任务。
`effortByTier` 可表达每个模型的不同档位含义；非法配置映射忽略，回到该模型的合法映射。不支持显式档位的模型会省略 `reasoningEffort`，由 DSH/provider 默认处理。

图片能力优先使用 `inputModalities`；元数据未知时可为候选设置 `images: true/false`。显式不支持图片的声明不能被配置覆盖。原生保留图片历史也参与过滤。

为了防止多轮上下文缩水，当前模型窗口已知时，不自动切换到更小或未知窗口的候选；窗口更小的便宜模型可能因此不会被选中。这是第一阶段保守策略，不做近似 Token 预测。

`fallback` 必须引用启用且目录存在的候选。**当前模型合法时，分类失败始终保留当前模型；仅目录明确说明当前路由已不存在时，才使用配置的回退模型。**目录错误不等于模型不存在。没有可靠回退时原样交还 DSH，不掩盖原本已存在的配置错误。

### 四种模式

| 模式 | 模型 | 档位 |
| --- | --- | --- |
| FULL_AUTO | 自动 | 自动 |
| EFFORT_AUTO | 保持当前原生模型 | 自动 |
| MODEL_AUTO | 自动 | `fixedEffort`，为空时保持当前档位 |
| MANUAL | 原样放行 | 原样放行 |

`lockModel` 和 `lockEffort` 分别长期锁住原生当前模型和档位，优先于自动模式。
原生 `modelSelection.pending` 代表用户明确点击选择：本轮整体听从这次选择，轮中选择从下一次请求起生效。下一轮恢复插件模式；长期固定请用锁或 MANUAL。

MODEL_AUTO 或锁定档位时，只考虑能合法接受该固定档位的模型；找不到则保持原请求。缺少原生手动意图投影的入口保守放行，不能靠比较模型字符串猜测用户是否动过选择器。

## 验证与限制

```bash
npm test         # 构建 + 单元测试 + 实际 DSH AgentLoop 集成测试
npm pack         # 预构建 Plugin Bundle，包内包含 lib/ 和许可证
```

测试使用真实 DSH 生命周期、原生选择器请求控制、日志投影、请求校验与 provider dispatch；本地 Jev HTTP/测试 LLM 适配器不代表付费线上模型效果。测试结果见 `docs/VALIDATION.md`。

- 此环境没有真实 Jev / LLM 凭据；未执行线上模型调用或质量测评。
- Web 标签已实现，但未在完整浏览器 profile 中做人眼验证。显示以最终原生 Header 为准，不能保证请求后来在远端成功完成。
- 原生模型选择的意图投影在测试中用契约夹具提供；原生请求覆盖器使用真实 `installModelSelection`。完整 Web SessionController/浏览器端到端未验证。
- 仅保证主会话；`origin: subagent` 不参与。没有统一工具能力元数据，不虚构模型工具支持评分。
- 与已知 Jev Effort Selector 冲突时退出本插件全部自动控制。其他未声明的 request 修改插件无法通用识别；建议同一会话只用一个自动路由器。
- 只验证 `0.2.1-alpha.2`，旧版本不在本阶段兼容承诺内；未发布 npm。

源码研究与复用记录：[docs/RESEARCH.md](docs/RESEARCH.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目 MIT。
