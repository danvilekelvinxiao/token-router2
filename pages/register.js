import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function RegisterPage() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [verifyToken, setVerifyToken] = useState("");
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    const key = "flowapi_device_id";
    let current = localStorage.getItem(key);
    if (!current) {
      current = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(key, current);
    }
    queueMicrotask(() => setDeviceId(current));
  }, []);

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, invitationCode, purpose: "register", deviceId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "注册失败");
      return;
    }
    if (data.verifyToken) setVerifyToken(data.verifyToken);
    startCountdown();
    setStep("verify");
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, verifyToken, password, invitationCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "验证失败");
      return;
    }
    if (data.customer) {
      localStorage.setItem("flowapi_customer", JSON.stringify(data.customer));
    }
    setStep("done");
  }

  async function resendCode() {
    setSending(true);
    setError("");
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, invitationCode, purpose: "register", deviceId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "验证码发送失败");
    } else {
      if (data.verifyToken) setVerifyToken(data.verifyToken);
      startCountdown();
    }
    setSending(false);
  }

  return (
    <>
      <Head>
        <title>注册 - FlowAPI</title>
      </Head>

      <main className="landing-shell" style={{ minHeight: "100vh" }}>
        <nav className="landing-nav">
          <div className="landing-nav-inner">
            <Link className="landing-logo" href="/">
              <span>Flow</span>API
            </Link>
            <div className="landing-nav-actions">
              <span style={{ fontSize: 14, color: "var(--page-sub)" }}>已有账号？</span>
              <Link className="btn-secondary btn-small" href="/login">
                登录
              </Link>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 420, margin: "0 auto", padding: "60px 24px" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "var(--page-heading)", textAlign: "center", letterSpacing: "-0.03em", margin: 0 }}>
            {step === "done" ? "注册成功" : "注册 FlowAPI"}
          </h1>

          {step === "form" && (
            <>
              <p style={{ textAlign: "center", color: "var(--page-sub)", fontSize: 15, marginTop: 10 }}>
                注册即送体验额度，可先测试 API 是否跑通
              </p>
              <form onSubmit={handleRegister} style={{ marginTop: 32 }}>
                <div className="form-field">
                  <label>邮箱</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入邮箱地址"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>密码</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请设置密码（至少 6 位）"
                    required
                    minLength={6}
                  />
                </div>
                <div className="form-field">
                  <label>邀请码</label>
                  <input
                    type="text"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value)}
                    placeholder="有邀请码可填写"
                    autoComplete="off"
                  />
                </div>
                {error && (
                  <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>
                )}
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: "100%", marginTop: 24 }}
                >
                  发送验证码
                </button>
                <p style={{ textAlign: "center", color: "var(--page-subtle)", fontSize: 13, marginTop: 14 }}>
                  注册即表示同意 FlowAPI 服务条款
                </p>
              </form>
            </>
          )}

          {step === "verify" && (
            <>
              <p style={{ textAlign: "center", color: "var(--page-sub)", fontSize: 15, marginTop: 10 }}>
                验证码已发送至 {email}
              </p>
              <form onSubmit={handleVerify} style={{ marginTop: 32 }}>
                <div className="form-field">
                  <label>邮箱验证码</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入 6 位验证码"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                {error && (
                  <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>
                )}
                <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 24 }}>
                  完成注册
                </button>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={resendCode}
                    disabled={countdown > 0 || sending}
                    style={{
                      background: "none", border: "none", color: countdown > 0 ? "#ccc" : "#6366f1",
                      cursor: countdown > 0 ? "default" : "pointer", fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {countdown > 0 ? `${countdown}s 后重新发送` : "重新发送验证码"}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <p style={{ color: "var(--page-sub)", fontSize: 15 }}>
                邮箱验证成功 体验额度已发放到你的账户
              </p>
              <Link
                href="/guide"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  marginTop: 24, padding: "12px 32px", borderRadius: 10,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none",
                }}
              >
                进入控制台
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export function getServerSideProps({ res }) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return { props: {} };
}
