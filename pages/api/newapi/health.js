import { checkNewApiHealth, getNewApiConfig } from "@/lib/new-api/client";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const health = await checkNewApiHealth();
    const config = getNewApiConfig();
    return res.status(200).json({
      ...health,
      config: {
        baseUrl: config.baseUrl,
        hasAdminToken: config.hasAdminToken,
        defaultGroup: config.defaultGroup,
        defaultQuota: config.defaultQuota,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
