import { requireAdmin } from "@/lib/admin-auth";
import { getRelayRequestAuditByRequestId, relayAuditToPublicPayload } from "@/lib/relay-audit-store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const requestId = String(req.query?.requestId || "").trim();
  if (!requestId) {
    return res.status(400).json({ ok: false, error: "requestId required" });
  }

  const audit = await getRelayRequestAuditByRequestId(requestId);
  if (!audit) {
    return res.status(404).json({ ok: false, error: "Audit not found" });
  }

  return res.status(200).json({
    ok: true,
    audit: relayAuditToPublicPayload(audit),
  });
}
