import { getPublishedAnnouncements } from "@/lib/announcement-utils";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const page = Math.max(1, Number(req.query?.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query?.pageSize || 10)));
  const filterType = String(req.query?.type || "").trim();

  const all = getPublishedAnnouncements();
  const filtered = filterType ? all.filter((item) => item.type === filterType) : all;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return res.status(200).json({
    success: true,
    source: filtered.length ? "real" : "empty",
    page,
    pageSize,
    total: filtered.length,
    announcements: items,
  });
}
