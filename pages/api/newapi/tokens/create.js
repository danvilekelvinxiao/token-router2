import { createNewApiToken } from "@/lib/new-api/client";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, group, quota, models } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "缺少参数: name" });
    }

    const token = await createNewApiToken({
      name: name || "API 密匙",
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
