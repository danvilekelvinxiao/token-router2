const DEFAULT_LOGIN_PATH = "/api/user/login";

let cachedAuth = {
  token: "",
  userId: "",
  source: "",
};

let inflightPromise = null;

function normalize(value = "") {
  return String(value || "").trim();
}

function normalizeBaseUrl(value = "") {
  return normalize(value).replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function getAdminBaseUrl() {
  return (
    normalizeBaseUrl(process.env.NEW_API_ADMIN_URL) ||
    normalizeBaseUrl(process.env.NEW_API_BASE_URL) ||
    "http://127.0.0.1:8080"
  );
}

function getAdminAccount() {
  return normalize(
    process.env.NEW_API_ADMIN_ACCOUNT ||
      process.env.NEW_API_ADMIN_USERNAME ||
      process.env.NEW_API_ADMIN_EMAIL ||
      process.env.FLOWAPI_NEW_API_ADMIN_ACCOUNT ||
      "flowapiadmin",
  );
}

function getAdminPassword() {
  return normalize(process.env.NEW_API_ADMIN_PASSWORD || process.env.FLOWAPI_NEW_API_ADMIN_PASSWORD || "xiaoyijie");
}

function getAdminTokenFallback() {
  return normalize(process.env.NEW_API_ADMIN_TOKEN || process.env.NEW_API_KEY || "");
}

function getAdminUserIdFallback() {
  return normalize(process.env.NEW_API_ADMIN_USER_ID || "1") || "1";
}

function getLoginPath() {
  return normalize(process.env.NEW_API_ADMIN_LOGIN_PATH || DEFAULT_LOGIN_PATH) || DEFAULT_LOGIN_PATH;
}

function pickToken(data) {
  if (!data || typeof data !== "object") {
    if (typeof data === "string") return normalize(data);
    return "";
  }

  const candidates = [
    data.token,
    data.access_token,
    data.accessToken,
    data.auth_token,
    data.authToken,
    data.data?.token,
    data.data?.access_token,
    data.data?.accessToken,
    data.data?.auth_token,
    data.data?.authToken,
    data.result?.token,
    data.result?.access_token,
    data.result?.accessToken,
  ];

  return candidates.map((value) => normalize(value)).find(Boolean) || "";
}

function pickUserId(data) {
  if (!data || typeof data !== "object") return "";

  const candidates = [
    data.user_id,
    data.userId,
    data.id,
    data.data?.user_id,
    data.data?.userId,
    data.data?.id,
    data.user?.id,
    data.user?.user_id,
  ];

  return candidates.map((value) => normalize(value)).find(Boolean) || "";
}

async function tryLoginWithPayload(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text().catch(() => "");
  const setCookie = normalize(response.headers.get("set-cookie") || "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  const token = pickToken(data);
  const userId = pickUserId(data);
  const cookie = setCookie ? setCookie.split(";")[0].trim() : "";

  return {
    ok: response.ok && Boolean(cookie || token),
    status: response.status,
    token: cookie || token,
    userId,
    data,
    source: cookie ? "session-cookie" : token ? "response-token" : "",
  };
}

async function loginAdminAuth() {
  const account = getAdminAccount();
  const password = getAdminPassword();
  if (!account || !password) {
    return null;
  }

  const url = `${getAdminBaseUrl()}${getLoginPath().startsWith("/") ? getLoginPath() : `/${getLoginPath()}`}`;
  const payloads = [
    { username: account, password },
    { email: account, password },
    { account, password },
    { username: account, email: account, password },
  ];

  for (const payload of payloads) {
    try {
      const result = await tryLoginWithPayload(url, payload);
      if (!result.ok) continue;

      cachedAuth = {
        token: result.token,
        userId: result.userId || getAdminUserIdFallback(),
        source: result.source || "login",
      };
      return cachedAuth;
    } catch {
      continue;
    }
  }

  return null;
}

export async function resolveNewApiAdminAuth({ allowLogin = true } = {}) {
  if (!allowLogin) {
    const explicitToken = getAdminTokenFallback();
    if (explicitToken) {
      return {
        token: explicitToken,
        userId: getAdminUserIdFallback(),
        source: "env-token",
      };
    }
    return {
      token: "",
      userId: getAdminUserIdFallback(),
      source: "missing",
    };
  }

  if (cachedAuth.token) {
    return cachedAuth;
  }

  if (!inflightPromise) {
    inflightPromise = loginAdminAuth().finally(() => {
      inflightPromise = null;
    });
  }

  const auth = await inflightPromise;
  if (auth?.token) return auth;

  const explicitToken = getAdminTokenFallback();
  if (explicitToken) {
    return {
      token: explicitToken,
      userId: getAdminUserIdFallback(),
      source: "env-token",
    };
  }

  return {
    token: "",
    userId: getAdminUserIdFallback(),
    source: "missing",
  };
}

export async function getNewApiAdminHeaders(options = {}) {
  const auth = await resolveNewApiAdminAuth(options);
  if (!auth.token) return null;
  if (auth.source === "session-cookie") {
    return {
      Cookie: auth.token,
      "New-Api-User": auth.userId || getAdminUserIdFallback(),
      "Content-Type": "application/json",
    };
  }
  return {
    Authorization: `Bearer ${auth.token}`,
    "New-Api-User": auth.userId || getAdminUserIdFallback(),
    "Content-Type": "application/json",
  };
}

export function getNewApiAdminConfigState() {
  return {
    baseUrl: getAdminBaseUrl(),
    hasToken: Boolean(getAdminTokenFallback()),
    hasCredentials: Boolean(getAdminAccount() && getAdminPassword()),
    userId: getAdminUserIdFallback(),
    loginPath: getLoginPath(),
  };
}
