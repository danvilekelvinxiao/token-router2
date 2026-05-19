const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken({ token, remoteIp = "" } = {}) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return {
      ok: process.env.NODE_ENV !== "production",
      error: "人机验证未配置",
    };
  }

  if (!token) {
    return { ok: false, error: "请先完成人机验证" };
  }

  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token);
  if (remoteIp) params.append("remoteip", remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body: params,
    });
    const data = await response.json();

    if (!data.success) {
      return {
        ok: false,
        error: "人机验证失败，请刷新后重试",
        codes: data["error-codes"] || [],
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "人机验证服务暂时不可用" };
  }
}
