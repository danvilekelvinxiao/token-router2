import { listImageHistory } from "@/lib/image-studio";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const result = await listImageHistory({
    viewerId: session.customerId,
    targetUserId: String(req.query.userId || ""),
    workspaceId: String(req.query.workspaceId || ""),
    limit: Number(req.query.limit || 50),
    status: String(req.query.status || ""),
    type: String(req.query.type || ""),
    requestId: String(req.query.requestId || ""),
  });

  if (result.error) return res.status(403).json({ error: result.error });
  return res.status(200).json({
    success: true,
    ...result,
  });
}
