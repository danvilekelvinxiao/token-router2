import { checkVerifyToken, completeEmailRegistration, verifyCode, logActivity } from "@/lib/customer-store";
import { setCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, code, verifyToken, password = "", invitationCode = "" } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: "邮箱和验证码不能为空" });
  }

  if (password && password.length < 6) {
    return res.status(400).json({ error: "密码至少 6 位" });
  }

  if (!verifyToken || !checkVerifyToken(verifyToken, email, "register")) {
    return res.status(400).json({ error: "验证码无效或已过期" });
  }

  if (!(await verifyCode(email, code, "register"))) {
    return res.status(400).json({ error: "验证码无效或已过期" });
  }

  const result = await completeEmailRegistration({ email, password, inviteCode: invitationCode });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  await logActivity({
    customerId: result.customer?.id,
    email,
    action: "register",
    category: "auth",
    detail: invitationCode ? `注册成功，邀请码: ${invitationCode}` : "注册成功",
    ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  });

  const sessionToken = setCustomerSession(res, result.customer);
  return res.status(200).json({ customer: { ...result.customer, sessionToken } });
}
