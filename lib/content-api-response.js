import { getContent } from "@/lib/content-cms";

export function sendContentResponse(req, res, type, key = type) {
  const data = getContent(type);
  let payload = data;

  if (type === "banners" && req.query?.page && Array.isArray(data)) {
    const page = String(req.query.page);
    const now = Date.now();
    payload = data
      .filter((item) => !item.page || item.page === page)
      .filter((item) => !item.startAt || new Date(item.startAt).getTime() <= now)
      .filter((item) => !item.endAt || new Date(item.endAt).getTime() >= now)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  return res.status(200).json({
    success: true,
    ok: true,
    source: "real",
    type,
    [key]: payload,
    data: payload,
    updatedAt: new Date().toISOString(),
  });
}
