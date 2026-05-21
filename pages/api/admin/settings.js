import { getSettings, saveSettings, ensureAdminSchema } from "@/lib/admin-store";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  await ensureAdminSchema();

  if (req.method === "GET") {
    const settings = await getSettings();
    return res.status(200).json({ settings });
  }

  if (req.method === "POST") {
    const settings = await saveSettings(req.body);
    return res.status(200).json({ ok: true, settings });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
