# DSH 生命周期审计（2026-10-14）

插件 **dsh-plugin-adaptive-router 0.1.0**，基线main `ea0853d`；只支持精确DSH **0.2.1-alpha.2**。本轮修复原生提示词快照时机、提供固定来源安装说明；不重设计分层/选模/Reasoning Effort算法，不新增依赖/UI/后台服务。

## 官方依据与已有PR

最新Release [dsh-v0.2.1-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.2)源码 `d743267388641bc76f17c45ce8b4c231aed1d32c`；npm alpha同版，latest/next是0.2.0-rc.2。本轮Linux/Node24.19.0，真实运行该精确版；旧版/其他DSH **NOT TESTED，不扩大peer**。

核对tag的 LLM resolveModel/listModels/reasoning metadata、`packages/core/agent/src/model-selection.ts:81`、`packages/api/session-controller/src/model-selection-projection.ts:58`、Session/Projection、SystemPrompt render/refresh，以及 `packages/session/working-directory/src/index.ts:96`、`packages/context/session-reference/src/index.ts:128`。Cordis **4.0.5-alpha.1** 的 `lib/index.js:258–266` 明确 internal/dispatch 同步发生于listener snapshot之前，`on` 会把boolean归一化为EventOptions；新捕获没有假定未核实的事件顺序。参考六项指定升级Skill（参考库 `ef075767b476e8000c716a18f848028eebcd5aef`）。

已有[PR#2](https://github.com/Xuanyi-king/DSH-Adaptive-Router/pull/2)只调整 `src/router.ts` 的named-medium中点回退和上游说明，本轮读完整差异后未重复该算法修改、未合并它。本轮捕获修复位于 `src/index.ts`，并同步已有lib。

## 安装、升级、卸载与持久化

原生一个Bundle，`cordis.patch.yml` row id adaptive-router、包名dsh-plugin-adaptive-router；Client loader id为包名。预构建lib入口/Client/type/patch/许可都在tgz。推荐已验证固定tgz或完整GitHub commit SHA；普通install可能保留旧lock commit，升级必须核对解析SHA/磁盘version/运行active，而非只看安装exit0。GitHub消费、npm发布、远程tarball、link、Windows/Desktop本轮 **NOT TESTED**；真实本地tgz/Web已验证。

开发 `npm ci && npm test && npm pack`；现有prepack会编译TypeScript，开发打包需要dev deps。正式消费者直接安装预构建tgz，不引入新的构建框架/运行testkit。停Host后只更新此包，保留旧固定产物/SHA、Profile package/lock和配置；启动后核对模型实际request/header，再硬刷新Client。回滚原固定产物/配置，不清Session或升级其他插件。

配置由原生Profile覆盖层/配置服务管理（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`）。会话projection/模型选择保留在宿主原生Session数据（本轮Linux观察为 `$DSH_HOME/sessions/<workspace-key>/<session-id>/`、`$DSH_HOME/storages/session_projcache/`）；插件自己没有模型配置数据库或跨Profile持久缓存。held/pending为Agent WeakMap，展示records在agent/disposed时删除，plugin dispose清空；原生Projection、Remote service、事件监听与Slot按Cordis scope释放。卸载不删除历史header/路由配置；历史“实际使用模型”不是活动路由器残留。

普通原生disable/remove后不得继续修改request；无HMR时停Host再remove。重装会读原配置、重新从原生历史恢复合法投影，不直接修改旧Session；彻底清数据须用户人工备份后只处理自己的Profile覆盖项/Session，不提供自动全目录清理器。

## 发现与最小修复

| 等级 | 文件/位置 | 复现与源码证据 | 实际处理 |
| --- | --- | --- | --- |
| P1 | `src/index.ts:118,131,153,173,275` | 真实Standard+ADW多步turn：先选fast，再adw_status，第二步误报context不可测量。诊断history全为text/tool-call、无deferred tools、prompt约5.6KB，却assemblyReliable永久false。官方working-directory/session-reference稍后prepend assembly即触发旧全局sticky flag | 在已核实Cordis dispatch snapshot之前重座assembly观察器，记录捕获revision并检查本次快照；仍测量最终assembly与真实history。算法、阈值、未知附件/过大上下文阻断、手动优先不变 |
| P2 | `README.md:20` | 原GitHub默认分支安装不可复现，克隆后cd路径不匹配repo名 | 固定SHA安装示例、只更新此包的lock/runtime验证与回滚说明，纠正目录；不发布npm |
| P2/残余 | `src/index.ts:203`（conflict）及内部监听 | 已知Jev selector通过service/runtime身份检测；其他自动路由器无通用身份，无法以listener顺序保证共存 | 保留已知冲突退出，不造兼容包装/猜事件顺序；同会话只启用一个自动路由器 |

## 七类风险扫描

| 类别 | 结论 |
| --- | --- |
| 源码补丁/monkey patch | 无Core patch或替换LLM/AgentLoop；Router仅公开waterfall贡献 |
| 内部事件 | internal/listener/dispatch对已验证Cordis版本有明确契约；assembly/revision重座有回归，仍是将来升级重点 |
| 服务/Remote | sessionProjections、llm、systemPrompt、optional credentials与原生typert service；modelSelection.pending真实源码核对 |
| DSH路径 | 不读写宿主安装/数据库文件；仅读取原生Session/projection |
| UI/注册 | 官方conversation.input.right Slot、Client loader包名；重复重装不重复Remote/Projection |
| HTTP/RPC/DOM/CSS | Jev fetch有timeout/AbortSignal；Remote走宿主认证API；状态chip不创建HTTP服务/全局CSS |
| 子进程/输出 | 无运行子进程、stdout解析、安装后台任务 |

## 测试结果

| 项目 | 结果 |
| --- | --- |
| 原 `npm ci && npm test` | **PASS 39/39** |
| 新回归 + build/lib/pack | **PASS 40/40**，0skip；late native-style assembly+小tool第二步回归先FAIL再PASS；过大真实tool结果、未知outer transform、手动优先、取消、缓存/跨Session、late Jev service冲突等原测试仍通过 |
| 正式入口/实际路由 | **PASS**：临时DSH_HOME的CLI安装tgz、Web冷启唯一active、真实SessionController modelSelection投影、真实AgentLoop request/header/scripted provider从balanced→fast，Client无pageerror |
| 禁用/卸载/重装 | **PASS**：native disable/enable时service退出/重建；停Host/remove/冷启无router service和插件条目、原生turn正常；reinstall再路由且无重复注册 |
| 四包组合 | 修复前 **FAIL（已复现）**；修复后 **PASS**：ADW message→tool→response完成两步，三个preset与原生模式同Profile、无registry/Bundle/route/tool冲突，卸载/重装数据保留 |
| 已知Jev冲突/手动优先 | **PASS（真实Loop+契约fixture）**；没有安装真实第三方Jev插件，完整第三方产品组合 **NOT TESTED** |
| 其他路由插件/真实Jev和LLM/Windows/Desktop/真实历史用户数据升级 | **NOT TESTED**，无相应实例/凭据，不声称线上效果或全面兼容 |

正式入口一次性诊断脚本在仓库外 `/workspace/audit-lab/run.mjs` 与 `probe.mjs`：`node .../run.mjs router /workspace/audit-runtime/latest`、`... all`。脚本/脱敏结果随总交付保留，未创建新测试框架；所有测试独立DSH_HOME/DSH_AGENTS_HOME，只有模型网络边界scripted。用户可按README固定产物安装→冷启核对native header→停/remove→冷启确认原生fallback→reinstall复验。

## 发布建议与剩余风险

建议审查本轮PR后从干净提交打**新的固定版本候选**，仍需真实Jev/provider与目标平台验收后人工决定发布；本轮版本不变、不创建Release/npm。最新精确版Linux基本原生生命周期与四插件组合有证据；不能推广到其他DSH/Cordis或未声明路由插件。容量安全停机仍是设计行为，不能为“兼容”关闭原生功能或删安全检查；无需新路由框架。
