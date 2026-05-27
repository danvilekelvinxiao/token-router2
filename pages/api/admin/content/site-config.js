import { getContentSnapshot, updateSiteConfig } from "@/lib/content-store";
import { requireAdminAccess } from "@/lib/api-auth";

export default function handler(req, res) {
  if (!requireAdminAccess(req, res)) {
    return;
  }

  if (req.method === "GET") {
    return res.status(200).json({ success: true, ...getContentSnapshot() });
  }

  if (req.method === "POST") {
    const siteConfig = updateSiteConfig(req.body?.siteConfig || req.body || {});
    return res.status(200).json({ success: true, siteConfig, ...getContentSnapshot() });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ success: false, error: "Method not allowed" });
}
