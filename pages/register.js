import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

const TERMS_VERSION = "2026-01-01";
const PRIVACY_VERSION = "2026-01-01";

export default function RegisterPage() {
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [verifyToken, setVerifyToken] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [termsModal, setTermsModal] = useState(false);
  const [privacyModal, setPrivacyModal] = useState(false);

  async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) queueMicrotask(() => setInvitationCode(invite.toUpperCase()));
  }, []);

  function startCountdown() {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    setSending(true);

    if (!agreedTerms) {
      setError("请先阅读并同意 FlowAPI 用户协议和隐私政策。");
      setSending(false);
      return;
    }

    if (!email || !password) {
      setError("请输入邮箱和密码");
      setSending(false);
      return;
    }

    if (password.length < 6) {
      setError("密码至少 6 位");
      setSending(false);
      return;
    }

    try {
      const res = await fetchWithTimeout("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, invitationCode, purpose: "register",
          acceptedTerms: true,
          acceptedTermsAt: new Date().toISOString(),
          termsVersion: TERMS_VERSION,
          acceptedPrivacy: true,
          privacyVersion: PRIVACY_VERSION,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `注册失败 (HTTP ${res.status})`);
        return;
      }
      if (data.verifyToken) setVerifyToken(data.verifyToken);
      startCountdown();
      setStep("verify");
    } catch (error) {
      setError(error.message || "注册请求失败");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setVerifying(true);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, code, verifyToken, password, invitationCode,
          acceptedTerms: true,
          acceptedTermsAt: new Date().toISOString(),
          termsVersion: TERMS_VERSION,
          acceptedPrivacy: true,
          privacyVersion: PRIVACY_VERSION,
        }),
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
    } catch (error) {
      setError(error.name === "AbortError" ? "验证请求超时，请检查网络后重试" : error.message || "验证失败");
    } finally {
      setVerifying(false);
    }
  }

  async function resendCode() {
    setSending(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, invitationCode, purpose: "register",
          acceptedTerms: true,
          acceptedTermsAt: new Date().toISOString(),
          termsVersion: TERMS_VERSION,
          acceptedPrivacy: true,
          privacyVersion: PRIVACY_VERSION,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `验证码发送失败 (HTTP ${res.status})`);
      } else {
        if (data.verifyToken) setVerifyToken(data.verifyToken);
        startCountdown();
      }
    } catch (error) {
      setError(error.name === "AbortError" ? "验证码发送请求超时，请稍后重试" : error.message || "验证码发送失败");
    }
    setSending(false);
  }

  function handleAgreeFromModal() {
    setAgreedTerms(true);
    setTermsModal(false);
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
              <Link className="btn-secondary btn-small" href="/login">登录</Link>
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
              <form onSubmit={handleRegister} noValidate style={{ marginTop: 32 }}>
                <div className="form-field">
                  <label>邮箱</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入邮箱地址" required />
                </div>
                <div className="form-field">
                  <label>密码</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请设置密码（至少 6 位）" required minLength={6} />
                </div>
                <div className="form-field">
                  <label>邀请码</label>
                  <input type="text" value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} placeholder="请输入邀请码，可选" autoComplete="off" />
                  <span style={{ fontSize: 11, color: "var(--page-subtle)", marginTop: 3, display: "block" }}>
                    填写邀请码后，完成首笔充值可获得额外奖励额度。
                  </span>
                </div>

                {/* Terms checkbox */}
                <label className={`terms-agreement-row ${agreedTerms ? "agreed" : ""}`}>
                  <input
                    type="checkbox"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                  />
                  <span className="terms-agreement-text">
                    我已阅读并同意
                    <button type="button" onClick={(e) => { e.preventDefault(); setTermsModal(true); }}>《FlowAPI 用户协议》</button>
                    和
                    <button type="button" onClick={(e) => { e.preventDefault(); setPrivacyModal(true); }}>《FlowAPI 隐私政策》</button>
                  </span>
                </label>

                {error && (
                  <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>
                )}
                <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 24 }} disabled={sending} aria-busy={sending}>
                  {sending ? "发送中..." : "发送验证码"}
                </button>
              </form>
            </>
          )}

          {step === "verify" && (
            <>
              <p style={{ textAlign: "center", color: "var(--page-sub)", fontSize: 15, marginTop: 10 }}>
                验证码已发送至 {email}
              </p>
              <form onSubmit={handleVerify} noValidate style={{ marginTop: 32 }}>
                <div className="form-field">
                  <label>邮箱验证码</label>
                  <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="请输入 6 位验证码" required maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
                </div>
                {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "8px 0" }}>{error}</p>}
                <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 24 }} disabled={verifying} aria-busy={verifying}>
                  {verifying ? "验证中..." : "完成注册"}
                </button>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button type="button" onClick={resendCode} disabled={countdown > 0 || sending}
                    style={{ background: "none", border: "none", color: countdown > 0 ? "#ccc" : "#6366f1", cursor: countdown > 0 ? "default" : "pointer", fontSize: 13, fontWeight: 600 }}>
                    {sending ? "发送中..." : countdown > 0 ? `${countdown}s 后重新发送` : "重新发送验证码"}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <p style={{ color: "var(--page-sub)", fontSize: 15 }}>邮箱验证成功，体验额度已发放到你的账户。下一步先创建 API Key，马上跑通第一次真实调用。</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
                <Link href="/api-management?source=register" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "12px 24px", borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>立即使用</Link>
                <Link href="/images" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.24)", background: "rgba(255,255,255,0.9)", color: "var(--page-heading)", fontSize: 15, fontWeight: 700, textDecoration: "none" }}>直接去生成图片</Link>
              </div>
            </div>
          )}
        </div>

        {/* Terms Modal */}
        {termsModal && (
          <div className="terms-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setTermsModal(false); }}>
            <div className="terms-modal">
              <header className="terms-modal-header">
                <h2>FlowAPI 用户协议</h2>
                <button type="button" onClick={() => setTermsModal(false)}>×</button>
              </header>
              <div className="terms-modal-body">
                <p className="terms-modal-updated">更新日期：2026年1月1日 · 生效日期：2026年1月1日</p>
                <p>亲爱的用户，欢迎您使用 FlowAPI 产品及服务！</p>
                <p>FlowAPI 产品及服务由 <strong>FlowAPI 平台</strong> 负责运营。在使用本服务前，请您务必仔细阅读并理解本《FlowAPI 用户协议》。</p>
                <p className="terms-modal-warning">我们特别提醒您：当您通过网络页面点击确认、勾选等方式同意本协议或实际使用本服务时，均表示您已接受所述的所有条款。如果您不同意全部协议的任一内容，请停止使用本服务。</p>

                <h3>一、服务内容</h3>
                <p>FlowAPI 是一个 AI API 聚合与中转平台，主要提供各类人工智能服务 API 的统一接入与管理服务。我们不直接提供底层人工智能模型服务，而是通过接入第三方 AI 服务提供商，将相关 API 服务整合到 FlowAPI 平台中。</p>

                <h3>二、账号管理</h3>
                <p>您须妥善保管账号、密码、API Key、验证码等凭证。API Key 是您调用 FlowAPI 服务的重要凭证，因您泄露 API Key 造成的调用消耗和损失由您自行承担。</p>

                <h3>三、使用规范</h3>
                <p>您不得利用本服务进行违法违规内容生成、恶意刷量、攻击平台、绕过计费、滥用 API Key、倒卖违规服务等行为。平台有权对异常请求、恶意调用、高频失败请求、疑似密钥泄露行为进行限制、暂停、封禁或风控处理。</p>

                <h3>四、API 使用与调用</h3>
                <p>FlowAPI 所转发的 AI 服务 API 响应结果由对应第三方 AI 服务提供商的人工智能模型生成。相关内容可能存在错误或不准确，仅供参考，不构成专业建议。</p>

                <h3>五、违约责任</h3>
                <p>若因您的行为导致 FlowAPI 卷入诉讼或遭受索赔，您应负责解决并赔偿 FlowAPI 因此产生的一切损失。</p>

                <h3>六、法律适用</h3>
                <p>本协议适用中华人民共和国大陆地区法律。协商不成的，任何一方均有权向 FlowAPI 平台运营主体所在地有管辖权的人民法院提起诉讼。</p>

                <p className="terms-modal-link-hint">
                  完整协议请查看 <Link href="/terms" target="_blank" onClick={() => setTermsModal(false)}>FlowAPI 用户协议全文</Link>
                </p>
              </div>
              <footer className="terms-modal-footer">
                <button type="button" className="btn-primary" onClick={handleAgreeFromModal}>我已阅读并同意</button>
                <button type="button" className="btn-secondary" onClick={() => setTermsModal(false)}>取消</button>
              </footer>
            </div>
          </div>
        )}

        {/* Privacy Modal */}
        {privacyModal && (
          <div className="terms-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPrivacyModal(false); }}>
            <div className="terms-modal">
              <header className="terms-modal-header">
                <h2>FlowAPI 隐私政策</h2>
                <button type="button" onClick={() => setPrivacyModal(false)}>×</button>
              </header>
              <div className="terms-modal-body">
                <p className="terms-modal-updated">更新日期：2026年1月1日 · 生效日期：2026年1月1日</p>
                <p>FlowAPI 平台深知个人信息对您的重要性。本隐私政策旨在向您说明我们如何收集、使用、存储和保护您的个人信息。</p>
                <h3>一、我们收集哪些信息</h3>
                <p>注册信息（邮箱、密码）、API 调用数据（Token 用量、模型名称、IP）、交易记录（金额、支付方式）等。</p>
                <h3>二、我们如何使用信息</h3>
                <p>为您提供 API 转发服务、安全风控、计费结算、服务优化和法律合规。</p>
                <h3>三、API 请求与调用数据</h3>
                <p>我们不使用您的 API 输入和输出内容进行模型训练。API 请求数据在必要期限内保留，超出后删除或匿名化。</p>
                <h3>四、数据安全</h3>
                <p>我们采用 TLS 加密传输、密码哈希存储、API Key 脱敏展示、访问权限控制等措施保护您的数据。</p>
                <h3>五、用户权利</h3>
                <p>您有权访问、更正、删除您的个人信息，有权撤回同意。请通过「联系我们」与我们联系。</p>
                <p className="terms-modal-link-hint">
                  完整隐私政策请查看 <Link href="/privacy" target="_blank" onClick={() => setPrivacyModal(false)}>FlowAPI 隐私政策全文</Link>
                </p>
              </div>
              <footer className="terms-modal-footer">
                <button type="button" className="btn-primary" onClick={() => { setAgreedTerms(true); setPrivacyModal(false); }}>我已阅读并同意</button>
                <button type="button" className="btn-secondary" onClick={() => setPrivacyModal(false)}>取消</button>
              </footer>
            </div>
          </div>
        )}
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
