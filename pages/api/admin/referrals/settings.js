import { requireAdmin } from "@/lib/admin-auth";
import { DEFAULT_REFERRAL_SETTINGS } from "@/lib/referrals/calculate";

const memory = globalThis.__FLOWAPI_REFERRAL_SETTINGS__ || { settings: DEFAULT_REFERRAL_SETTINGS };
globalThis.__FLOWAPI_REFERRAL_SETTINGS__ = memory;

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    return res.status(200).json(memory.settings);
  }

  if (req.method === "POST") {
    memory.settings = { ...memory.settings, ...(req.body || {}) };
    return res.status(200).json(memory.settings);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
