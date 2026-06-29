import { requireAdmin } from "@/lib/admin-auth";
import { healthCheckAicards } from "@/lib/aicards-provider";
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

  const body = parseBody(req.body);
  try {
    const result = await healthCheckAicards({
      adminId: admin.customer?.id || admin.customer?.email || admin.session?.customerId || "admin",
      modelId: String(body.modelId || body.actualModelId || body.model || "").trim(),
      skipModelTest: body.skipModelTest === true,
    });
    return res.status(result.ok ? 200 : 502).json(result);
	  } catch (error) {
    return res.status(502).json({
      ok: false,
      providerKey: "aicards",
      channelName: "AICards 备用线路",
      error: sanitizeSecretText(error.message || "备用上游健康检查失败"),
    });
	  }
	}
