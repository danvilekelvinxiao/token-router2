import { sendEmail } from "@/lib/resend";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!checkAdmin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { to, subject, html } = req.body || {};

  if (!to || !subject) {
    return res.status(400).json({ error: "to 和 subject 不能为空" });
  }

  const result = await sendEmail({ to, subject, html });

  if (!result.ok) {
    return res.status(500).json({ error: result.error });
  }

  return res.status(200).json({ ok: true, id: result.id });
}
