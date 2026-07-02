import { hasDatabase, query } from "@/lib/db";
import { getModelProductWithConfig } from "@/lib/model-products-server";
import { requireAdmin } from "@/lib/admin-auth";
import { assertCanCreateTeamApiKey, linkTeamApiKey } from "@/lib/team-management";

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function inferDefaultModelGroup(modelId = "", explicitGroup = "") {
  const value = String(explicitGroup || "").trim();
  if (value) return value;
  const text = String(modelId || "").trim().toLowerCase();
  if (!text) return "default";
  if (text.includes("gpt-5.5") || text.includes("gpt55") || text.includes("gpt-5.4") || text.includes("gpt4o")) return "gpt-premium";
  if (text.includes("codex")) return "codex-plus";
  if (text.includes("claude")) return "claude-premium";
  if (text.includes("gemini")) return "gemini-premium";
  if (text.includes("deepseek")) return "deepseek-basic";
  return "default";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const {
    token, name, customerId, publicModelId, actualModelId,
    modelDisplayName, modelGroup, allowedModels, quotaLimit, expiresAt,
    teamId = "", shared = false, usageScope = "",
  } = req.body || {};

  if (!token?.trim() || !name?.trim() || !customerId?.trim()) {
    return res.status(400).json({ success: false, error: "token, name, customerId 为必填字段" });
  }

  const rawToken = token.trim();
  if (!rawToken.startsWith("sk-")) {
    return res.status(400).json({ success: false, error: "Token 必须以 sk- 开头" });
  }

  if (!hasDatabase()) {
    return res.status(500).json({ success: false, error: "数据库未配置" });
  }

  // Check if token already exists
  const existing = await query("SELECT id, label, customer_id FROM api_keys WHERE token = $1 LIMIT 1", [rawToken]);
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return res.status(409).json({
      success: false,
      error: `该 Token 已存在于本地 api_keys 表（ID: ${row.id}, 名称: ${row.label}, 用户: ${row.customer_id}）`,
    });
  }

  const id = makeId("key_import");
  const models = Array.isArray(allowedModels) ? allowedModels : (allowedModels ? String(allowedModels).split(",").map((s) => s.trim()).filter(Boolean) : []);
  const now = new Date().toISOString();
  const defaultModelId = (publicModelId || actualModelId || "gpt-5.5").trim();
  const modelProduct = await getModelProductWithConfig(defaultModelId).catch(() => null);
  const resolvedModelGroup = inferDefaultModelGroup(defaultModelId, modelGroup || modelProduct?.group || "");
  const resolvedModelDisplayName = (modelDisplayName || modelProduct?.displayName || defaultModelId || "导入的 Token").trim();
  const resolvedTeamId = String(teamId || "").trim();
  const resolvedShared = shared === true || usageScope === "team_shared";

  if (resolvedTeamId) {
    const teamPermission = await assertCanCreateTeamApiKey(customerId.trim(), resolvedTeamId, { shared: resolvedShared });
    if (!teamPermission.ok) {
      return res.status(403).json({
        success: false,
        error: teamPermission.error || "你没有权限把这个 Token 绑定到该团队。",
      });
    }
  }

  try {
    await query(
      `INSERT INTO api_keys
        (id, customer_id, token, label, new_api_token_id, new_api_sync_status, new_api_synced_at,
         public_model_id, actual_model_id, model_display_name, model_group, allowed_models, team_id,
         expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        customerId.trim(),
        rawToken,
        name.trim(),
        "imported",
        "imported",
        now,
        defaultModelId,
        (actualModelId || defaultModelId).trim(),
        resolvedModelDisplayName,
        resolvedModelGroup,
        models.length ? models.join(",") : defaultModelId,
        resolvedTeamId,
        expiresAt ? new Date(expiresAt).toISOString() : null,
        now,
      ],
    );

    if (resolvedTeamId) {
      await linkTeamApiKey({
        teamId: resolvedTeamId,
        userId: customerId.trim(),
        apiKeyId: id,
        scope: resolvedShared ? "team_shared" : "member",
        shared: resolvedShared,
      });
    }

    return res.status(200).json({
      success: true,
      key: {
        id,
        name: name.trim(),
        token: rawToken,
        customerId: customerId.trim(),
        publicModelId: defaultModelId,
        modelDisplayName: resolvedModelDisplayName,
        modelGroup: resolvedModelGroup,
        teamId: resolvedTeamId,
        shared: resolvedShared,
        allowedModels: models.length ? models : [defaultModelId],
        createdAt: now,
      },
    });
  } catch (e) {
    console.error("[import-newapi-token]", e);
    return res.status(500).json({ success: false, error: e.message || "导入失败" });
  }
}
