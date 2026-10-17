import type { ConfigValues } from './config.js';
import type { Selection } from './router.js';
export type Engine = 'Jev' | 'NeoHorse';
const neoModels = new Set(['NeoHorse-Jev-4B', 'TokenRhythm/NeoHorse-Jev-4B', 'neohorse-jev', 'NeoHorse-JEV-4B', 'TokenRhythm/NeoHorse-JEV-4B']);
export const engineFor = (config: Pick<ConfigValues, 'classifierModel'>): Engine => neoModels.has(config.classifierModel) ? 'NeoHorse' : 'Jev';
export function validEndpoint(value: string): boolean {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.hash; }
  catch { return false; }
}
export const presets = {
  jev: 'Jev System One', 'neohorse-hosted': 'NeoHorse-Jev · TokenRhythm',
  'neohorse-local': 'NeoHorse-Jev · 本地部署', custom: '自定义 System One',
};
export function presetPatch(id: string, config: Pick<ConfigValues, 'apiKeyEnv'>): Partial<ConfigValues> {
  if (id === 'custom') return {};
  if (id === 'jev') return { classifierModel: 'jev-latest' }; // No invented original Jev URL.
  if (!['neohorse-hosted', 'neohorse-local'].includes(id)) return {};
  return { apiUrl: id === 'neohorse-hosted' ? 'https://tokenrhythm.studio/v1/systemone' : 'http://127.0.0.1:8080/v1/systemone',
    classifierModel: 'NeoHorse-Jev-4B', ...(!config.apiKeyEnv || ['JEV_API_KEY','TOKENRHYTHM_API_KEY'].includes(config.apiKeyEnv) ? { apiKeyEnv: 'TOKENRHYTHM_API_KEY' } : {}) };
}
const explanations: Record<string, [string, string]> = {
  local: ['独立简单请求，使用本地快速判断。', '无需联网分类；这不代表分类服务已连接。'],
  jev: ['依据 Jev 的任务层级和用途选择。', '实际结果以已提交 Header 为准。'],
  neohorse: ['依据 NeoHorse 的任务层级和用途选择。', 'confidence 为分布统计量，不是正确率。'],
  anchored: ['延续未完成任务，保持模型和推理深度。', '新任务会重新判断。'],
  manual: ['手动模式或手动锁，保留 DSH 原生控制。', '需要自动控制时调整模式或锁。'],
  'native-override': ['原生已提交 Header 与自动提议不同，实际由原生请求控制。', '以当前 Header 的模型和档位为准。'],
  'native-manual': ['用户原生手动选择优先。', '继续使用原生选择器控制模型和档位。'],
  'no-url': ['尚未设置分类服务地址，保留原生请求。', '在插件配置中填写完整 System One URL 并保存。'],
  'invalid-url': ['分类地址不是有效的 HTTP(S) URL。', '使用无内嵌凭据、无片段的完整 System One URL。'],
  'no-key': ['分类凭据不可解析，保留原生请求。', '在 Host 原生凭据中配置对应引用，或设置 Host 环境变量。'],
  timeout: ['分类服务超时，自动决定未应用。', '检查 Host 网络与服务负载；不要无条件重试已发送请求。'],
  failed: ['分类服务连接或响应失败，保留原生请求。', '检查 Host 网络、地址、服务日志与模型权限。'],
  'invalid-choice': ['System One 响应结构或答案不合法。', '核对 tier/role/relation Choice、概率及 confidence 字段。'],
  'invalid-json': ['分类接口未返回合法 JSON。', '确认地址为 System One，检查反向代理与服务日志。'],
  'http-401': ['分类凭据被服务拒绝。', '检查 API Key 及已保存的凭据引用。'],
  'http-403': ['分类模型权限被拒绝。', '检查账号灰度名单与模型授权。'],
  'http-413': ['分类输入超过服务限制。', '缩短任务输入或检查服务限额；插件不会静默截断任务。'],
  'http-422': ['模型 ID、参数或输入长度不被服务接受。', '检查 NeoHorse-Jev-4B 模型 ID 与部署的 token 限制。'],
  'http-429': ['分类服务限流或繁忙。', '稍后重试，检查额度与服务容量；本轮保留原生调用。'],
  'http-529': ['NeoHorse 分类工作器繁忙。', '等待服务恢复；本轮不自动重试。'],
  'no-compatible-model': ['没有匹配任务与档位约束的授权候选。', '检查候选能力、任务用途及固定档位，原生请求仍保留。'],
  'validation-failed': ['目标模型或档位未通过原生能力校验。', '刷新模型目录并更新候选配置。'],
  'context-too-large': ['目标窗口无法安全容纳上下文，保留原生调用。', '选择更大窗口模型或压缩会话。'],
  'context-capacity-unknown': ['缓存模型没有可用的上下文容量声明，未将其判为真实超限。', '刷新原生模型目录，确认模型窗口；可手动选择已知容量的模型。'],
  'context-estimate-unavailable': ['上下文估算暂不可用，无法安全复用自动模型。', '检查 Host Token Meter 与模型能力；可尝试原生 /compact 或选择更大窗口模型。'],
  'context-capacity-blocked': ['最新输入和保留输出的容量评估未通过，已阻止缓存目标请求。', '用原生选择器选择更大窗口模型或压缩上下文后继续。'],
  'router-error': ['路由检查异常，自动决定未应用。', '保留原生调用；检查 Host 日志与配置。'],
  conflict: ['检测到 Jev Effort Selector 冲突，已让出自动控制。', '仅启用一个自动路由/档位插件。'],
  'settings-changed': ['配置已修改，本轮不复用旧自动决定。', '下一轮应用新配置；当前原生 Header 可能保留之前自动选中的模型。'],
  'decision-superseded': ['等待期间配置、目录或手动选择改变。', '保留当前原生控制，下一轮重新判断。'],
  'held-route-unavailable': ['缓存模型已不在有效目录中。', '刷新目录，选择可用的原生模型。'],
  'manual-intent-unavailable': ['原生手动意图接口不可用，保守让出控制。', '使用目标 DSH 版本，检查原生模型选择服务。'],
  'no-user-task': ['本步骤没有新的可分类用户任务。', '保留原生请求。'], disabled: ['插件已关闭。', '可在插件配置中启用。'],
  cancelled: ['分类被取消，保留原生控制。', '需要时重新提交任务。'],
  'request-too-large': ['分类请求体超过 1 MiB 安全限制。', '缩短输入；不会静默截断分类上下文。'],
  'response-too-large': ['分类响应超过安全大小限制。', '检查 System One 服务或代理配置。'],
};
export function explainReason(code: string) {
  const [reason, action] = explanations[code] ?? ['自动决定未应用，保留原生请求。', '检查配置与 Host 服务状态。'];
  return { reason, action };
}
export interface SetupFacts {
  catalog: { groups: { id: string; models: { id: string; reasoning?: { efforts: { id: string }[] } }[] }[] } | null;
  current?: Selection | null;
  keyAvailable?: boolean;
  verified?: boolean;
  conflict?: boolean;
  failure?: string;
  nativeManual?: boolean;
}
export function readiness(config: ConfigValues, facts: SetupFacts) {
  const result = (state: string, code: string, reason?: string, action?: string) => ({ state, code, ...explainReason(code), ...(reason ? { reason } : {}), ...(action ? { action } : {}) });
  if (!config.enabled) return result('Disabled', 'disabled');
  if (facts.conflict) return result('Conflict', 'conflict');
  const autoModel = ['FULL_AUTO','MODEL_AUTO'].includes(config.mode) && !config.lockModel;
  const autoEffort = ['FULL_AUTO','EFFORT_AUTO'].includes(config.mode) && !config.lockEffort;
  if ((!autoModel && !autoEffort) || facts.nativeManual) return result('Manual', facts.nativeManual ? 'native-manual' : 'manual');
  if (!config.apiUrl?.trim()) return result('Needs Setup', 'no-url');
  if (!validEndpoint(config.apiUrl)) return result('Needs Setup', 'invalid-url');
  if (facts.keyAvailable === false) return result('Needs Setup', 'no-key');
  const enabled = config.candidates.filter(c => c.enabled);
  if (autoModel && !enabled.length) return result('Needs Setup', 'no-compatible-model', '尚未启用候选模型。');
  if (!facts.catalog) return result('Unverified', 'catalog-unknown', '模型目录尚未验证。', '连接 Host 后刷新目录。');
  const rows = facts.catalog.groups.flatMap(g => g.models.map(m => ({ ...m, provider: g.id })));
  if (autoModel) {
    const available = enabled.filter(c => rows.some(m => m.provider === c.provider && m.id === c.model));
    if (!available.length) return result('Needs Setup', 'no-compatible-model');
    const fixed = config.mode === 'MODEL_AUTO' ? config.fixedEffort || facts.current?.reasoningEffort : config.lockEffort ? facts.current?.reasoningEffort : undefined;
    if (fixed && !available.some(c => rows.find(m => m.provider === c.provider && m.id === c.model)?.reasoning?.efforts.some(e => e.id === fixed))) return result('Needs Setup', 'no-compatible-model', '固定档位与当前可用候选均不兼容。');
    if ((config.lockEffort || (config.mode === 'MODEL_AUTO' && !config.fixedEffort)) && !facts.current) return result('Unverified', 'current-unknown', '需在聊天中核对原生当前档位。', '发送任务前确认原生模型与档位。');
  } else {
    if (!facts.current) return result('Unverified', 'current-unknown', '当前原生模型尚未确认。', '在聊天菜单查看已提交的原生模型。');
    const model = rows.find(m => m.provider === facts.current!.provider && m.id === facts.current!.model);
    if (!model) return result('Needs Setup', 'validation-failed');
    if (!model.reasoning?.efforts.length) return result('Native', 'model-default', '当前模型没有声明可调节的思考档位，将保留模型默认行为。', '无需把模型视为不可用；若需调节档位请选择原生支持的模型。');
  }
  if (facts.failure) return result('Degraded', facts.failure);
  if (facts.keyAvailable === undefined || !facts.verified) return result('Unverified', 'unverified', '必要配置已填写，尚未验证分类服务连接。', '静态检查不发网络请求；真实分类成功后才能标记 Ready。');
  return result('Ready', 'verified', '当前配置的分类请求已成功，相关模型目录已解析。', '这只验证协议可用，不代表分类准确率或远端模型调用成功。');
}
