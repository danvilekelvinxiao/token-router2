export function resolveNewApiBaseUrl() {
  const canonical = String(process.env.NEW_API_BASE_URL || "").trim();
  if (canonical) return canonical.replace(/\/+$/, "");

  const candidates = [
    process.env.XIAOLEAI_BASE_URL,
    process.env.XIAOLEAI_API_BASE_URL,
    "",
  ];

  const base = candidates.find((value) => String(value || "").trim()) || "";
  return String(base).trim().replace(/\/+$/, "");
}

export function resolveNewApiRuntimeTokenSource() {
  const candidates = [
    ["NEW_API_KEY", process.env.NEW_API_KEY],
    ["NEW_API_KEY_ALL_MODELS", process.env.NEW_API_KEY_ALL_MODELS],
    ["XIAOLEAI_API_KEY", process.env.XIAOLEAI_API_KEY],
    ["XIAOLEAI_API_KEY_SECONDARY", process.env.XIAOLEAI_API_KEY_SECONDARY],
    ["XIAOLEAI_KEY", process.env.XIAOLEAI_KEY],
    ["XIAOLEAI_RUNTIME_KEY", process.env.XIAOLEAI_RUNTIME_KEY],
    ["SUB2API_API_KEY", process.env.SUB2API_API_KEY],
    ["SUB2API_API_KEY_SECONDARY", process.env.SUB2API_API_KEY_SECONDARY],
    ["SUB2API_KEY", process.env.SUB2API_KEY],
    ["SUB2API_RUNTIME_KEY", process.env.SUB2API_RUNTIME_KEY],
  ];

  for (const [source, value] of candidates) {
    const token = String(value || "").trim();
    if (token) return { source, token };
  }

  return { source: "", token: "" };
}

export function resolveNewApiRuntimeToken() {
  return resolveNewApiRuntimeTokenSource().token;
}

export function resolveNewApiAdminToken() {
  const canonical = String(process.env.NEW_API_ADMIN_TOKEN || "").trim();
  if (canonical) return canonical;

  return String(
    process.env.XIAOLEAI_ADMIN_TOKEN
    || process.env.SUB2API_ADMIN_TOKEN
    || process.env.NEW_API_ADMIN_TOKEN
    || ""
  ).trim();
}

export function resolveNewApiAdminUrl() {
  return String(process.env.NEW_API_ADMIN_URL || "").trim().replace(/\/+$/, "");
}
