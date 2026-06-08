import { requireAdmin } from "@/lib/admin-auth";
import { bulkPublishAicardsCandidates } from "@/lib/aicards-provider";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return typeof body === "object" ? body : {};
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = parseBody(req.body);
    const result = await bulkPublishAicardsCandidates({
      modelIds: body.modelIds || body.ids || [],
      maxCount: body.maxCount || 50,
      adminId: admin.customer?.id || admin.customer?.email || admin.session?.customerId || "admin",
    });
    return res.status(result.ok ? 200 : 400).json({
      ...result,
      message: result.ok
        ? `已发布 ${result.publishedCount} 个 FlowAPI 模型，跳过 ${result.skippedCount} 个未达标候选。`
        : "没有候选满足发布条件，请先完成健康检查、成本、售价和毛利配置。",
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      ok: false,
      error: sanitizeSecretText(error.message || "批量发布失败"),
    });
  }
}
