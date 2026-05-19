import { createVerificationCode, createVerifyToken, registerCustomer } from "@/lib/customer-store";
import { sendVerificationEmail } from "@/lib/mail";
import { getClientIp, isDisposableEmail, rateLimit, securityLog } from "@/lib/security";

const EMAIL_REGISTER_LIMIT = Number(process.env.SEND_CODE_EMAIL_REGISTER_LIMIT || 5);
const DEVICE_REGISTER_LIMIT = Number(process.env.REGISTER_DEVICE_DAILY_LIMIT || 3);
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const DEVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password, invitationCode = "", purpose = "register", deviceId = "" } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: "邮箱不能为空" });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "邮箱格式不正确" });
  }

  if (!["register", "reset"].includes(purpose)) {
    return res.status(400).json({ error: "Invalid purpose" });
  }

  if (purpose === "register" && (!password || password.length < 6)) {
    return res.status(400).json({ error: "密码至少 6 位" });
  }

  const ip = getClientIp(req);
  const normalizedDeviceId = String(deviceId || req.headers["x-flowapi-device"] || "").slice(0, 80);

  if (purpose === "register") {
    if (isDisposableEmail(cleanEmail)) {
      securityLog("blocked_disposable_email", { ip, emailDomain: cleanEmail.split("@")[1] });
      return res.status(400).json({ error: "暂不支持临时邮箱注册" });
    }

    if (normalizedDeviceId) {
      const deviceLimit = rateLimit(`register:device:${normalizedDeviceId}`, {
        limit: DEVICE_REGISTER_LIMIT,
        windowMs: DEVICE_WINDOW_MS,
      });
      if (!deviceLimit.ok) {
        securityLog("register_device_limited", { ip, deviceId: normalizedDeviceId });
        return res.status(429).json({ error: "该设备今日注册次数已达上限" });
      }
    }
  }

  const emailLimit = rateLimit(`send-code:${purpose}:${cleanEmail}`, {
    limit: EMAIL_REGISTER_LIMIT,
    windowMs: EMAIL_WINDOW_MS,
  });
  if (!emailLimit.ok) {
    return res.status(429).json({ error: "该邮箱验证码发送次数已达上限" });
  }

  let registeredCustomer = null;
  if (purpose === "register" && password) {
    const regResult = await registerCustomer({ email: cleanEmail, password, inviteCode: invitationCode });
    if (regResult.error) {
      return res.status(400).json({ error: regResult.error });
    }
    registeredCustomer = regResult.customer;
  }

  const code = await createVerificationCode(cleanEmail, purpose);
  const verifyToken = createVerifyToken(cleanEmail, purpose);
  const result = await sendVerificationEmail(cleanEmail, code, purpose);

  if (!result || !result.ok) {
    return res.status(500).json({ error: result?.error || "邮件发送失败" });
  }

  const isDev = result.id === "dev-mode" || result.id === "dev-mode-no-api-key" || result.id === "dev-mode-fallback";
  const devCodeEnabled =
    process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_EMAIL_CODES !== "false";
  const fallback = result.id === "dev-mode-fallback";

  return res.status(200).json({
    ok: true,
    verifyToken,
    customerId: registeredCustomer?.id,
    devCode: devCodeEnabled ? code : undefined,
    devHint: isDev ? (fallback ? "邮件服务暂时不可用 验证码直接显示" : "未配置 RESEND_API_KEY 验证码已打印到终端") : undefined,
  });
}
