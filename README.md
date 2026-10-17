# DSH Adaptive Router

轻量 DSH 原生插件：把主会话的任务复杂度、能力需求和上下文转为 **Provider + Model + 合法 Reasoning Effort**。没有后台服务、Gateway、Python 或本地模型。

第一阶段目标版本：**DeepSeek Harness `0.2.1-alpha.2`，Node.js ≥22**。已在对应 npm 包的真实 AgentLoop 中验证；未承诺旧 DSH 版本兼容。运行时直接依赖为 Schemastery 和 Zod；使用目标 DSH 自带的 `dsh-system-prompt` peer 接口渲染提示词。

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
- DSH 原生插件页提供可搜索、按 Provider 分组的候选模型选择器、能力/用途与合法档位配置；无需手工查 ID 或编辑 YAML。
- 输入框状态标签显示 DSH 已记录的实际模型/档位；点击原生菜单查看原因、异常和插件级模式，空闲时可快速切换。

## Router Lab（S4.2A）

原生插件配置中的 **路由实验室**，开启「记录使用数据」并保存后，日常根会话 Turn 可形成跨重启的本地元数据记录。默认关闭，不保存聊天或密钥；首层显示四个概览指标，更多统计和最近记录可展开；通过「导出数据」菜单选择 JSON/CSV，在「数据说明与管理」中二次确认清空。completed 只代表执行流程完成，不能直接证明任务成功或路由改善。

配置底部 **更新与维护** 提供主动只读查询，区分正式 Release 与 main；无法从公开接口获取安装 SHA 时明确显示未知，不自动安装或升级。固定 SHA 可作为明确标注的“声明来源”与 main 比较，tgz 不会因版本号相同被判为代码最新。请求分布采用消息自身来源，失败尝试与旧版未验证分布单列 unknown，最终 Header 单独展示。实验数据访问仅开放给原生认证的本地 loopback operator Profile；远程或未知授权边界保守关闭。存储、隐私、卸载保留规则与限制见 [S4.2A 说明](docs/S4.2A-ROUTER-LAB.md)。以下安装示例固定已合并的 **S4.2A** 代码快照；它仍是开发版本，不是稳定发行版。

## 安装

仓库提供预构建的 `lib/`，可直接从 GitHub 安装（需要已安装目标版本 DSH 和 pnpm）。**S4.2A Router Lab 与只读检查更新已通过 [PR #7](https://github.com/Xuanyi-king/DSH-Adaptive-Router/pull/7) 合入 main；尚未发布 npm 或正式稳定版**。下面固定到本次 S4.2A 合并提交，避免 `main` 后续变化影响安装：

```bash
dsh plugin --profile web add github:Xuanyi-king/DSH-Adaptive-Router#67580652650abcb2b768c6322276e86276d916c3
# 重启 dsh web，并硬刷新浏览器
```

此 SHA 包含 S3 原生配置、S4.1 的路由诊断与 NeoHorse-Jev，以及 S4.2A 的可选 Router Lab 持久化采集、反馈与导出、只读检查更新，以及已修复的模型请求归属统计。目标环境为 DSH `0.2.1-alpha.2`、Node.js ≥22；离线模型与浏览器验收记录见 [VALIDATION.md](docs/VALIDATION.md) 与 [S4.1 说明](docs/S4.1-RELIABILITY.md)，**真实托管 Jev / NeoHorse 和付费模型仍需实机验证**。它是固定的已合并源码快照，不表示发布了稳定版 Tag。后续发布正式版本时应改用可追溯的版本 Tag。

普通安装/升级可能复用旧 lock commit。升级时先从外部终端停止 Host，再使用明确的完整 SHA 或构建好的 tarball，仅更新本插件；保留旧 SHA、tgz 和 Profile lock 便于回滚。安装后核对 lock 解析 SHA、磁盘 package 版本及原生插件 active 状态，然后重启 Host、硬刷新 Web Client。**不要删除整个 lockfile 或顺带升级其他插件**。

尚未发布 npm 包。也可克隆源码并**检出同一 S4.2A 合并提交**，再构建本地 tarball：

```bash
git clone https://github.com/Xuanyi-king/DSH-Adaptive-Router.git
cd DSH-Adaptive-Router
git checkout 67580652650abcb2b768c6322276e86276d916c3
npm ci
npm test
npm pack

dsh plugin --profile web add ./dsh-plugin-adaptive-router-0.1.0.tgz
# 重启 dsh web，并硬刷新浏览器
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

### 首次试用（S4.1 路由 + S4.2A Router Lab）

- 使用**正在运行的 Profile**：例如 Windows Desktop 的 `desktop`，不要误装到 `web`。已安装的本地 tgz 不会因 main 合并自动更新；先停止 DSH、备份旧包与 Profile lock，按上述固定 SHA 重新构建/升级**本插件**，重启后核对 active 与实际安装来源。不要删除整个 lockfile。
- 在 DSH 原生凭据管理中添加分类服务的密钥引用；插件的分类器预设支持原版 Jev、NeoHorse-Jev 托管/本地及自定义 System One。模型权限和 API Key 需要另行获得；不要把密钥填在 URL 中。
- 先选 `EFFORT_AUTO`，保持 DSH 原生模型。该模式**无需配置候选模型**，但普通任务要依靠 System One 服务分类；当前模型没有可调档位时会保持默认，不算故障。
- 插件页「测试连接（静态检查）」**不会发送网络请求**。只有之后发起真正的任务并成功完成分类，才会显示相关服务已验证；简单问候可能走本地快速判断，不会证明服务可用。
- 再按需要选择 `FULL_AUTO` 并明确授权候选模型、设置能力层级与角色。通过聊天菜单核对**已提交的实际 Header**、原生覆盖、Bypass/Fallback 和原因。初次不要用重要工作或长会话验证。
- 分类请求会向你配置的 System One 服务发送当前用户文本及裁剪后的前文上下文。若使用托管服务，请先确认隐私边界和费用。没有真实 API 权限时可以使用离线测试夹具，不要声称线上路由已验证。
- 在本地认证的 operator Profile 中，进入 **Router Lab**，显式启用实验数据采集并保存。完成几个正常 Turn 后检查记录数、模型来源覆盖率和 Token 数据覆盖率，重启后确认数据保留，再测试 JSON/CSV 导出。实验数据未加密，关闭采集不会自动删除历史；卸载前可主动清空。

## 兼容性、升级与卸载（2026-10 生命周期审计）

- **实测范围**：Linux / Node.js 24 / DSH **`0.2.1-alpha.2`**；隔离 tgz 安装、冷启动、原生 AgentLoop 与模型选择投影、工具多步请求、禁用/卸载/重装以及与另外三个 Bundle 同 Profile 共存。生命周期回归审计 **40/40 PASS**；后续 S3 原生可视化界面的额外验收见 [S3 验证记录](docs/S3-NATIVE-UI.md) 和 [验证汇总](docs/VALIDATION.md)。其它 DSH 版本、Windows Desktop、真实 Jev/付费 LLM 以及第三方路由器组合 **NOT TESTED**。
- **关键修复**：原生 working-directory / session-reference 稍后插入提示词时，旧版本可能在第二个工具步骤误报“上下文不可测量”；当前按已验证的 Cordis 事件快照时机重新获取提示词，并逐步复查容量。真正超限的请求仍会 **Blocked**，不会通过关闭容量检查来冒险切换小窗口模型。
- **升级回滚**：使用本页的固定完整 GitHub SHA 或固定 tgz；在外部终端停止 Host，保存旧包、原 SHA 以及 Profile 依赖与 lock，**只更新本插件**。重启后核对实际解析 commit、客户端/宿主代码和 `active`，Web 界面硬刷新。当前未发布正式 npm 包，`main` 的新增代码也不会自动更新既有安装。
- **卸载与残留**：停宿主后通过原生插件管理器或上面的 `dsh plugin --profile web remove dsh-plugin-adaptive-router` 移除；冷启动后不应继续注册路由监听、Session Projection、Remote 服务及状态标签。普通卸载不会改写/清空 DSH 的原生历史 Session、已使用模型 Header 或 Profile 配置数据；这些保留记录不是活动路由残留。
- **共存原则**：已知 Jev Effort Selector 冲突会触发本插件让出自动控制；其他自动路由插件无法可靠通用检测，建议单会话只使用一种自动路由方案。

详见 [DSH 生命周期审计](docs/DSH-LIFECYCLE-AUDIT.md)，其中区分真实 Host 测试、脚本化 provider 和未测试平台。源码合并不等于发布新安装包或线上准确率验证。

## 配置

在 **Web → 插件 → dsh-plugin-adaptive-router** 打开配置：

1. 开启智能路由，选择四种模式之一。
2. 在现有 Host 模型目录中搜索并勾选候选，设置「简单/均衡/复杂」能力和「通用/编程/推理」用途。默认不授权任何模型；能力由用户设置。
3. 各任务档位选择「自动映射」或该模型原生声明的合法档位；支持显式 max/xhigh。没有档位的模型由模型默认处理。暂时不在目录中的旧候选保留，可停用或显式移除。
4. 在「任务分类服务」选择服务类型，预设直接写入草稿。核对接口地址、分类模型及 API Key 凭据名称（不是密钥）；真实密钥在 DSH 凭据管理中保存。自定义名称和阈值会保留。
5. 点击「保存」写入 Host。离开页面放弃未保存草稿；保存失败或修订冲突会明确提示。仅有读权限的连接不能写入。

候选取消勾选会停用而保留能力配置；「移除这项配置」才删除它。若模型已不再声明档位，旧映射不会自动丢弃，可显式清除恢复模型默认。
输入框标签点击后显示当前模式、真实 Provider/Model/Effort 和最近原因。快捷模式是**所有会话共享的插件级配置**，不是 Session 私有模式；当前会话执行中或只读时禁止快捷修改，其他会话仍遵守原有配置修订与手动优先约束。原生模型选择器保持独立且优先。

### 就绪与任务分类服务

配置顶部用中文区分需要配置、待验证、正常、已降级、手动控制等状态；手动模式无需 Jev，EFFORT_AUTO 无需候选池。设置页没有绑定 Session 时，会明确提示在聊天菜单核对当前原生模型。

任务分类服务可选择 Jev、NeoHorse 托管、本地或自定义 System One。选择预设即写入草稿，再明确保存；可撤销未保存修改，保留自定义凭据引用和阈值；原版 URL 不自动重置。NeoHorse 托管预设为 `https://tokenrhythm.studio/v1/systemone` / `NeoHorse-Jev-4B`，默认引用 `TOKENRHYTHM_API_KEY`。本地示例 `127.0.0.1:8080` 指 **DSH Host** 所在环境，不会自动启动模型。

“检查配置”只检查已保存地址/凭据，不发网络探针；目标 DSH 尚无确认可安全复用的探针权限契约。只有相同配置真实分类成功后才标记 Ready，并展示验证时间。这不代表分类准确率或最终模型成功；NeoHorse confidence 不是正确率，也不与 Jev 直接比较。

聊天标签仅显示简短控制状态和实际模型；点击原生菜单看完整档位、来源、原因与建议。`Bypass` 表示自动决定未应用、保留原请求；`Fallback` 仅表示确认应用了配置的备用模型。历史只保留每会话最近 20 Turn 的内存元数据，Web 只展示最近决定，不存聊天或密钥。

上述安全语义在 S4.1/S4.2A 已具备；这里的新布局与操作名称对应 S4.3 源码，页首固定 S4.2A 安装快照仍使用旧界面。详见 [S4.3 界面验收](docs/S4.3-NATIVE-UX.md)。

仍可选用 YAML 配置。也可在
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

该补丁按 row id 覆盖，替换整段 config；其余字段使用插件默认值。保存后重启，或在原生插件配置页保存 volatile 配置即时生效。轮中更改候选池/模式会停止复用旧自动决定，下一轮重新决策。

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

上下文过滤依据实际历史、当前已接受的消息、DSH 原生渲染的系统/运行时提示词和工具声明。存在原生 Token Meter 时复用其估算与模型声明的输出预留；缺少该服务时保留 UTF-8 字节保守估计。短任务可切换到较小窗口；长上下文或输出上限可能超出目标容量时保持当前模型。附件、延迟工具、未知内容块或缺失提示词快照无法可靠估算时，仍采用不缩小已知窗口的保守策略；目标窗口未知时不自动切换。不加载 tokenizer，最终模型/档位解析仍由 DSH `prepareCall` 负责。

本轮决定优先复用：配置、手动意图和 `llm/adapters-updated` 修订未变时，不重复查询模型目录或能力。DSH 仍对每次真实请求准备并校验目标。原生目录变更通知会使缓存失效，只重新检查原目标，移除或不合法时放行原请求；不再次分类。
每次缓存复用仍检查最新可见历史、尚未入日志的输入和原生提示词/工具声明，正常步骤不重复查询目录。已提交的缓存模型容量不足时，若原生自动压缩可用且本步尚未尝试，先调用原生恢复策略一次；压缩后重新读取真实投影与目标容量。仍不安全时才 `Blocked`，并区分估算不足、估算不可用和容量声明缺失。原生 Provider 超限重试不重复计入已入日志的输入，也不会永久锁住已被压缩修复的决定。不会假定 `original` 能恢复最初模型；明确手动选择仍优先。`prepareCall` 的参数校验不是完整上下文 Token 校验。实现边界、Router Lab 压缩记录及 Windows Desktop 验收步骤见 [原生压缩修复说明](docs/NATIVE-COMPACTION-FIX.md)。

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
- S3 已在完整目标版本 DSH Web + Chromium 中验证配置保存/重启恢复和原生状态菜单，使用离线注册模型，不代表真实线上服务效果。显示以最终原生 Header 为准，不能保证远端最终成功完成。
- 单元/AgentLoop 测试中的意图投影使用契约夹具，原生覆盖器使用真实 `installModelSelection`；另已在完整 Web 中实际操作原生选择器，验证提交前标签不变、提交后手动模型优先。
- 仅保证主会话；`origin: subagent` 不参与。没有统一工具能力元数据，不虚构模型工具支持评分。
- 与已知 Jev Effort Selector 冲突时退出本插件全部自动控制。其他未声明的 request 修改插件无法通用识别；建议同一会话只用一个自动路由器。
- 只验证 `0.2.1-alpha.2`，旧版本不在本阶段兼容承诺内；未发布 npm。

源码研究与复用记录：[docs/RESEARCH.md](docs/RESEARCH.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。本项目 MIT。S3 原生交互、接口和验证记录见 [docs/S3-NATIVE-UI.md](docs/S3-NATIVE-UI.md)。
