#!/usr/bin/env node

const BASE_URL = (process.env.FLOWAPI_E2E_BASE_URL || process.env.E2E_BASE_URL || process.env.FLOWAPI_PUBLIC_BASE_URL || "http://127.0.0.1:3002").replace(/\/+$/, "");
const API_KEY = process.env.FLOWAPI_E2E_API_KEY || process.env.E2E_API_KEY || "";
const TEST_EMAIL = process.env.FLOWAPI_E2E_EMAIL || process.env.E2E_EMAIL || "";
const TEST_PASSWORD = process.env.FLOWAPI_E2E_PASSWORD || process.env.E2E_PASSWORD || `FlowAPI${Date.now()}!`;
const RUN_PAID_CALL = process.env.FLOWAPI_E2E_RUN_PAID_CALL === "true" || process.env.E2E_RUN_PAID_CALL === "true";
const ADMIN_EMAIL = process.env.FLOWAPI_E2E_ADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.FLOWAPI_E2E_ADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "";
let cookieJar = "";

const results = [];

function push(name, passed, detail = "", meta = {}) {
  const status = meta.status || (passed ? "pass" : "fail");
  results.push({ name, passed, status, detail, ...meta });
  const mark = status === "skip" ? "SKIP" : passed ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function skip(name, detail) {
  push(name, false, detail, { status: "skip" });
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookieJar ? { Cookie: cookieJar } : {}),
      ...(options.headers || {}),
    },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookieJar = setCookie.split(",").map((item) => item.split(";")[0].trim()).join("; ");
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { response, json, text };
}

async function loginAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return false;
  }
  const { response, json } = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  push("管理员登录", response.ok && Boolean(json?.customer), `status=${response.status}`);
  return response.ok && Boolean(json?.customer);
}

async function main() {
  console.log(`FlowAPI commercial loop E2E: ${BASE_URL}`);

  try {
    const { response, json } = await request("/api/health", { method: "GET" });
    push("健康检查 /api/health", response.ok && json?.ok, `status=${response.status}`);
  } catch (error) {
    push("健康检查 /api/health", false, error.message);
  }

  try {
    const { response } = await request("/api/v1/models", {
      method: "GET",
      headers: { Authorization: "Bearer sk-invalid-commercial-loop-test" },
    });
    push("未知 API Key 返回 401", response.status === 401, `status=${response.status}`);
  } catch (error) {
    push("未知 API Key 返回 401", false, error.message);
  }

  for (const [name, path] of [
    ["模型广场后台同步接口", "/api/models/market"],
    ["API Key 可选模型接口", "/api/models/api-key-options"],
    ["图片模型接口", "/api/models/image-options"],
  ]) {
    try {
      const { response, json } = await request(path);
      const count = json?.models?.length || json?.data?.length || 0;
      push(name, response.ok && count >= 0, `status=${response.status}, count=${count}`);
    } catch (error) {
      push(name, false, error.message);
    }
  }

  if (await loginAdmin()) {
    try {
      const { response, json } = await request("/api/admin/commercial-health");
      push("管理员商业闭环看板接口", response.ok && json?.success, `score=${json?.score ?? "-"}, status=${response.status}`);
    } catch (error) {
      push("管理员商业闭环看板接口", false, error.message);
    }
  } else {
    skip("管理员商业闭环看板接口", "未能建立管理员会话");
  }

  if (TEST_EMAIL) {
    try {
      const { response, json } = await request("/api/auth/send-code", {
        method: "POST",
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          purpose: "register",
          acceptedTerms: true,
          acceptedPrivacy: true,
          deviceId: `e2e_${Date.now()}`,
        }),
      });
      const registerMessage = json?.error || json?.message || "";
      if (!response.ok && String(registerMessage).includes("已注册")) {
        skip("注册验证码发送接口", "测试邮箱已注册；验证码发送链路此前已验证，可换新邮箱复测");
      } else {
        push("注册验证码发送接口", Boolean(response.ok && json?.verifyToken), response.ok ? "已返回 verifyToken；真实收件箱需人工确认" : (registerMessage || `status=${response.status}`));
      }
      if (response.ok && json?.devCode) {
        const verify = await request("/api/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            code: json.devCode,
            verifyToken: json.verifyToken,
            acceptedTerms: true,
            acceptedPrivacy: true,
          }),
        });
        push("注册验证码自动验证", Boolean(verify.response.ok && verify.json?.customer), `status=${verify.response.status}`);
      } else {
        skip("注册验证码自动验证", "生产真发不会返回 devCode，需要人工读取邮箱验证码");
      }
    } catch (error) {
      push("注册验证码发送接口", false, error.message);
    }
  } else {
    skip("注册验证码发送接口", "未提供 FLOWAPI_E2E_EMAIL / E2E_EMAIL");
  }

  if (API_KEY) {
    try {
      const { response, json } = await request("/api/v1/models", {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      push("真实 API Key 调用 /v1/models", response.ok && Array.isArray(json?.data), `status=${response.status}, models=${json?.data?.length || 0}`);
    } catch (error) {
      push("真实 API Key 调用 /v1/models", false, error.message);
    }

    if (RUN_PAID_CALL) {
      try {
        const { response, json } = await request("/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({
            model: process.env.FLOWAPI_E2E_MODEL || "gpt-5.5",
            messages: [{ role: "user", content: "用一句话回复：FlowAPI commercial loop ok" }],
            max_tokens: 20,
          }),
        });
        push("真实扣费模型调用 /v1/chat/completions", response.ok && json?.choices, `status=${response.status}`);
      } catch (error) {
        push("真实扣费模型调用 /v1/chat/completions", false, error.message);
      }
    } else {
      skip("真实扣费模型调用 /v1/chat/completions", "需设置 FLOWAPI_E2E_RUN_PAID_CALL=true，避免默认消耗真实余额");
    }
  } else {
    skip("真实 API Key 调用 /v1/models", "未提供 FLOWAPI_E2E_API_KEY / E2E_API_KEY");
  }

  const passed = results.filter((item) => item.passed).length;
  const skipped = results.filter((item) => item.status === "skip").length;
  const failed = results.filter((item) => item.status === "fail").length;
  console.log(JSON.stringify({ baseUrl: BASE_URL, passed, failed, skipped, results }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
