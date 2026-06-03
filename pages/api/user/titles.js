import { requireCustomerSession } from "@/lib/session";
import { getUserTitles } from "@/lib/titles/recalculate-user-titles";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const result = await getUserTitles(session.customerId);
  if (!result) return res.status(404).json({ error: "用户不存在" });

  return res.status(200).json(result);
}
