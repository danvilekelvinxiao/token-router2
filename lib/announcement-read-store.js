import fs from "node:fs";
import path from "node:path";

const READS_FILE = path.join(process.cwd(), "data", "user-announcement-reads.json");

function now() {
  return new Date().toISOString();
}

function normalizeStatus(value = "") {
  return value === "acknowledged" ? "acknowledged" : "seen";
}

function normalizeRecord(item = {}) {
  const status = normalizeStatus(item.status || (item.acknowledgedAt ? "acknowledged" : "seen"));
  return {
    id: item.id || `read_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    userId: String(item.userId || "").trim(),
    announcementId: String(item.announcementId || "").trim(),
    announcementVersion: String(item.announcementVersion || "").trim(),
    status,
    seenAt: item.seenAt || item.createdAt || item.updatedAt || now(),
    acknowledgedAt: status === "acknowledged" ? (item.acknowledgedAt || item.seenAt || item.updatedAt || now()) : "",
    createdAt: item.createdAt || item.seenAt || item.updatedAt || now(),
    updatedAt: item.updatedAt || item.acknowledgedAt || item.seenAt || now(),
  };
}

function readAll() {
  try {
    if (!fs.existsSync(READS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(READS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed.map(normalizeRecord).filter((item) => item.userId) : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    fs.mkdirSync(path.dirname(READS_FILE), { recursive: true });
    fs.writeFileSync(READS_FILE, JSON.stringify(list, null, 2));
  } catch {
    // ignore persistence errors, local storage fallback will still prevent repeat popups
  }
}

function findRecordIndex(list, userId, announcementId, announcementVersion) {
  return list.findIndex((item) => {
    if (item.userId !== userId) return false;
    if (announcementId) return item.announcementId === announcementId;
    return !item.announcementId && item.announcementVersion === announcementVersion;
  });
}

export function listUserAnnouncementStates(userId) {
  if (!userId) return [];
  return readAll().filter((item) => item.userId === userId);
}

export function hasUserSeenAnnouncementVersion(userId, announcementVersion) {
  if (!userId || !announcementVersion) return false;
  const list = readAll();
  return list.some((item) => item.userId === userId && item.announcementVersion === announcementVersion);
}

export function markUserAnnouncementState(userId, payload = {}) {
  if (!userId) return { success: false };
  const announcementId = String(payload.announcementId || "").trim();
  const announcementVersion = String(payload.announcementVersion || "").trim();
  const status = normalizeStatus(payload.status || "seen");
  if (!announcementId && !announcementVersion) return { success: false };

  const list = readAll();
  const index = findRecordIndex(list, userId, announcementId, announcementVersion);
  const timestamp = now();

  if (index >= 0) {
    const current = normalizeRecord(list[index]);
    const nextStatus = current.status === "acknowledged" ? "acknowledged" : status;
    list[index] = {
      ...current,
      announcementVersion: announcementVersion || current.announcementVersion,
      announcementId: announcementId || current.announcementId,
      status: nextStatus,
      seenAt: current.seenAt || timestamp,
      acknowledgedAt: nextStatus === "acknowledged" ? (current.acknowledgedAt || timestamp) : current.acknowledgedAt,
      updatedAt: timestamp,
    };
    writeAll(list);
    return { success: true, record: list[index] };
  }

  const record = normalizeRecord({
    userId,
    announcementId,
    announcementVersion,
    status,
    seenAt: timestamp,
    acknowledgedAt: status === "acknowledged" ? timestamp : "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  list.push(record);
  writeAll(list);
  return { success: true, record };
}

export function markUserSeenAnnouncementVersion(userId, announcementVersion) {
  if (!userId || !announcementVersion) return { success: false };
  return markUserAnnouncementState(userId, { announcementVersion, status: "acknowledged" });
}

export function markUserAcknowledgedAnnouncements(userId, announcementIds = [], announcementVersion = "") {
  if (!userId) return { success: false, count: 0 };
  const ids = Array.isArray(announcementIds)
    ? announcementIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!ids.length && !announcementVersion) return { success: false, count: 0 };

  if (!ids.length) {
    markUserSeenAnnouncementVersion(userId, announcementVersion);
    return { success: true, count: 1 };
  }

  ids.forEach((announcementId) => {
    markUserAnnouncementState(userId, {
      announcementId,
      announcementVersion,
      status: "acknowledged",
    });
  });

  return { success: true, count: ids.length };
}
