import { getContent } from "@/lib/content-cms";
import { listUserAnnouncementStates, hasUserSeenAnnouncementVersion } from "@/lib/announcement-read-store";

const ACTIVE_STATUSES = new Set(["已发布", "进行中"]);
const ADMIN_STATUSES = new Set(["草稿", "已发布", "进行中", "已结束"]);
const DEFAULT_TYPE = "系统更新";
const DEFAULT_TITLE = "系统公告";
const DEFAULT_CONFIRM_LABEL = "我知道了";
const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "span", "ul", "ol", "li", "a", "img", "blockquote", "h3", "h4"]);
const VOID_TAGS = new Set(["br", "img"]);

function toTimestamp(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

function clampText(value = "", maxLength = 5000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeDateString(value, fallback = "") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function sanitizeUrl(value = "", { allowRelative = true } = {}) {
  const input = String(value || "").trim();
  if (!input) return "";
  if (allowRelative && input.startsWith("/")) return input;
  try {
    const url = new URL(input);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    return "";
  } catch {
    return "";
  }
}

function sanitizeColor(value = "") {
  const input = String(value || "").trim();
  if (!input) return "";
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(input)) return input;
  if (/^rgba?\(([^)]+)\)$/.test(input)) return input;
  if (/^hsla?\(([^)]+)\)$/.test(input)) return input;
  return "";
}

function sanitizeStyle(value = "") {
  const style = String(value || "").trim();
  if (!style) return "";
  const parts = style.split(";").map((item) => item.trim()).filter(Boolean);
  const next = [];
  parts.forEach((part) => {
    const [rawKey, ...rest] = part.split(":");
    const key = String(rawKey || "").trim().toLowerCase();
    const rawValue = rest.join(":").trim();
    if (!rawValue) return;
    if (key === "color") {
      const color = sanitizeColor(rawValue);
      if (color) next.push(`color:${color}`);
    }
  });
  return next.join(";");
}

function sanitizeTagAttributes(tagName, rawAttributes = "") {
  const attrs = [];
  const attrPattern = /([a-zA-Z0-9:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let match = null;
  while ((match = attrPattern.exec(rawAttributes))) {
    const attrName = String(match[1] || "").toLowerCase();
    const rawValue = match[2] || "";
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if ((tagName === "a" && attrName === "href") || (tagName === "img" && attrName === "src")) {
      const safeUrl = sanitizeUrl(value);
      if (safeUrl) attrs.push(`${attrName}="${escapeAttribute(safeUrl)}"`);
      continue;
    }

    if (tagName === "img" && attrName === "alt") {
      attrs.push(`alt="${escapeAttribute(clampText(value, 120))}"`);
      continue;
    }

    if (tagName === "a" && attrName === "target") {
      const safeTarget = value === "_blank" ? "_blank" : "_self";
      attrs.push(`target="${safeTarget}"`);
      continue;
    }

    if ((tagName === "a" || tagName === "span" || tagName === "p") && attrName === "style") {
      const safeStyle = sanitizeStyle(value);
      if (safeStyle) attrs.push(`style="${escapeAttribute(safeStyle)}"`);
      continue;
    }
  }

  if (tagName === "a") {
    const hasTargetBlank = attrs.some((item) => item === 'target="_blank"');
    attrs.push(`rel="${hasTargetBlank ? "noopener noreferrer" : "noopener"}"`);
  }

  return attrs.join(" ");
}

export function sanitizeAnnouncementHtml(input = "") {
  const source = String(input || "");
  if (!source.trim()) return "";

  const withoutDangerousBlocks = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link)(\s[^>]*)?>/gi, "");

  return withoutDangerousBlocks.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawName, rawAttrs = "") => {
    const tagName = String(rawName || "").toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) return "";
    const closing = /^<\//.test(full);
    if (closing) return `</${tagName}>`;
    const attrs = sanitizeTagAttributes(tagName, rawAttrs);
    const suffix = VOID_TAGS.has(tagName) ? " /" : "";
    return `<${tagName}${attrs ? ` ${attrs}` : ""}${suffix}>`;
  });
}

function plainTextToHtml(value = "") {
  const lines = clampText(value).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!lines.length) return "";
  return lines.map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br />")}</p>`).join("");
}

function normalizeImageItems(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  const deduped = [];
  const seen = new Set();

  source.forEach((entry) => {
    const candidate = typeof entry === "string" ? { url: entry, alt: "" } : entry || {};
    const url = sanitizeUrl(candidate.url || candidate.src || "");
    if (!url || seen.has(url)) return;
    seen.add(url);
    deduped.push({
      url,
      alt: clampText(candidate.alt || candidate.title || "", 120),
    });
  });

  return deduped.slice(0, 6);
}

function buildSummary({ summary = "", content = "", contentHtml = "" } = {}) {
  const manual = clampText(summary, 200);
  if (manual) return manual;
  const fromHtml = stripHtml(contentHtml);
  if (fromHtml) return fromHtml.slice(0, 160);
  return clampText(content, 160);
}

function normalizeAnnouncementCore(item = {}) {
  const content = clampText(item.content || "", 8000);
  const contentHtml = sanitizeAnnouncementHtml(item.contentHtml || "") || plainTextToHtml(content);
  const imageItems = normalizeImageItems(item.imageItems || item.images || []);
  const coverImage = sanitizeUrl(item.coverImage || imageItems[0]?.url || "");
  const accentColor = sanitizeColor(item.accentColor || "");
  const publishedAt = normalizeDateString(item.publishedAt || item.updatedAt || item.createdAt || "", "");
  const updatedAt = normalizeDateString(item.updatedAt || item.publishedAt || item.createdAt || "", publishedAt);
  const createdAt = normalizeDateString(item.createdAt || item.publishedAt || item.updatedAt || "", publishedAt || updatedAt);

  return {
    id: clampText(item.id || "", 80) || `announcement_${Math.random().toString(16).slice(2, 10)}`,
    title: clampText(item.title || DEFAULT_TITLE, 120) || DEFAULT_TITLE,
    type: clampText(item.type || DEFAULT_TYPE, 32) || DEFAULT_TYPE,
    summary: buildSummary({ summary: item.summary, content, contentHtml }),
    content,
    contentHtml,
    pinned: Boolean(item.pinned),
    status: ADMIN_STATUSES.has(item.status) ? item.status : "草稿",
    publishedAt: publishedAt || null,
    updatedAt: updatedAt || null,
    createdAt: createdAt || null,
    coverImage,
    imageItems: coverImage && !imageItems.some((entry) => entry.url === coverImage)
      ? [{ url: coverImage, alt: "封面图" }, ...imageItems].slice(0, 6)
      : imageItems,
    accentColor,
    confirmLabel: clampText(item.confirmLabel || DEFAULT_CONFIRM_LABEL, 24) || DEFAULT_CONFIRM_LABEL,
    requireAck: item.requireAck !== false,
    showOnLogin: item.showOnLogin !== false,
    showInBell: item.showInBell !== false,
    startAt: normalizeDateString(item.startAt || "", "") || null,
    endAt: normalizeDateString(item.endAt || "", "") || null,
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
  };
}

export function normalizeAnnouncementAdminInput(input = {}) {
  const normalized = normalizeAnnouncementCore(input);
  return {
    ...normalized,
    status: ADMIN_STATUSES.has(input.status) ? input.status : normalized.status,
  };
}

function isAnnouncementActive(item, now = Date.now()) {
  if (!item || !ACTIVE_STATUSES.has(item.status)) return false;
  if (item.startAt && toTimestamp(item.startAt) > now) return false;
  if (item.endAt && toTimestamp(item.endAt) < now) return false;
  return true;
}

function compareAnnouncements(a, b) {
  const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
  if (priorityDiff !== 0) return priorityDiff;
  const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
  if (pinnedDiff !== 0) return pinnedDiff;
  return toTimestamp(b.publishedAt || b.updatedAt || b.createdAt) - toTimestamp(a.publishedAt || a.updatedAt || a.createdAt);
}

export function getPublishedAnnouncements() {
  const announcements = Array.isArray(getContent("announcements")) ? getContent("announcements") : [];
  const now = Date.now();
  return announcements
    .filter(Boolean)
    .map((item) => normalizeAnnouncementCore(item))
    .filter((item) => isAnnouncementActive(item, now))
    .sort(compareAnnouncements);
}

export function getAnnouncementVersion(announcements) {
  const list = Array.isArray(announcements) ? announcements : [];
  const latest = list.reduce((max, item) => {
    const current = toTimestamp(item?.updatedAt || item?.publishedAt || item?.createdAt);
    return current > max ? current : max;
  }, 0);
  return latest > 0 ? new Date(latest).toISOString() : "";
}

function getSupportPayload() {
  const support = getContent("support") || {};
  return {
    enabled: Boolean(support?.qqGroupEnabled && support?.qqGroupNumber),
    number: support?.qqGroupNumber || "",
    title: support?.title || "FlowAPI AI玩家交流群",
    description: support?.description || "群里会优先同步不定期福利、模型选择和接入问题。",
    tags: Array.isArray(support?.tags) ? support.tags : [],
  };
}

function resolveAnnouncementUserState(item, records = [], fallbackVersionSeen = false) {
  const matched = records
    .filter((record) => record.announcementId === item.id)
    .sort((a, b) => toTimestamp(b.acknowledgedAt || b.seenAt || b.updatedAt || b.createdAt) - toTimestamp(a.acknowledgedAt || a.seenAt || a.updatedAt || a.createdAt))[0];

  const isAcknowledged = Boolean(
    matched?.status === "acknowledged"
    || matched?.acknowledgedAt
    || (!matched?.announcementId && matched?.announcementVersion === item.version)
    || fallbackVersionSeen
  );
  const isSeen = Boolean(isAcknowledged || matched?.status === "seen" || matched?.seenAt || fallbackVersionSeen);
  const acknowledgedAt = matched?.acknowledgedAt || (fallbackVersionSeen ? matched?.seenAt || null : null) || null;
  const seenAt = matched?.seenAt || acknowledgedAt || null;

  return {
    isSeen,
    isUnread: item.showInBell ? !isAcknowledged : false,
    isAcknowledged,
    acknowledgedAt,
    seenAt,
  };
}

export function decorateAnnouncementsForUser(announcements = [], userId = "", announcementVersion = "") {
  const items = Array.isArray(announcements) ? announcements : [];
  if (!userId) {
    return items.map((item) => ({
      ...item,
      isSeen: false,
      isUnread: Boolean(item.showInBell),
      isAcknowledged: false,
      acknowledgedAt: null,
      seenAt: null,
    }));
  }

  const records = listUserAnnouncementStates(userId);
  const versionSeen = announcementVersion ? hasUserSeenAnnouncementVersion(userId, announcementVersion) : false;

  return items.map((item) => {
    const state = resolveAnnouncementUserState(item, records, versionSeen);
    return { ...item, ...state };
  });
}

function buildApiAnnouncementItem(item = {}) {
  return {
    id: item.id,
    title: item.title || DEFAULT_TITLE,
    type: item.type || DEFAULT_TYPE,
    summary: item.summary || "",
    content: item.content || "",
    contentHtml: item.contentHtml || "",
    pinned: Boolean(item.pinned),
    publishedAt: item.publishedAt || item.updatedAt || item.createdAt || null,
    updatedAt: item.updatedAt || null,
    coverImage: item.coverImage || "",
    imageItems: Array.isArray(item.imageItems) ? item.imageItems : [],
    accentColor: item.accentColor || "",
    confirmLabel: item.confirmLabel || DEFAULT_CONFIRM_LABEL,
    requireAck: item.requireAck !== false,
    showOnLogin: item.showOnLogin !== false,
    showInBell: item.showInBell !== false,
    startAt: item.startAt || null,
    endAt: item.endAt || null,
    priority: Number(item.priority || 0),
    isSeen: Boolean(item.isSeen),
    isUnread: Boolean(item.isUnread),
    isAcknowledged: Boolean(item.isAcknowledged),
    acknowledgedAt: item.acknowledgedAt || null,
    seenAt: item.seenAt || null,
  };
}

export function getDashboardAnnouncementPayload({ userId = "" } = {}) {
  const announcements = getPublishedAnnouncements();
  const announcementVersion = getAnnouncementVersion(announcements);
  const decorated = decorateAnnouncementsForUser(
    announcements.map((item) => ({ ...item, version: announcementVersion })),
    userId,
    announcementVersion,
  );
  const popupAnnouncements = decorated.filter((item) => item.showOnLogin && !item.isAcknowledged);
  const unreadCount = decorated.filter((item) => item.showInBell && item.isUnread).length;

  return {
    announcementVersion,
    shouldShow: popupAnnouncements.length > 0,
    shouldPopup: popupAnnouncements.length > 0,
    unreadCount,
    announcements: popupAnnouncements.slice(0, 5).map(buildApiAnnouncementItem),
    recentAnnouncements: decorated.filter((item) => item.showInBell).slice(0, 8).map(buildApiAnnouncementItem),
    qqGroup: getSupportPayload(),
  };
}

export function getAnnouncementListPayload({ userId = "", page = 1, pageSize = 10, type = "" } = {}) {
  const announcements = getPublishedAnnouncements();
  const announcementVersion = getAnnouncementVersion(announcements);
  const decorated = decorateAnnouncementsForUser(
    announcements.map((item) => ({ ...item, version: announcementVersion })),
    userId,
    announcementVersion,
  );
  const filtered = type ? decorated.filter((item) => item.type === type) : decorated;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(buildApiAnnouncementItem);
  const unreadCount = decorated.filter((item) => item.showInBell && item.isUnread).length;

  return {
    announcementVersion,
    total: filtered.length,
    unreadCount,
    announcements: items,
  };
}
