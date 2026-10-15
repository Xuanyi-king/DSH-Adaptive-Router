import { effortFor, sameModel } from "./router.js";
export const modes = { FULL_AUTO: "完全自动", EFFORT_AUTO: "仅自动思考档位", MODEL_AUTO: "仅自动选择模型", MANUAL: "手动模式" };
export const tiers = { simple: "简单", moderate: "均衡", complex: "复杂" };
export const roles = { general: "通用", coding: "编程", reasoning: "推理" };
export function catalogRows(catalog) {
    return (catalog?.groups ?? []).flatMap(group => group.models.map(model => ({
        provider: group.id, providerName: group.name, model: model.id, name: model.name,
        efforts: model.reasoning?.efforts ?? [],
    })));
}
export function candidateError(candidates, catalog, saved) {
    const rows = catalogRows(catalog);
    const seen = new Set();
    for (const candidate of candidates) {
        const key = JSON.stringify([candidate.provider, candidate.model]);
        if (seen.has(key))
            return "候选模型重复，请移除重复配置。";
        seen.add(key);
        const row = rows.find(item => sameModel(item, candidate));
        if (!row) {
            if (candidate.enabled && !saved.some(item => item.enabled && sameModel(item, candidate)))
                return "模型目录已变化，不能新启用当前不可用的模型。请刷新后重新选择。";
            continue; // Saved unavailable candidates and their mappings remain intact.
        }
        if (Object.values(candidate.effortByTier ?? {}).some(id => !row.efforts.some(effort => effort.id === id)))
            return "已配置档位不再由模型声明，请选择自动映射或合法档位。";
    }
    return null;
}
export function autoEffort(candidate, efforts, tier) {
    const model = { ...candidate, efforts, effortByTier: {} };
    return effortFor(model, tier);
}
const reasonLabels = {
    local: "独立简单请求，使用本地快速判断。",
    jev: "依据 Jev 的任务能力与用途判断。",
    anchored: "延续未完成任务，保持模型和推理深度。",
    manual: "手动模式，保留原生选择。",
    "native-manual": "用户原生手动选择优先。",
    "no-url": "未配置 Jev 地址，保持原生调用。",
    "no-key": "Jev 凭据不可用，保持原生调用。",
    timeout: "Jev 超时，使用安全回退。",
    failed: "Jev 连接或响应失败，使用安全回退。",
    "invalid-choice": "分类结果不合法，使用安全回退。",
    "context-capacity-blocked": "最新上下文超限或无法安全估算容量。请手动选择更大窗口模型或压缩上下文。",
    "context-too-large": "目标窗口无法安全容纳上下文，保留原生调用。",
    "settings-changed": "配置已修改，本轮不再复用旧自动决定。",
    "held-route-unavailable": "缓存目标已不可用，不再复用。",
};
export function actualControl(actual, status) {
    const decision = status?.decision;
    const reason = status?.conflict ? "与 Jev Effort Selector 冲突，本插件已退出自动控制。"
        : reasonLabels[decision?.reason ?? ""] ?? decision?.reason ?? "暂无路由决策记录。";
    if (!actual)
        return { control: status?.conflict ? "Conflict" : decision?.control === "Blocked" ? "Blocked" : "Native",
            reason: status?.conflict || decision?.control === "Blocked" ? reason : "等待原生请求" };
    const selected = decision?.selection;
    const matches = !selected || !!actual && sameModel(actual, selected) && selected.reasoningEffort === actual.reasoningEffort;
    return { control: status?.conflict ? "Conflict" : matches ? decision?.control ?? "Native" : "Native",
        reason: matches || status?.conflict ? reason : "Native override：原生控制器改变了请求。" };
}
