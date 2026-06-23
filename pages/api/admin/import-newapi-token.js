import { hasDatabase, query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
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

  try {
    await query(
      `INSERT INTO api_keys
        (id, customer_id, token, label, new_api_token_id, new_api_sync_status, new_api_synced_at,
         public_model_id, actual_model_id, model_display_name, model_group, allowed_models,
         expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        customerId.trim(),
        rawToken,
        name.trim(),
        "imported",
        "imported",
        now,
        (publicModelId || "gpt-5.5").trim(),
        (actualModelId || publicModelId || "gpt-5.5").trim(),
        (modelDisplayName || publicModelId || "导入的 Token").trim(),
        (modelGroup || "default").trim(),
        models.length ? models.join(",") : "gpt-5.5",
        expiresAt ? new Date(expiresAt).toISOString() : null,
        now,
      ],
    );

    return res.status(200).json({
      success: true,
      key: {
        id,
        name: name.trim(),
        token: rawToken,
        customerId: customerId.trim(),
        publicModelId: (publicModelId || "gpt-5.5").trim(),
        modelGroup: (modelGroup || "default").trim(),
        allowedModels: models.length ? models : ["gpt-5.5"],
        createdAt: now,
      },
    });
  } catch (e) {
    console.error("[import-newapi-token]", e);
    return res.status(500).json({ success: false, error: e.message || "导入失败" });
  }
}
