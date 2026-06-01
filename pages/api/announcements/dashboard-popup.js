import { getDashboardAnnouncementPayload } from "@/lib/announcement-utils";
import { hasUserSeenAnnouncementVersion } from "@/lib/announcement-read-store";
import { getSessionPayload } from "@/lib/session";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = getDashboardAnnouncementPayload();
  if (!payload.announcements.length) {
    return res.status(200).json({
      success: true,
      source: "empty",
      shouldShow: false,
      announcementVersion: "",
      announcements: [],
      qqGroup: payload.qqGroup,
    });
  }

  const session = getSessionPayload(req);
  const userId = session?.customerId || "";
  const seen = userId ? hasUserSeenAnnouncementVersion(userId, payload.announcementVersion) : false;

  return res.status(200).json({
    success: true,
    source: "real",
    announcementVersion: payload.announcementVersion,
    shouldShow: !seen,
    announcements: payload.announcements,
    qqGroup: payload.qqGroup,
  });
}
