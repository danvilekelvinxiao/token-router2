const DEFAULT_FROM = "FlowAPI <hello@flowapi.fun>";

function isValidEmailAddress(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function normalizeFromHeader(value, fallback = DEFAULT_FROM) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    const displayName = match[1].trim().replace(/^"|"$/g, "");
    const email = match[2].trim();
    if (isValidEmailAddress(email)) {
      return displayName ? `${displayName} <${email}>` : email;
    }
    return fallback;
  }

  if (isValidEmailAddress(raw)) {
    return `FlowAPI <${raw}>`;
  }

  return fallback;
}

export { DEFAULT_FROM };
