import { requireAdmin } from "@/lib/admin-auth";
import { listAicardsSyncedModels, syncAicardsModels } from "@/lib/aicards-provider";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const models = await listAicardsSyncedModels();
    return res.status(200).json({
      ok: true,
      providerKey: "aicards",
      channelName: "AICards 备用线路",
      isUserVisible: false,
      models,
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const result = await syncAicardsModels({
      adminId: admin.customer?.id || admin.customer?.email || admin.session?.customerId || "admin",
    });
    return res.status(200).json({
      ...result,
      note: "已同步为管理员审核候选；默认不公开、不启用，不会在用户端显示上游名称。",
    });
	  } catch (error) {
	    return res.status(502).json({
	      ok: false,
	      error: sanitizeSecretText(error.message || "备用上游模型同步失败"),
	    });
	  }
	}
