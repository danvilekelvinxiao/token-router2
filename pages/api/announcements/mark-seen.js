import { getAnnouncementListPayload } from "@/lib/announcement-utils";
import { markUserAcknowledgedAnnouncements } from "@/lib/announcement-read-store";
import { requireCustomerSession } from "@/lib/session";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const announcementVersion = String(req.body?.announcementVersion || "").trim();
  const announcementIds = Array.isArray(req.body?.announcementIds)
    ? req.body.announcementIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (!announcementIds.length && !announcementVersion) {
    return res.status(400).json({ success: false, error: "缺少 announcementIds 或 announcementVersion" });
  }

  markUserAcknowledgedAnnouncements(session.customerId, announcementIds, announcementVersion);
  const payload = getAnnouncementListPayload({ userId: session.customerId, page: 1, pageSize: 50 });

  return res.status(200).json({
    success: true,
    unreadCount: payload.unreadCount,
    message: "已记录公告确认状态",
  });
}
