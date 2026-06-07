import { Resend } from "resend";
import net from "net";
import tls from "tls";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "FlowAPI <hello@flowapi.fun>";
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || EMAIL_FROM;
const ALLOW_DEV_EMAIL_CODES =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_EMAIL_CODES !== "false";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const smtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);

function socketWrite(socket, line) {
  socket.write(`${line}\r\n`);
}

function readUntil(socket, expectedCodes) {
  const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
  return new Promise((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || "";
      if (/^\d{3} /.test(last)) {
        const code = Number(last.slice(0, 3));
        cleanup();
        if (codes.includes(code)) resolve(buffer);
        else reject(new Error(`SMTP unexpected response ${code}: ${buffer.trim()}`));
      }
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function connectSmtp() {
  let socket = SMTP_PORT === 465
    ? tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST })
    : net.connect({ host: SMTP_HOST, port: SMTP_PORT });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
  await readUntil(socket, 220);

  socketWrite(socket, `EHLO ${process.env.SMTP_HELO || "flowapi.fun"}`);
  await readUntil(socket, 250);

  if (SMTP_PORT !== 465) {
    socketWrite(socket, "STARTTLS");
    await readUntil(socket, 220);
    socket = tls.connect({ socket, servername: SMTP_HOST });
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    socketWrite(socket, `EHLO ${process.env.SMTP_HELO || "flowapi.fun"}`);
    await readUntil(socket, 250);
  }

  return socket;
}

function extractEmailAddress(value = "") {
  return (String(value).match(/<([^>]+)>/)?.[1] || String(value)).trim();
}

function buildRawMessage({ from, to, subject, html }) {
  const boundary = `flowapi-${Date.now().toString(36)}`;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text).toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html).toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function sendViaSmtp({ to, subject, html }) {
  const socket = await connectSmtp();
  try {
    socketWrite(socket, "AUTH LOGIN");
    await readUntil(socket, 334);
    socketWrite(socket, Buffer.from(SMTP_USER).toString("base64"));
    await readUntil(socket, 334);
    socketWrite(socket, Buffer.from(SMTP_PASS).toString("base64"));
    await readUntil(socket, 235);

    socketWrite(socket, `MAIL FROM:<${extractEmailAddress(SMTP_FROM)}>`);
    await readUntil(socket, 250);
    socketWrite(socket, `RCPT TO:<${extractEmailAddress(to)}>`);
    await readUntil(socket, [250, 251]);
    socketWrite(socket, "DATA");
    await readUntil(socket, 354);
    const raw = buildRawMessage({ from: SMTP_FROM, to, subject, html });
    socket.write(raw.replaceAll("\r\n.", "\r\n.."));
    socketWrite(socket, ".");
    await readUntil(socket, 250);
    socketWrite(socket, "QUIT");
    return { ok: true, id: "smtp-sent" };
  } finally {
    socket.end();
  }
}

export async function sendEmail({ to, subject, html }) {
  if (!resend) {
    if (smtpConfigured) {
      try {
        return await sendViaSmtp({ to: Array.isArray(to) ? to[0] : to, subject, html });
      } catch (error) {
        console.error("[smtp] Send error:", error);
        return { ok: false, error: error.message };
      }
    }
    if (!ALLOW_DEV_EMAIL_CODES) {
      return { ok: false, error: "邮件服务未配置 RESEND_API_KEY 或 SMTP_HOST/SMTP_USER/SMTP_PASS" };
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
    if (smtpConfigured) {
      try {
        return await sendViaSmtp({ to: Array.isArray(to) ? to[0] : to, subject, html });
      } catch (smtpError) {
        console.error("[smtp] Send error:", smtpError);
      }
    }
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
