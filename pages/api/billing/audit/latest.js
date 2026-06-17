import { requireAdmin } from "@/lib/admin-auth";
import { getLatestRelayRequestAudit, relayAuditToPublicPayload } from "@/lib/relay-audit-store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const audit = await getLatestRelayRequestAudit();
  if (!audit) {
    return res.status(404).json({ ok: false, error: "No audit found" });
  }

  return res.status(200).json({
    ok: true,
    audit: relayAuditToPublicPayload(audit),
  });
}
