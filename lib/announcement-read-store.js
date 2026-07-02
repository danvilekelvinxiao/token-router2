import fs from "node:fs";
import path from "node:path";

const READS_FILE = path.join(process.cwd(), "data", "user-announcement-reads.json");

function readAll() {
  try {
    if (!fs.existsSync(READS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(READS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
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

export function hasUserSeenAnnouncementVersion(userId, announcementVersion) {
  if (!userId || !announcementVersion) return false;
  const list = readAll();
  return list.some((item) => item.userId === userId && item.announcementVersion === announcementVersion);
}

export function hasSessionSeenAnnouncementVersion(userId, sessionToken, announcementVersion) {
  if (!userId || !sessionToken || !announcementVersion) return false;
  const list = readAll();
  return list.some((item) => item.userId === userId && item.sessionToken === sessionToken && item.announcementVersion === announcementVersion);
}

export function markUserSeenAnnouncementVersion(userId, announcementVersion, sessionToken = "") {
  if (!userId || !announcementVersion || !sessionToken) return { success: false };
  const list = readAll();
  const exists = list.some((item) => item.userId === userId && item.sessionToken === sessionToken && item.announcementVersion === announcementVersion);
  if (!exists) {
    list.push({
      id: `read_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      userId,
      sessionToken,
      announcementVersion,
      seenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    writeAll(list);
  }
  return { success: true };
}
