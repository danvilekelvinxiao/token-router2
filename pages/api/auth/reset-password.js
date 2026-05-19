import { resetPassword } from "@/lib/customer-store";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, code, newPassword, verifyToken } = req.body || {};
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: "参数不完整" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "密码至少 6 位" });
  }

  const result = await resetPassword({ email, code, newPassword, verifyToken });
  if (result.error) {
    return res.status(400).json(result);
  }

  return res.status(200).json({ ok: true });
}
