import { createNewApiToken } from "@/lib/new-api/client";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await requireAdmin(req, res))) return;

  try {
    const { name, group, quota, models } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "缺少参数: name" });
    }

    const token = await createNewApiToken({
      name: name || "API Key",
      group,
      quota: quota ? Number(quota) : undefined,
      models,
    });

    return res.status(200).json({
      success: true,
      token: {
        id: token.id,
        key: token.key,
        name: token.name,
        quota: token.quota,
        usedQuota: token.usedQuota,
        disabled: token.disabled,
        createdTime: token.createdTime,
      },
    });
  } catch (e) {
    console.error("[newapi/tokens/create]", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
