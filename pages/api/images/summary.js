import { getImageSummary } from "@/lib/image-studio";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const result = await getImageSummary({
    viewerId: session.customerId,
    workspaceId: String(req.query.workspaceId || ""),
    targetUserId: String(req.query.userId || ""),
  });

  if (result.error) return res.status(403).json({ error: result.error });
  return res.status(200).json({
    success: true,
    ...result,
  });
}
