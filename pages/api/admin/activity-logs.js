import { listActivityLogs } from "@/lib/customer-store";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (!checkAdmin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const result = await listActivityLogs({
    customerId: req.query?.customerId || "",
    category: req.query?.category || "",
    action: req.query?.action || "",
    limit: Math.min(Number(req.query?.limit) || 200, 500),
    offset: Number(req.query?.offset) || 0,
  });

  return res.status(200).json(result);
}
