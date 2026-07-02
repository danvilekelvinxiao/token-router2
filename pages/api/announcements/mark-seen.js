import { markUserSeenAnnouncementVersion } from "@/lib/announcement-read-store";
import { requireCustomerSession } from "@/lib/session";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const announcementVersion = String(req.body?.announcementVersion || "").trim();
  const sessionToken = String(req.body?.sessionToken || req.headers["x-flowapi-session-token"] || "").trim();
  if (!announcementVersion) {
    return res.status(400).json({ success: false, error: "缺少 announcementVersion" });
  }
  if (!sessionToken) {
    return res.status(400).json({ success: false, error: "缺少 sessionToken" });
  }

  markUserSeenAnnouncementVersion(session.customerId, announcementVersion, sessionToken);
  return res.status(200).json({
    success: true,
    message: "已记录公告已读状态",
  });
}
