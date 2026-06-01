import { getContent } from "@/lib/content-cms";

function toTimestamp(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

export function getPublishedAnnouncements() {
  const announcements = Array.isArray(getContent("announcements")) ? getContent("announcements") : [];
  return announcements
    .filter((item) => item && (item.status === "已发布" || item.status === "进行中"))
    .sort((a, b) => {
      const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinnedDiff !== 0) return pinnedDiff;
      return toTimestamp(b.publishedAt || b.updatedAt || b.createdAt) - toTimestamp(a.publishedAt || a.updatedAt || a.createdAt);
    });
}

export function getAnnouncementVersion(announcements) {
  const list = Array.isArray(announcements) ? announcements : [];
  const latest = list.reduce((max, item) => {
    const current = toTimestamp(item?.updatedAt || item?.publishedAt || item?.createdAt);
    return current > max ? current : max;
  }, 0);
  return latest > 0 ? new Date(latest).toISOString() : "";
}

export function getDashboardAnnouncementPayload() {
  const announcements = getPublishedAnnouncements();
  const announcementVersion = getAnnouncementVersion(announcements);
  const support = getContent("support") || {};

  return {
    announcementVersion,
    announcements: announcements.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title || "系统公告",
      type: item.type || "系统更新",
      content: item.content || "",
      summary: item.summary || item.content || "",
      pinned: Boolean(item.pinned),
      publishedAt: item.publishedAt || item.updatedAt || item.createdAt || null,
      updatedAt: item.updatedAt || null,
    })),
    qqGroup: {
      enabled: Boolean(support?.qqGroupEnabled && support?.qqGroupNumber),
      number: support?.qqGroupNumber || "",
      title: support?.title || "FlowAPI AI玩家交流群",
      description: support?.description || "群里会优先同步不定期福利、模型选择和接入问题。",
      tags: Array.isArray(support?.tags) ? support.tags : [],
    },
  };
}
