import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.needsVerification) {
          setError("该邮箱尚未验证 请先完成注册验证");
        } else if (res.status === 429) {
          setError(data.error || "登录请求过多，请稍后再试");
        } else {
          setError(data.error || "登录失败");
        }
        return;
      }

      localStorage.setItem("flowapi_customer", JSON.stringify(data.customer));
      if (data.customer?.sessionToken) {
        localStorage.setItem("flowapi_session_token", data.customer.sessionToken);
      }
      router.push("/api-management?source=login");
    } catch {
      setError("登录请求失败，请检查网络后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>登录 - FlowAPI</title>
      </Head>

      <main className="landing-shell" style={{ minHeight: "100vh" }}>
        <nav className="landing-nav">
          <div className="landing-nav-inner">
            <Link className="landing-logo" href="/">
              <span>Flow</span>API
            </Link>
            <div className="landing-nav-actions">
              <span style={{ fontSize: 14, color: "var(--page-sub)" }}>没有账号？</span>
              <Link className="btn-primary btn-small" href="/register">
                注册
              </Link>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 420, margin: "0 auto", padding: "60px 24px" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "var(--page-heading)", textAlign: "center", letterSpacing: "-0.03em", margin: 0 }}>
            登录 FlowAPI
          </h1>
          <p style={{ textAlign: "center", color: "var(--page-sub)", fontSize: 15, marginTop: 10 }}>
            登录你的账号 管理 AI Token 资产
          </p>

          <form onSubmit={handleLogin} style={{ marginTop: 32 }}>
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
                placeholder="请输入密码"
                required
              />
            </div>
            {error && (
              <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>
            )}
            <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 24 }} disabled={submitting}>
              {submitting ? "登录中..." : "登录"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 20 }}>
            <Link
              href="/reset-password"
              style={{ color: "#6366f1", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
            >
              忘记密码？
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
