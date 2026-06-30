import { getDashboardAnnouncementPayload } from "@/lib/announcement-utils";
import { getSessionPayload } from "@/lib/session";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = getSessionPayload(req);
  const userId = session?.customerId || "";
  const payload = getDashboardAnnouncementPayload({ userId });

  if (!payload.announcementVersion && !payload.unreadCount && !payload.announcements.length) {
    return res.status(200).json({
      success: true,
      source: "empty",
      shouldShow: false,
      shouldPopup: false,
      unreadCount: 0,
      announcementVersion: "",
      announcements: [],
      recentAnnouncements: [],
      qqGroup: payload.qqGroup,
    });
  }

  return res.status(200).json({
    success: true,
    source: payload.announcements.length ? "real" : "unread-only",
    ...payload,
  });
}
