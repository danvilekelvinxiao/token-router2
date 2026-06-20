import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [verifyToken, setVerifyToken] = useState("");

  async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

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

  async function handleSendCode(e) {
    e.preventDefault();
    setError("");
    setSending(true);

    if (!email) {
      setError("请输入邮箱");
      setSending(false);
      return;
    }

    try {
      const res = await fetchWithTimeout("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `发送失败 (HTTP ${res.status})`);
        return;
      }
      if (data.verifyToken) setVerifyToken(data.verifyToken);
      setStep("reset");
      startCountdown();
    } catch (error) {
      setError(error.name === "AbortError" ? "验证码发送请求超时，请稍后重试" : error.message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setResetting(true);

    if (!email || !code || !newPassword) {
      setError("请把邮箱、验证码和新密码填写完整");
      setResetting(false);
      return;
    }

    if (newPassword.length < 6) {
      setError("密码至少 6 位");
      setResetting(false);
      return;
    }

    try {
      const res = await fetchWithTimeout("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword, verifyToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `重置失败 (HTTP ${res.status})`);
        return;
      }
      setStep("done");
    } catch (error) {
      setError(error.name === "AbortError" ? "重置请求超时，请稍后重试" : error.message || "重置失败");
    } finally {
      setResetting(false);
    }
  }

  async function resendCode() {
    setSending(true);
    setError("");
    if (!email) {
      setError("请输入邮箱");
      setSending(false);
      return;
    }
    try {
      const res = await fetchWithTimeout("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `发送失败 (HTTP ${res.status})`);
        return;
      }
      if (data.verifyToken) setVerifyToken(data.verifyToken);
      startCountdown();
    } catch (error) {
      setError(error.name === "AbortError" ? "验证码发送请求超时，请稍后重试" : error.message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Head>
        <title>重置密码 - FlowAPI</title>
      </Head>

      <main className="landing-shell" style={{ minHeight: "100vh" }}>
        <nav className="landing-nav">
          <div className="landing-nav-inner">
            <Link className="landing-logo" href="/">
              <span>Flow</span>API
            </Link>
            <div className="landing-nav-actions">
              <Link className="btn-secondary btn-small" href="/login">
                返回登录
              </Link>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 420, margin: "0 auto", padding: "60px 24px" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "var(--page-heading)", textAlign: "center", letterSpacing: "-0.03em", margin: 0 }}>
            {step === "done" ? "重置成功" : "重置密码"}
          </h1>

          {step === "email" && (
            <>
              <p style={{ textAlign: "center", color: "var(--page-sub)", fontSize: 15, marginTop: 10 }}>
                输入注册邮箱 我们将发送验证码
              </p>
              <form onSubmit={handleSendCode} noValidate style={{ marginTop: 32 }}>
                <div className="form-field">
                  <label>注册邮箱</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入注册时使用的邮箱"
                    required
                  />
                </div>
                {error && (
                  <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>
                )}
                <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 24 }} disabled={sending} aria-busy={sending}>
                  {sending ? "发送中..." : "发送验证码"}
                </button>
              </form>
            </>
          )}

          {step === "reset" && (
            <>
              <p style={{ textAlign: "center", color: "var(--page-sub)", fontSize: 15, marginTop: 10 }}>
                验证码已发送至 {email}
              </p>
              <form onSubmit={handleReset} noValidate style={{ marginTop: 32 }}>
                <div className="form-field">
                  <label>验证码</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="请输入 6 位验证码"
                    required
                    maxLength={6}
                    inputMode="numeric"
                  />
                </div>
                <div className="form-field">
                  <label>新密码</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="请设置新密码（至少 6 位）"
                    required
                    minLength={6}
                  />
                </div>
                {error && (
                  <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>
                )}
                <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 24 }} disabled={resetting} aria-busy={resetting}>
                  {resetting ? "重置中..." : "重置密码"}
                </button>
                <p style={{ textAlign: "center", marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={resendCode}
                    disabled={countdown > 0 || sending}
                    style={{
                      background: "none", border: "none", color: countdown > 0 ? "#ccc" : "#6366f1",
                      cursor: countdown > 0 ? "default" : "pointer", fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {sending ? "发送中..." : countdown > 0 ? `${countdown}s 后重新发送` : "重新发送验证码"}
                  </button>
                </p>
              </form>
            </>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <p style={{ color: "var(--page-sub)", fontSize: 15 }}>
                密码重置成功 请使用新密码登录
              </p>
              <Link
                href="/login"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  marginTop: 24, padding: "12px 32px", borderRadius: 10,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff", fontSize: 15, fontWeight: 600, textDecoration: "none",
                }}
              >
                前往登录
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
