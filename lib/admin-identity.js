function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

export const PRIMARY_ADMIN_EMAIL = normalizeEmail(process.env.FLOWAPI_ADMIN_EMAIL || "849481756@qq.com");
export const LEGACY_ADMIN_EMAIL = normalizeEmail(process.env.FLOWAPI_ADMIN_EMAIL_ALIAS || "xiaoyijie@flowapi.fun");

export const ADMIN_EMAILS = Array.from(new Set([PRIMARY_ADMIN_EMAIL, LEGACY_ADMIN_EMAIL].filter(Boolean)));

export function isAdminEmail(value = "") {
  return ADMIN_EMAILS.includes(normalizeEmail(value));
}

export function getPrimaryAdminEmail() {
  return PRIMARY_ADMIN_EMAIL;
}
