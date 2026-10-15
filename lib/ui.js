import { explainReason } from "./diagnostics.js";
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
export function actualControl(actual, status) {
    const decision = status?.decision;
    let reason = status?.conflict ? "与 Jev Effort Selector 冲突，本插件已退出自动控制。"
        : decision?.reason ? Object.values(explainReason(decision.reason)).join(" ") : "暂无路由决策记录。";
    if (decision?.control === "Blocked")
        return { control: "Blocked", reason };
    if (!actual)
        return { control: status?.conflict ? "Conflict" : decision?.control === "Blocked" ? "Blocked" : "Native",
            reason: status?.conflict || decision?.control === "Blocked" ? reason : "等待原生请求" };
    const selected = decision?.selection;
    const matches = !selected || sameModel(actual, selected) && selected.reasoningEffort === actual.reasoningEffort;
    if (matches && decision?.control === "Fallback" && decision.fallbackApplied)
        reason = `已应用配置的备用模型。分类原因：${decision.reason ?? "未知"}。${explainReason(decision.reason ?? "").action}`;
    const control = decision?.control === "Fallback" && !decision.fallbackApplied ? "Bypass" : decision?.control ?? "Native";
    return { control: status?.conflict ? "Conflict" : matches ? control : "Native",
        reason: matches || status?.conflict ? reason : "Native override：原生控制器改变了请求。" };
}
