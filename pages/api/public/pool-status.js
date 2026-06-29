import { getPoolStatusSnapshot } from "@/lib/pool-status";

export const config = {
  api: {
    responseLimit: false,
  },
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const data = await getPoolStatusSnapshot({ visibility: "public" });
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: "unknown",
      statusLabel: "状态读取失败",
      error: "POOL_STATUS_UNAVAILABLE",
      message: error.message || "号池状态暂时不可用",
    });
  }
}
