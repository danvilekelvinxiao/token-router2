import { getAnnouncementListPayload } from "@/lib/announcement-utils";
import { getSessionPayload } from "@/lib/session";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const page = Math.max(1, Number(req.query?.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query?.pageSize || 10)));
  const filterType = String(req.query?.type || "").trim();
  const session = getSessionPayload(req);
  const userId = session?.customerId || "";
  const payload = getAnnouncementListPayload({
    userId,
    page,
    pageSize,
    type: filterType,
  });

  return res.status(200).json({
    success: true,
    source: payload.total ? "real" : "empty",
    page,
    pageSize,
    total: payload.total,
    unreadCount: payload.unreadCount,
    announcementVersion: payload.announcementVersion,
    announcements: payload.announcements,
  });
}
