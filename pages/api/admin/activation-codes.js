import { createActivationCode, listActivationCodes } from "@/lib/customer-store";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (!checkAdmin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "GET") {
    const codes = await listActivationCodes({
      status: req.query?.status || "",
      limit: Number(req.query?.limit || 200),
    });
    return res.status(200).json({ codes });
  }

  if (req.method === "POST") {
    const { amount, note = "", count = 1 } = req.body || {};
    if (!amount) {
      return res.status(400).json({ error: "请输入激活码面额" });
    }
    const result = await createActivationCode({
      amount: Number(amount),
      createdBy: "admin",
      note: String(note || "").slice(0, 200),
      count: Number(count) || 1,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json(result);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
