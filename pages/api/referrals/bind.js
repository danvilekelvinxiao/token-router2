import { bindReferral } from "@/lib/referrals/store";
import { requireCustomerSession } from "@/lib/session";

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = requireCustomerSession(req, res);
  if (!session) return;
  const result = await bindReferral({
    referredUserId: session.customerId,
    inviteCode: req.body?.inviteCode,
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"] || "",
    source: req.body?.source || req.headers.referer || "",
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(200).json(result);
}
