import { requireAdmin } from "@/lib/admin-auth";
import { listUpstreams, saveUpstream } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const upstreams = await listUpstreams();
      return res.status(200).json({ ok: true, upstreams });
    }

    if (req.method === "POST") {
      const upstream = await saveUpstream(req.body || {}, admin.id || admin.email || "admin");
      return res.status(200).json({ ok: true, upstream, message: "上游中转站已保存" });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "上游保存失败" });
  }
}
