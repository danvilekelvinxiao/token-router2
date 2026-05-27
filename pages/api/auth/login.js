import { loginCustomer } from "@/lib/customer-store";
import { getClientIp, graylistKey, isGraylisted, rateLimit, securityLog } from "@/lib/security";
import { logActivity } from "@/lib/customer-store";
import { setCustomerSession } from "@/lib/session";
import { claimDailyBonus, getUserMembership } from "@/lib/membership/store";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "邮箱和密码不能为空" });
  }

  const ip = getClientIp(req);
  const cleanEmail = String(email).trim().toLowerCase();

  if (isGraylisted(`login:${ip}`)) {
    return res.status(429).json({ error: "登录请求过多，请稍后再试" });
  }

  const ipLimit = rateLimit(`login:ip:${ip}`, { limit: 30, windowMs: 10 * 60 * 1000 });
  const emailLimit = rateLimit(`login:email:${cleanEmail}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!ipLimit.ok || !emailLimit.ok) {
    graylistKey(`login:${ip}`, 15 * 60 * 1000);
    securityLog("login_limited", { ip, email: cleanEmail });
    return res.status(429).json({ error: "登录请求过多，请稍后再试" });
  }

  const result = await loginCustomer({ email, password });

  if (!result) {
    const failLimit = rateLimit(`login-fail:${ip}:${cleanEmail}`, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!failLimit.ok) {
      graylistKey(`login:${ip}`, 30 * 60 * 1000);
      securityLog("login_bruteforce_graylisted", { ip, email: cleanEmail });
    }
    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  if (result.needsVerification) {
    return res.status(403).json({ needsVerification: true, email });
  }

  await logActivity({
    customerId: result?.id,
    email: cleanEmail,
    action: "login",
    category: "auth",
    detail: `用户登录成功`,
    ip,
    userAgent: req.headers["user-agent"] || "",
  });
  if (getUserMembership(result.id)?.status === "active") {
    await claimDailyBonus(result.id);
  }

  const sessionToken = setCustomerSession(res, result);
  return res.status(200).json({ customer: { ...result, sessionToken } });
}
