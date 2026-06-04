import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import tls from "node:tls";
import { Buffer } from "node:buffer";

const ROOT = process.cwd();
const TO = process.env.AUDIT_EMAIL_TO || "849481756@qq.com";
const SUBJECT = "FlowAPI 商业化上线审计报告";
const REPORT_PATH = path.join(ROOT, "FLOWAPI_COMMERCIALIZATION_AUDIT_REPORT.md");
const TODO_PATH = path.join(ROOT, "FLOWAPI_COMMERCIALIZATION_OPTIMIZATION_TODO.md");
const DRY_RUN = process.argv.includes("--dry-run");

function requireEnv(name) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markdownSummary(markdown) {
  const lines = markdown.split(/\r?\n/);
  const wanted = [];
  let capture = false;
  for (const line of lines) {
    if (line.startsWith("## 1. 审计摘要")) capture = true;
    if (line.startsWith("## 2. 当前完成度总览")) break;
    if (capture) wanted.push(line);
  }
  return wanted.join("\n").trim() || markdown.slice(0, 1600);
}

function buildHtml({ report, todo }) {
  const summary = markdownSummary(report);
  const topTasks = [
    "修复流式调用计费低估",
    "New API 管理代理加管理员鉴权",
    "API Key 完整值只在创建时显示一次",
    "生产环境变量启动校验",
    "支付回调真实小额验收",
    "外部监控与告警替代 Datadog",
    "自动化安全 E2E",
    "统一钱包流水",
    "老板式模型调价向导",
    "首次调用成功引导",
  ];

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="max-width:760px;margin:0 auto;padding:28px">
      <h1 style="margin:0 0 12px;color:#4f46e5">FlowAPI 商业化上线审计报告</h1>
      <p style="margin:0 0 20px;color:#4b5563">本邮件由 FlowAPI 审计脚本自动生成，不包含 API Key、支付密钥或数据库连接。</p>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin-bottom:16px">
        <h2 style="margin:0 0 12px;font-size:18px">核心结论</h2>
        <ul style="line-height:1.8">
          <li>当前商业化完成度：74/100</li>
          <li>建议灰度上线：是，仅限小额、邀请制、人工盯盘</li>
          <li>建议正式上线：否，P0 未修完前不要公域放量</li>
          <li>P0 风险数量：7</li>
        </ul>
      </div>
      <div style="background:#111827;color:#f9fafb;border-radius:14px;padding:20px;margin-bottom:16px">
        <h2 style="margin:0 0 12px;font-size:18px">最大 5 个 P0 风险</h2>
        <ol style="line-height:1.8">
          <li>流式调用计费低估，可能少收钱。</li>
          <li>New API 管理代理入口缺少 FlowAPI 管理员鉴权。</li>
          <li>API Key 列表仍能复制完整 key。</li>
          <li>普通 API 调用、图片消费、返佣没有完全统一钱包流水。</li>
          <li>Datadog 删除后监控、告警、备份体系不足。</li>
        </ol>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin-bottom:16px">
        <h2 style="margin:0 0 12px;font-size:18px">下一步最重要 10 个任务</h2>
        <ol style="line-height:1.8">${topTasks.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ol>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin-bottom:16px">
        <h2 style="margin:0 0 12px;font-size:18px">报告路径</h2>
        <p><strong>审计报告：</strong>${escapeHtml(REPORT_PATH)}</p>
        <p><strong>优化清单：</strong>${escapeHtml(TODO_PATH)}</p>
      </div>
      <details style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px">
        <summary style="cursor:pointer;font-weight:700">审计摘要原文</summary>
        <pre style="white-space:pre-wrap;line-height:1.7;color:#374151">${escapeHtml(summary)}</pre>
      </details>
      <pre style="display:none">${escapeHtml(todo.slice(0, 1000))}</pre>
    </div>
  </body>
</html>`;
}

function socketWrite(socket, line) {
  socket.write(`${line}\r\n`);
}

function readUntil(socket, expectedCodes) {
  const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP response timeout waiting for ${codes.join("/")}`));
    }, 20000);
    function cleanup() {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    }
    function onError(error) {
      cleanup();
      reject(error);
    }
    function onData(chunk) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || "";
      if (/^\d{3} /.test(last)) {
        const code = Number(last.slice(0, 3));
        cleanup();
        if (codes.includes(code)) resolve(buffer);
        else reject(new Error(`SMTP unexpected response ${code}: ${buffer.trim()}`));
      }
    }
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function connectSmtp() {
  const host = requireEnv("SMTP_HOST");
  const port = Number(requireEnv("SMTP_PORT") || 587);
  if (!host) throw new Error("SMTP_HOST 未配置");

  let socket = port === 465
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });
  await readUntil(socket, 220);

  socketWrite(socket, `EHLO ${process.env.SMTP_HELO || "flowapi.fun"}`);
  await readUntil(socket, 250);

  if (port !== 465) {
    socketWrite(socket, "STARTTLS");
    await readUntil(socket, 220);
    socket = tls.connect({ socket, servername: host });
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
    socketWrite(socket, `EHLO ${process.env.SMTP_HELO || "flowapi.fun"}`);
    await readUntil(socket, 250);
  }

  return socket;
}

function buildRawMessage({ from, to, subject, html }) {
  const boundary = `flowapi-${Date.now().toString(36)}`;
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
    Buffer.from("FlowAPI 商业化上线审计报告已生成，请查看邮件 HTML 正文和仓库中的 Markdown 文件。").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html).toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function sendViaSmtp({ html }) {
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");
  const from = requireEnv("SMTP_FROM") || requireEnv("EMAIL_FROM");
  if (!user) throw new Error("SMTP_USER 未配置");
  if (!pass) throw new Error("SMTP_PASS 未配置");
  if (!from) throw new Error("SMTP_FROM 未配置");

  const socket = await connectSmtp();
  try {
    socketWrite(socket, "AUTH LOGIN");
    await readUntil(socket, 334);
    socketWrite(socket, Buffer.from(user).toString("base64"));
    await readUntil(socket, 334);
    socketWrite(socket, Buffer.from(pass).toString("base64"));
    await readUntil(socket, 235);

    const fromAddress = (from.match(/<([^>]+)>/)?.[1] || from).trim();
    socketWrite(socket, `MAIL FROM:<${fromAddress}>`);
    await readUntil(socket, 250);
    socketWrite(socket, `RCPT TO:<${TO}>`);
    await readUntil(socket, [250, 251]);
    socketWrite(socket, "DATA");
    await readUntil(socket, 354);
    const raw = buildRawMessage({ from, to: TO, subject: SUBJECT, html });
    socket.write(raw.replaceAll("\r\n.", "\r\n.."));
    socketWrite(socket, ".");
    await readUntil(socket, 250);
    socketWrite(socket, "QUIT");
    return { ok: true, id: "smtp-sent" };
  } finally {
    socket.end();
  }
}

async function sendViaResend({ html }) {
  const apiKey = requireEnv("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY 未配置");
  const from = requireEnv("EMAIL_FROM") || "FlowAPI <hello@flowapi.fun>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [TO],
      subject: SUBJECT,
      html,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Resend 返回 ${response.status}`);
  }
  return { ok: true, id: data?.id || "resend-sent" };
}

async function main() {
  const [report, todo] = await Promise.all([
    fs.readFile(REPORT_PATH, "utf8"),
    fs.readFile(TODO_PATH, "utf8"),
  ]);
  const html = buildHtml({ report, todo });

  if (DRY_RUN) {
    const previewPath = path.join("/tmp", "flowapi-commercialization-audit-email.html");
    await fs.writeFile(previewPath, html, "utf8");
    console.log(`[audit-email] dry-run ok: ${previewPath}`);
    return;
  }

  if (requireEnv("RESEND_API_KEY")) {
    const result = await sendViaResend({ html });
    console.log(`[audit-email] sent via Resend: ${result.id}`);
    return;
  }

  if (requireEnv("SMTP_HOST")) {
    const result = await sendViaSmtp({ html });
    console.log(`[audit-email] sent via SMTP: ${result.id}`);
    return;
  }

  throw new Error("邮件未发送：未配置 RESEND_API_KEY，也未配置 SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM");
}

main().catch((error) => {
  console.error(`[audit-email] ${error.message}`);
  process.exitCode = 1;
});
