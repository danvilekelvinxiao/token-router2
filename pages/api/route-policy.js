import { getRoutePolicyConfig } from "@/lib/route-policy";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const policy = await getRoutePolicyConfig().catch(() => null);
  return res.status(200).json({
    ok: true,
    policy: policy || null,
  });
}
