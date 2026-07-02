import { getSessionPayload, getSessionToken } from "@/lib/session";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = getSessionPayload(req);
  if (!session?.customerId) {
    return res.status(401).json({ error: "请先登录" });
  }

  const sessionToken = getSessionToken(req);
  return res.status(200).json({
    success: true,
    customerId: session.customerId,
    sessionToken,
  });
}
