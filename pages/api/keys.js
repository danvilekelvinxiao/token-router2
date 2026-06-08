import { createApiKey, deleteApiKey, getDashboard, updateApiKey } from "@/lib/customer-store";
import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { assertCustomerOwner } from "@/lib/session";
import { getLocalePriceMultiplier, normalizeLocale } from "@/lib/pricing/locale-pricing";
import { getPublicApiBaseUrl } from "@/lib/public-api";
import { assertCanCreateTeamApiKey, linkTeamApiKey } from "@/lib/team-management";

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export default async function handler(req, res) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req.body);
  const requestedCustomerId = body?.customerId;
  const session = assertCustomerOwner(req, res, requestedCustomerId);
  if (!session) return;
  const customerId = session.customerId;

  if (!customerId) return res.status(401).json({ error: "请先登录后再操作" });

  if (req.method === "POST") {
    try {
      const modelId = body?.modelId || body?.productId;
      if (!modelId) {
        return res.status(400).json({
          error: {
            message: "请先选择要使用的模型，再创建 API Key。",
            type: "model_required",
          },
        });
      }

      const modelProducts = await listModelProductsWithConfig({ includeUnavailable: true });
      const modelProduct = modelProducts.find((item) => (
        item.id === modelId ||
        item.publicModelId === modelId ||
        item.modelId === modelId
      ));
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

      const teamId = body?.teamId || body?.team_id || "";
      const sharedTeamKey = body?.shared === true || body?.usageScope === "team_shared" || body?.usage_scope === "team_shared";
      if (teamId) {
        const teamPermission = await assertCanCreateTeamApiKey(customerId, teamId, { shared: sharedTeamKey });
        if (!teamPermission.ok) {
          return res.status(403).json({
            error: {
              message: teamPermission.error || "你没有权限在这个团队创建 API Key。",
              type: "team_key_forbidden",
            },
          });
        }
      }

      const createdKey = await createApiKey(
        customerId,
        body?.label || `${modelProduct.displayName} Key`,
        body?.expiresAt || null,
        modelProduct,
        {
          localePriceMultiplier: getLocalePriceMultiplier(normalizeLocale(body?.locale)),
          limit: body?.limit || body?.quotaLimit || {},
          groupId: body?.groupId || body?.modelGroup || "",
          teamId,
          usagePurpose: body?.usagePurpose || body?.usage_purpose || "",
          usageScope: sharedTeamKey ? "team_shared" : (body?.usageScope || body?.usage_scope || ""),
        }
      );
      if (teamId) {
        await linkTeamApiKey({
          teamId,
          userId: customerId,
          apiKeyId: createdKey.id,
          scope: sharedTeamKey ? "team_shared" : "member",
          shared: sharedTeamKey,
        });
      }
      const customer = await getDashboard(customerId);
      return res.status(200).json({
        ...customer,
        customer,
        createdKey,
        modelProduct,
        baseUrl: getPublicApiBaseUrl(),
      });
    } catch (error) {
      console.error("[api/keys:create]", error);
      if (error?.type === "model_required") {
        return res.status(400).json({
          error: { message: error.message, type: "model_required" },
        });
      }
      if (error?.code === "INVALID_API_KEY_LIMIT") {
        return res.status(400).json({
          error: {
            message: error.message,
            type: "invalid_api_key_limit",
          },
        });
      }
      if (["group_unavailable", "group_model_not_supported"].includes(error?.type)) {
        return res.status(400).json({
          error: {
            message: error.message,
            type: error.type,
          },
        });
      }
      if (error?.type === "model_profit_guard") {
        return res.status(400).json({
          error: {
            message: error.message || "该模型价格尚未通过毛利审核，请先选择其他模型。",
            type: error.code || "model_profit_guard",
          },
          suggestion: "请先选择已通过价格审核的模型，或联系 FlowAPI 客服开通该模型。",
        });
      }
      if (error?.code === "INVALID_NEW_API_TOKEN_FORMAT") {
        return res.status(502).json({
          code: "API_KEY_CREATE_FAILED",
          error: {
            message: "API Key 创建失败，请稍后重试或联系 FlowAPI 客服。",
            type: "api_key_create_failed",
          },
          suggestion: "平台正在修复创建通道，请不要重复提交；如需加急，请把当前页面截图发给客服。",
        });
      }
      if (error?.code === "NEW_API_TOKEN_CREATE_FAILED") {
        return res.status(502).json({
          code: "API_KEY_CREATE_FAILED",
          error: {
            message: "API Key 创建失败，请稍后重试或联系 FlowAPI 客服。",
            type: "api_key_create_failed",
          },
          suggestion: "平台通道暂时不可用，请稍后重试；如果持续失败，请联系 FlowAPI 客服。",
        });
      }
      return res.status(502).json({
        error: "API Key 创建失败，请稍后重试或联系管理员。",
        suggestion: "平台通道暂时不可用，请稍后重试；如果持续失败，请联系 FlowAPI 客服。",
      });
    }
  }

  const keyId = body?.keyId;
  if (!keyId) {
    return res.status(400).json({ error: "缺少 API Key ID" });
  }

  if (req.method === "PATCH") {
    try {
      if (body?.teamId) {
        const teamPermission = await assertCanCreateTeamApiKey(customerId, body.teamId, {
          shared: body?.shared === true || body?.usageScope === "team_shared",
        });
        if (!teamPermission.ok) {
          return res.status(403).json({
            error: {
              message: teamPermission.error || "你没有权限把 API Key 绑定到这个团队。",
              type: "team_key_forbidden",
            },
          });
        }
      }
      const customer = await updateApiKey(customerId, keyId, {
        label: body?.label,
        expiresAt: body?.expiresAt,
        disabled: body?.disabled,
        limit: body?.limit,
        quotaLimit: body?.quotaLimit,
        teamId: body?.teamId,
        usagePurpose: body?.usagePurpose,
        usageScope: body?.usageScope,
      });
      if (!customer) return res.status(404).json({ error: "API Key 不存在" });
      if (body?.teamId) {
        await linkTeamApiKey({
          teamId: body.teamId,
          userId: customerId,
          apiKeyId: keyId,
          scope: body?.usageScope === "team_shared" ? "team_shared" : "member",
          shared: body?.usageScope === "team_shared",
        });
      }
      return res.status(200).json(customer);
    } catch (error) {
      if (error?.code === "INVALID_API_KEY_LIMIT") {
        return res.status(400).json({
          error: {
            message: error.message,
            type: "invalid_api_key_limit",
          },
        });
      }
      throw error;
    }
  }

  const customer = await deleteApiKey(customerId, keyId);
  if (!customer) return res.status(404).json({ error: "API Key 不存在" });
  return res.status(200).json(customer);
}
