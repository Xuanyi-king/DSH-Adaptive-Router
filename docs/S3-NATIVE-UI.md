# S3 原生配置与交互

基于 main `f9d4325ccb03367ba8fe629eb0f1b23ad31dc9de`，分支 `feature/s3-native-ui`。
目标 DSH `0.2.1-alpha.2` / Node.js ≥22。官方源码核对版本为 tag
`dsh-v0.2.1-alpha.2`、提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`，并以相同版本发布包运行完整 Web 验证。

## 入口与操作

- Web → 插件 → `dsh-plugin-adaptive-router`：原生 Bundle 配置区；也注册该 Bundle 的 `adaptive-router` 行配置入口。
- 基础开关、四种模式、原生模型/档位锁；MODEL_AUTO 的固定档位及授权回退模型。
- 现有 Host 模型目录按 Provider 分组，支持名称/ID 搜索、显式勾选/停用、完整 ID 展示和目录刷新。不默认勾选；目录滚动区避免大量模型挤占编辑区。
- 候选配置保留用户顺序，能力 tier 和 roles 由用户声明。档位来自原生 reasoning.efforts；自动预览调用现有 effortFor，无新算法。
- 没有显式 reasoning 的模型显示「由模型默认处理」；旧映射在用户显式清除前保留。目录暂缺的候选不丢失，新启用已不可用模型会被拒绝。
- Jev 设置只有地址、分类模型、凭据**引用**和已有高级选项；不读取或返回凭据原始值，不新增 Provider 配置。
- 输入框沿用 conversation.input.right：紧凑真实状态、长名称截断/完整悬停提示；原生 Menu 展示实际路由、最近原因、Blocked/Conflict/Fallback/Native/Auto 和插件级模式。
- 快捷写入仅在当前 Session 明确空闲且原生配置可写时允许；执行中和只读连接禁用。UI 和回调均检查运行状态。模式适用于所有会话，其他会话通过已有路由修订检查处理变化，不宣称跨会话原子暂停。

## 原生接口与数据流

| 官方源码（上述固定提交） | 使用方式 |
| --- | --- |
| `packages/client/ui-plugin-manager/src/client/slot-contract.ts`，`PluginManagerPage.tsx` | plugins.bundle.config 以包名为 key；plugins.row.config 以包名#行 id 为 key。使用现有页面，不建侧栏或后台 |
| `packages/client/ui-settings/src/client/config-form.ts` / `config-form-types.ts` | configForms.get('adaptive-router') 的响应式快照、mutate(ops, expectedRevision)。只写用户编辑过的字段，不替换整个配置 |
| `packages/api/settings-controller/src/index.ts`；`packages/settings/settings/src/index.ts`；`packages/boot/config-editor/src/index.ts` | 原生权限/只读约束、Schema 与 volatile 路径校验、修订拒绝、官方 Profile 写入。插件不直接写配置文件或数据库 |
| `packages/api/session-controller/src/catalog.ts`，`src/index.ts` | ctx.remote.session.modelCatalog() → buildModelCatalog → listProviders/listModels/resolveModelInfo。只有名称、ID、合法档位及隔离的 Provider 失败；不重新发现外部模型 |
| `packages/client/ui-model-selection/src/client/catalog.ts` / `service.ts` | 核对其目录生命周期。该服务的共享根 catalog 是 private，不能从原生选择器取根目录供设置页使用；因此使用公开 Remote 的一个 UI 快照，不访问私有对象或另建 Host 注册表 |
| `packages/client/ui-primitives/src/index.ts` 及 Button/Checkbox/Switch/Input/Menu/SettingsForm 源码 | 复用这些公开组件和 --dsw-alias-* 主题变量。没有公开 Select/Popover 导出，使用可访问的 HTML select + 原生 Menu，不编造接口 |
| `docs/subsystems/slots.md`；`packages/client/ui-plugin-manager/src/client/index.ts` | Slot 注入和注册跟随 Cordis effect 生命周期；原生 pluginNavigation.openBundle 打开已有配置位置 |

配置数据流：原生 ConfigForms 快照 → 页面局部草稿（首次编辑保留修订） → 目录复查/合法映射检查 → 原子路径 mutate → Settings Controller/Schema/Config Editor → volatile 生效和原生镜像回读。

失败保留草稿；重复点击只写一次；修订变更不自动覆盖；离开页面不写入。启用字段不清空其他配置，标准 Bundle row id 继续为 adaptive-router，因此正常重启/重新安装可复用 Profile 用户层。自定义改名该 row id 不在此页面的兼容承诺内。

目录使用公开 llm/adapters-updated、settings/document-updated、credentials/record-updated、credentials/reference-updated 与 connection/reset 失效，generation 拒绝旧 Host/旧请求结果。订阅和 Slot 注销由 Cordis effects 管理。不会在 Agent 步骤上请求 UI 目录。

实际路由始终读 adaptiveRouter 投影的原生已提交 Header，计划选择与 Header 不一致显示 Native override。Host 查询只返回 turn/selection/reason/control，删除内部 configKey/modelInfo/cache 数据的浏览器暴露；没有新增写 Remote。当前配置模式和最近请求的控制结果分别展示，不把新模式伪装成已经执行过的请求。

## 文件与依赖

| 文件 | 改动 |
| --- | --- |
| `src/client.js` | 两个原生配置 Slot、候选编辑、Schema 保存交互和原生快捷 Menu |
| `src/ui.ts` | 少量目录投影、已授权候选/合法档位检查、effortFor 自动预览与真实状态匹配 |
| `src/index.ts` | 仅收窄 RouterRemote DTO；路由/缓存/生命周期逻辑未改 |
| `test/client.test.mjs` | 真实 React DOM 的最小交互回归，组件和 transport 使用明确契约夹具 |
| `package.json` / lock | esbuild 构建单个浏览器 bundle，把现有 effortFor 打包进 client；React/ReactDOM/jsdom 仅开发测试 |
| `lib/`、README、本文与 VALIDATION | 同步构建与用户操作、验证记录 |

新增运行时依赖 **0**。原生 React、UI primitives、client-store 由目标 DSH ModuleLoader 提供，不把它们复制或嵌入插件；新增开发依赖 esbuild 0.25.12、React/ReactDOM 18.3.1、jsdom 26.1.0。原有 router/classifier/context/config 和 PR #3 hook 实现保持不变。

## 验证与限制

基线 npm ci + npm test 为 **42/42**。新增 UI 回归覆盖授权保存/修订号、合法 max、失效候选保留、保存拒绝保留草稿、目录移除、真实 Header override、执行中禁用模式、空目录/失败/只读、重复保存及原生全局模式写入。审查发现无 reasoning 时缺少旧映射清除入口，先复现失败再补显式恢复并保留候选能力。

最终命令、数量与完整 Web 验证结果见 [VALIDATION.md](VALIDATION.md) 的 S3 小节。

已知边界：目录可用仅表示 Host 原生目录声明，不保证远端认证/服务成功，也不代表智力评分。只读/缺少原生配置服务的 profile 不提供写入；仅承诺目标 Web profile。未验证真实 Jev/付费模型、远端只读部署端到端或跨提供商质量；不为这些场景建立兼容层。没有 Release/npm 发布/S4。
