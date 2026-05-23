import { requireAdmin } from "@/lib/admin-auth";
import { listWhitelistTokens } from "@/lib/new-api/passthrough";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const tokens = await listWhitelistTokens();
    return res.status(200).json({ success: true, tokens });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
