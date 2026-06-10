import { createApiKey, deleteApiKey, getDashboard, updateApiKey } from "@/lib/customer-store";
import { getModelProduct } from "@/lib/model-products";
import { assertCustomerOwner } from "@/lib/session";

export default async function handler(req, res) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const requestedCustomerId = req.body?.customerId;
  const session = assertCustomerOwner(req, res, requestedCustomerId);
  if (!session) return;
  const customerId = session.customerId;

  if (!customerId) return res.status(401).json({ error: "请先登录后再操作" });

  if (req.method === "POST") {
    try {
      const modelId = req.body?.modelId || req.body?.productId;
      if (!modelId) {
        return res.status(400).json({
          error: {
            message: "请先选择要使用的模型，再创建 API 密钥。",
            type: "model_required",
          },
        });
      }

      const modelProduct = getModelProduct(modelId);
      if (!modelProduct) {
        return res.status(404).json({
          error: {
            message: "模型不存在或未开放。",
            type: "model_not_available",
          },
        });
      }

      if (!modelProduct.isAvailable) {
        return res.status(400).json({
          error: {
            message: "该模型暂未开放，请选择其他模型或联系客服。",
            type: "model_coming_soon",
          },
        });
      }

      const createdKey = await createApiKey(
        customerId,
        req.body?.label || `${modelProduct.displayName} Key`,
        req.body?.expiresAt || null,
        modelProduct
      );
      const customer = await getDashboard(customerId);
      return res.status(200).json({
        ...customer,
        customer,
        createdKey,
        modelProduct,
        baseUrl: process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://flowapi.fun/v1",
      });
    } catch (error) {
      console.error("[api/keys:create]", error);
      if (error?.type === "model_required") {
        return res.status(400).json({
          error: { message: error.message, type: "model_required" },
        });
      }
      if (error?.code === "INVALID_NEW_API_TOKEN_FORMAT") {
        return res.status(502).json({
          code: "INVALID_NEW_API_TOKEN_FORMAT",
          error: {
            message: "New API 返回的 API Key 格式异常",
            type: "invalid_new_api_token_format",
          },
          suggestion: "请检查 New API 创建 Token 接口是否返回完整 sk- 开头 API Key。",
        });
      }
      if (error?.code === "NEW_API_TOKEN_CREATE_FAILED") {
        return res.status(502).json({
          code: "NEW_API_TOKEN_CREATE_FAILED",
          error: {
            message: "上游 API Key 创建失败，请稍后重试或联系管理员",
            type: "new_api_token_create_failed",
          },
          suggestion: error?.message || "New API API Key 创建失败",
        });
      }
      return res.status(502).json({
        error: "API 密钥创建失败，请稍后重试或联系管理员。",
        suggestion: error?.message || "New API API Key 创建失败",
      });
    }
  }

  const keyId = req.body?.keyId;
  if (!keyId) {
    return res.status(400).json({ error: "缺少 API 密匙 ID" });
  }

  if (req.method === "PATCH") {
    const customer = await updateApiKey(customerId, keyId, {
      label: req.body?.label,
      expiresAt: req.body?.expiresAt,
      disabled: req.body?.disabled,
    });
    if (!customer) return res.status(404).json({ error: "API 密匙不存在" });
    return res.status(200).json(customer);
  }

  const customer = await deleteApiKey(customerId, keyId);
  if (!customer) return res.status(404).json({ error: "API 密匙不存在" });
  return res.status(200).json(customer);
}
