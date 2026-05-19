import { getNewApiUsage } from "@/lib/new-api/client";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { tokenId, startDate, endDate } = req.query;

    const usage = await getNewApiUsage({
      tokenId: tokenId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return res.status(200).json({ success: true, usage });
  } catch (e) {
    console.error("[newapi/usage]", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
