import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getPublicApiBaseUrl } from "@/lib/public-api";

const apiBaseUrl = getPublicApiBaseUrl();

const features = [
  {
    icon: "🌐",
    title: "统一接入全球模型",
    desc: "Claude、GPT、Gemini、DeepSeek 等模型统一接口自动调用。",
  },
  {
    icon: "🎁",
    title: "注册即送额度",
    desc: "新用户注册即可获得体验额度先用起来再决定是否充值。",
  },
  {
    icon: "⚡",
    title: "自动配置 API",
    desc: "复制 Base URL 和 API Key，即可接入 Claude Code、Cursor 等主流 AI 工具。",
  },
  {
    icon: "📊",
    title: "Token 消耗可视化",
    desc: "每一次调用都会记录 Token、金额、模型和来源。",
  },
];

const steps = [
  {
    number: "01",
    title: "注册账号",
    desc: "进入控制台获得你的专属 API 接入环境。",
  },
  {
    number: "02",
    title: "创建 API Key",
    desc: "创建你的专属 API Key，支持多个 Key 独立管理。",
  },
  {
    number: "03",
    title: "自动配置",
    desc: "自动填入 Base URL、模型和 API Key，几分钟完成接入。",
  },
];

export default function HomePage() {
  const [qqCopied, setQqCopied] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("flowapi_customer");
      if (stored) queueMicrotask(() => setCustomer(JSON.parse(stored)));
    } catch { /* ignore */ }
    queueMicrotask(() => setReady(true));
  }, []);

  function handleLogout() {
    localStorage.removeItem("flowapi_customer");
    setCustomer(null);
    window.location.href = "/";
  }

  function copyQQ() {
    navigator.clipboard.writeText("217637139").then(() => {
      setQqCopied(true);
      setTimeout(() => setQqCopied(false), 2000);
    });
  }

  return (
    <>
      <Head>
        <title>FlowAPI - AI API Token 充值与统一调用平台</title>
        <meta
          name="description"
          content="FlowAPI 提供 AI API Token 充值、统一 Base URL、API Key 管理、模型调用、扣费记录和用量日志。三步接入 Claude、GPT、Gemini、DeepSeek 等 AI 模型。"
        />
      </Head>

      <main className="landing-shell">
        {/* ---- Nav ---- */}
        <nav className="landing-nav">
          <div className="landing-nav-inner">
            <Link className="landing-logo" href="/">
              <span>Flow</span>API
            </Link>
            <div className="landing-nav-actions">
              {!ready ? null : customer ? (
                <>
                  <span className="landing-nav-user">
                    {customer.name || customer.email || customer.company}
                  </span>
                  <Link className="btn-primary btn-small" href="/dashboard">
                    进入控制台
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="btn-secondary btn-small"
                  >
                    退出
                  </button>
                </>
              ) : (
                <>
                  <Link className="btn-secondary btn-small" href="/login">
                    登录
                  </Link>
                  <Link className="btn-primary btn-small" href="/register">
                    注册
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        {/* ======== 第一部分：Hero ======== */}
        <section className="hero-wrap">
          <h1 className="hero-title">AI API Token 充值与统一调用平台</h1>
          <p className="hero-subtitle">
            <strong>注册即送 ¥5 体验额度</strong>
            <br />
            自动生成 API Key，三步完成接入
            <br />
            马上使用 Claude、GPT、Gemini、DeepSeek 等全球 AI 领先模型
          </p>
          <div className="hero-actions-landing">
            {ready && customer ? (
              <Link className="btn-primary" href="/dashboard">
                进入控制台
              </Link>
            ) : (
              <>
                <Link className="btn-primary" href="/register">
                  立即开始
                </Link>
                <Link className="btn-secondary" href="/login">
                  已有账号
                </Link>
              </>
            )}
          </div>

          {/* 优势卡片 */}
          <div className="features-grid">
            {features.map((f) => (
              <div className="feature-card" key={f.title}>
                <div className="feature-card-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* 数据条 */}
          <div className="hero-stats">
            {[
              ["¥5", "注册送额度"],
              ["3 步", "完成接入"],
              ["多模型", "统一调用"],
              ["1 Key", "统一接入"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="hero-stat-value">{v}</div>
                <div className="hero-stat-label">{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ======== 第二部分：三步接入 + CURL 对比 ======== */}
        <section className="landing-section quickstart-section">
          <div className="quickstart-inner">
            <div className="section-heading-landing">
              <span className="section-eyebrow">Quick Start</span>
              <h2>三步即可开始</h2>
              <p>不懂 API 也能照着走，3 分钟完成接入。</p>
            </div>

            {/* 三步卡片 */}
            <div className="steps-grid-landing">
              {steps.map((s) => (
                <div className="step-card-landing" key={s.number}>
                  <div className="step-number">{s.number}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              ))}
            </div>

            {/* CURL 对比 */}
            <h3 className="curl-section-title">
              手动配置
            </h3>
            <div className="curl-compare">
              <div>
                <div className="curl-block">
                  <div className="curl-header">标准 CURL 示例</div>
                  <pre>{`curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer sk-xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-5.4-mini",
       "messages": [{"role":"user","content":"你好"}]}'`}</pre>
                </div>
              </div>
              <div>
                <div className="curl-block">
                  <div className="curl-header curl-header-accent">
                    你只需要替换这里
                  </div>
                  <pre>{`curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer 你生成的api key" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "你需要的模型",
       "messages": [{"role":"user","content":"你好"}]}'`}</pre>
                </div>
              </div>
            </div>

            <p className="curl-hint">
              只需要把 <code className="curl-inline-code">sk-xxxx</code> 换成你在控制台生成的 API Key，把模型名换成你想使用的模型即可。
            </p>
            <p className="curl-baseurl">
              Base URL 固定使用：<code>{apiBaseUrl}</code>
            </p>
          </div>
        </section>

        {/* ======== 第三部分：AI 玩家交流群 ======== */}
        <section className="community-section-bg">
          <div className="community-card">
            <div className="community-left">
              <div className="comm-eyebrow">QQ 社群支持</div>
              <h2>更多优惠活动和技术支持，请扫码加入 QQ 群</h2>
              <p className="comm-desc">
                群里会优先同步模型配置、Base URL、API Key 使用教程、客户端安装说明和不定期福利。遇到连接失败、模型选择、扣费异常等问题，也可以直接咨询。
              </p>

              <div className="community-tags">
                <span>福利同步</span>
                <span>模型配置</span>
                <span>下载协助</span>
              </div>

              <div className="qq-info">
                <div className="qq-info-label">QQ群号</div>
                <div className="qq-info-number">217637139</div>
                <button
                  className={`btn-copy-qq${qqCopied ? " copied" : ""}`}
                  onClick={copyQQ}
                >
                  {qqCopied ? "已复制" : "复制"}
                </button>
              </div>
            </div>

            <div className="community-right">
              <div className="qr-placeholder">
                {/* QQ 群二维码图片：主路径 public/images/qrcode/flowapi-qq-group.png，失败时显示群号卡片 */}
                {/* eslint-disable-next-line @next/next/no-img-element -- 需要 onError 回退占位 */}
                <img
                  src="/images/qrcode/flowapi-qq-group.png"
                  alt="FlowAPI QQ 群二维码"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.parentElement.innerHTML =
                      `<div class="qr-placeholder-empty"><strong>QQ 群：217637139</strong><br/><button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText('217637139')">复制群号</button></div>`;
                  }}
                />
              </div>
              <div className="qr-caption">扫码加入 QQ 群</div>
            </div>
          </div>

        </section>

        {/* ---- Footer ---- */}
        <footer className="landing-footer">
          FlowAPI · AI API Token 充值与统一调用平台
        </footer>
      </main>
    </>
  );
}
