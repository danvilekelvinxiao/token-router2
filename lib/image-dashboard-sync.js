import { listImageLogs } from "@/lib/image-studio";

function imageLogToCall(log = {}) {
  const ok = log.status === "success" || log.status === "partial_success";
  return {
    id: log.requestId || log.id,
    apiKeyId: log.apiKeyId || "",
    apiKeyLabel: "图片生成",
    requestedModel: log.modelDisplayName || log.upstreamModel || "Image Model",
    routedModel: log.modelDisplayName || log.upstreamModel || "Image Model",
    provider: log.upstreamProvider || "OpenRouter",
    promptTokens: Number(log.tokenCost || 0),
    completionTokens: 0,
    tokens: Number(log.tokenCost || 0),
    cost: Number(log.moneyCost || 0),
    amount: Number(log.moneyCost || 0),
    status: ok ? 200 : 500,
    latencyMs: Number(log.latencyMs || 0),
    createdAt: log.createdAt,
    channelName: "图片生成",
    mode: log.mode || "image",
    requestId: log.requestId || log.id,
    imageOutputCount: Number(log.outputImageCount || 0),
    deductionSource: "图片生成钱包扣费",
  };
}

export async function attachImageCallsToDashboard(customer = {}, viewerId = "") {
  const customerId = viewerId || customer.id;
  if (!customerId) return customer;
  try {
    const result = await listImageLogs({ viewerId: customerId, targetUserId: customerId, limit: 500 });
    if (result?.error || !Array.isArray(result?.items)) return customer;
    const imageCalls = result.items
      .filter((item) => item.status === "success" || item.status === "partial_success")
      .map(imageLogToCall);
    if (!imageCalls.length) return customer;
    const existing = Array.isArray(customer.calls) ? customer.calls : [];
    const seen = new Set(existing.map((item) => item.requestId || item.id).filter(Boolean));
    const merged = [
      ...existing,
      ...imageCalls.filter((item) => !seen.has(item.requestId || item.id)),
    ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return { ...customer, calls: merged, imageCalls };
  } catch {
    return customer;
  }
}
