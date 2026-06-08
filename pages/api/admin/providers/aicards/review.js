import { requireAdmin } from "@/lib/admin-auth";
import { reviewAicardsCandidate } from "@/lib/aicards-provider";
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
    const result = await reviewAicardsCandidate(
      parseBody(req.body),
      admin.customer?.id || admin.customer?.email || admin.session?.customerId || "admin",
    );
    return res.status(200).json({
      ok: true,
      message: result.published
        ? "已通过审核并发布为 FlowAPI 模型。"
        : "已保存为 FlowAPI 备用线路候选。",
      ...result,
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      ok: false,
      error: sanitizeSecretText(error.message || "备用线路审核失败"),
    });
  }
}
