import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "FlowAPI <hello@flowapi.fun>";
const ALLOW_DEV_EMAIL_CODES =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_EMAIL_CODES !== "false";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendEmail({ to, subject, html }) {
  if (!resend) {
    if (!ALLOW_DEV_EMAIL_CODES) {
      return { ok: false, error: "邮件服务未配置 RESEND_API_KEY" };
    }
    console.log("\n[resend] DEV MODE - 未配置 RESEND_API_KEY");
    console.log(`[resend] To: ${to}`);
    console.log(`[resend] Subject: ${subject}\n`);
    return { ok: true, id: "dev-mode-no-api-key" };
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[resend] Send error:", error);
    return { ok: false, error: error.message };
  }

  return { ok: true, id: data?.id };
}

export async function sendVerificationEmail(email, code, purpose) {
  const subject =
    purpose === "reset"
      ? "FlowAPI 密码重置验证码"
      : "FlowAPI 邮箱验证码";

  const html = `
<div style="max-width:480px;margin:0 auto;font-family:system-ui,sans-serif">
  <h2 style="color:#6366f1">FlowAPI</h2>
  <p>你的验证码：</p>
  <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
    <span style="font-size:36px;font-weight:900;letter-spacing:6px;color:#111">${code}</span>
  </div>
  <p style="color:#888;font-size:14px">验证码 10 分钟内有效。如非本人操作请忽略此邮件。</p>
</div>`;

  if (!resend) {
    if (ALLOW_DEV_EMAIL_CODES) {
      console.log(`\n[resend] DEV MODE - 验证码: ${code} → ${email}\n`);
      return { ok: true, id: "dev-mode", code };
    }
    return { ok: false, error: "邮件服务未配置 RESEND_API_KEY" };
  }

  const result = await sendEmail({ to: [email], subject, html });

  if (!result.ok) {
    if (ALLOW_DEV_EMAIL_CODES) {
      console.log(`\n[resend] API error, falling back: ${code} → ${email}\n`);
      return { ok: true, id: "dev-mode-fallback", code };
    }
    return result;
  }

  return result;
}
