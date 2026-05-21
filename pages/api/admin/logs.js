import { listCallRecords } from "@/lib/customer-store";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Forbidden" });

  if (req.method === "GET") {
    const filters = {
      customer: req.query?.user || "",
      model: req.query?.model || "",
      channel: req.query?.channel || "",
      status: req.query?.status || "",
      limit: Number(req.query?.limit || 200),
      offset: Number(req.query?.offset || 0),
    };
    const result = await listCallRecords(filters);
    return res.status(200).json(result);
  }

  res.setHeader("Allow", "GET");
  return res.status(405).json({ error: "Method not allowed" });
}
