import Head from "next/head";
import Link from "next/link";
import { apiBaseUrl, docItems, models, plans, quickSteps } from "@/lib/landing-content";

const shell = {
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  background: "#f5f7fb",
  color: "#111827",
  minHeight: "100vh",
};

const panel = {
  border: "1px solid #e4e9f2",
  borderRadius: 18,
  background: "#ffffff",
  boxShadow: "0 24px 60px rgba(17, 24, 39, 0.06)",
};

export default function V4Page() {
  return (
    <>
      <Head>
        <title>FlowAPI 版本 C - 文档优先转化</title>
      </Head>
      <main style={shell}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 72px" }}>
          <nav
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "24px 0",
            }}
          >
            <Link href="/versions" style={{ color: "#111827", textDecoration: "none" }}>
              <div style={{ fontWeight: 800, fontSize: 22 }}>智流 FlowAPI</div>
              <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>版本 C · 文档优先转化</div>
            </Link>
            <div style={{ display: "flex", gap: 28, fontSize: 14, color: "#4b5563" }}>
              <a href="#start" style={{ color: "inherit", textDecoration: "none" }}>快速开始</a>
              <a href="#docs" style={{ color: "inherit", textDecoration: "none" }}>帮助文档</a>
              <a href="#plans" style={{ color: "inherit", textDecoration: "none" }}>价格套餐</a>
            </div>
          </nav>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "1.05fr 0.95fr",
              gap: 24,
              padding: "34px 0 24px",
              alignItems: "start",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#e5f1ff",
                  color: "#2563eb",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                中国 AI Token 调度平台
              </div>
              <h1 style={{ margin: "18px 0 0", fontSize: 70, lineHeight: 0.98, letterSpacing: "-0.05em" }}>
                智流 FlowAPI
              </h1>
              <h2 style={{ margin: "18px 0 0", fontSize: 34, lineHeight: 1.16, maxWidth: 720 }}>
                一个 API 密匙，调用全球主流 AI 模型
              </h2>
              <p style={{ margin: "18px 0 0", color: "#4b5563", fontSize: 18, lineHeight: 1.9, maxWidth: 720 }}>
                面向中国用户的 AI API 中转站。用户打开首页后，
                第一眼就知道可以充值 Token、统一调用多个模型、不会 API 也能三步接入。
              </p>
              <div style={{ display: "flex", gap: 14, marginTop: 30, flexWrap: "wrap" }}>
                <a
                  href="#docs"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "14px 24px",
                    borderRadius: 12,
                    textDecoration: "none",
                    background: "#111827",
                    color: "#ffffff",
                    fontWeight: 800,
                  }}
                >
                  查看帮助文档
                </a>
                <a
                  href="#start"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "14px 24px",
                    borderRadius: 12,
                    textDecoration: "none",
                    background: "#eef2f7",
                    color: "#111827",
                    fontWeight: 700,
                  }}
                >
                  三步开始接入
                </a>
              </div>
            </div>

            <aside style={{ ...panel, padding: 24 }}>
              <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 800 }}>最小接入配置</div>
              <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
                <div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Base URL</div>
                  <code style={{ display: "block", marginTop: 8, color: "#111827", fontSize: 14 }}>{apiBaseUrl}</code>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Authorization</div>
                  <code style={{ display: "block", marginTop: 8, color: "#111827", fontSize: 14 }}>Bearer sk-xxxx</code>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Model</div>
                  <code style={{ display: "block", marginTop: 8, color: "#111827", fontSize: 14 }}>从模型广场复制模型名</code>
                </div>
              </div>
              <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
                {["人民币充值 Token", "OpenAI 兼容接口", "CC Switch 一键配置", "OpenClaw / Cline / Roo-Code 兼容"].map((item) => (
                  <div
                    key={item}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "#f7f9fd",
                      color: "#334155",
                      fontSize: 14,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginTop: 14 }}>
            {[
              {
                title: "首页先讲核心能力",
                text: "让用户第一眼先知道你卖什么，而不是先被教程和太多信息淹没。",
              },
              {
                title: "接入流程非常简单",
                text: "复制 Base URL、复制 API 密匙、选择模型名，就能接入大多数兼容客户端。",
              },
              {
                title: "开发者和小白都能看懂",
                text: "文案少而直接，帮助区明显，新手不怕，开发者也能直接开用。",
              },
            ].map((item) => (
              <article key={item.title} style={{ ...panel, padding: 22 }}>
                <h3 style={{ margin: 0, fontSize: 24, lineHeight: 1.14 }}>{item.title}</h3>
                <p style={{ margin: "14px 0 0", color: "#4b5563", lineHeight: 1.8 }}>{item.text}</p>
              </article>
            ))}
          </section>

          <section id="start" style={{ paddingTop: 86 }}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 800 }}>Quick Start</div>
              <h2 style={{ margin: "14px 0 0", fontSize: 58, lineHeight: 1.02, letterSpacing: "-0.05em" }}>三步即可开始</h2>
              <p style={{ margin: "16px 0 0", color: "#4b5563", fontSize: 18, lineHeight: 1.85 }}>
                这版把接入路径放得更靠前，适合更强调“马上开始用”的转化思路。
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginTop: 28 }}>
              {quickSteps.map((step) => (
                <article key={step.step} style={{ ...panel, padding: 24, minHeight: 228 }}>
                  <div style={{ color: "#60a5fa", fontSize: 16, fontWeight: 900 }}>{step.step}</div>
                  <h3 style={{ margin: "28px 0 0", fontSize: 30, lineHeight: 1.06 }}>{step.title}</h3>
                  <p style={{ margin: "14px 0 0", color: "#4b5563", lineHeight: 1.9 }}>{step.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="docs" style={{ paddingTop: 86 }}>
            <div style={{ display: "grid", gridTemplateColumns: "0.88fr 1.12fr", gap: 20 }}>
              <div style={{ ...panel, padding: 24 }}>
                <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 800 }}>帮助文档</div>
                <h2 style={{ margin: "14px 0 0", fontSize: 48, lineHeight: 1.08 }}>不会 API 也能接入</h2>
                <p style={{ margin: "16px 0 0", color: "#4b5563", lineHeight: 1.9, fontSize: 17 }}>
                  这版把帮助区做成首页核心内容，适合你以后更偏“新手入口”和“快速配置”路线。
                </p>
                <pre
                  style={{
                    margin: "24px 0 0",
                    padding: 18,
                    borderRadius: 14,
                    background: "#111827",
                    color: "#dbeafe",
                    overflowX: "auto",
                    fontSize: 13,
                    lineHeight: 1.8,
                  }}
                >
{`curl ${apiBaseUrl}/chat/completions
  -H "Authorization: Bearer sk-xxxx"
  -H "Content-Type: application/json"`}
                </pre>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {docItems.map((item) => (
                  <div key={item} style={{ ...panel, padding: 18 }}>
                    <div style={{ color: "#111827", fontWeight: 700 }}>{item}</div>
                  </div>
                ))}
                <div style={{ ...panel, padding: 18 }}>
                  <div style={{ color: "#111827", fontWeight: 700 }}>推荐接入方式</div>
                  <p style={{ margin: "10px 0 0", color: "#4b5563", lineHeight: 1.8 }}>
                    登录后进入控制台创建 API 密匙，点击 CC Switch，一键填入 Base URL、模型和 API 密匙。
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section style={{ paddingTop: 86 }}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 800 }}>Model Hub</div>
              <h2 style={{ margin: "14px 0 0", fontSize: 54, lineHeight: 1.02, letterSpacing: "-0.05em" }}>模型广场</h2>
              <p style={{ margin: "16px 0 0", color: "#4b5563", fontSize: 18, lineHeight: 1.85 }}>
                这里保持简洁，不一次性塞太多模型卡。只保留最常见、最容易成交的几类场景。
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginTop: 28 }}>
              {models.map((model) => (
                <article key={model.name} style={{ ...panel, padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 24 }}>{model.name}</h3>
                    <div style={{ color: "#f59e0b", fontSize: 12, fontWeight: 800 }}>推荐 {model.score}</div>
                  </div>
                  <p style={{ margin: "14px 0 0", color: "#4b5563", lineHeight: 1.8 }}>{model.scene}</p>
                  <div
                    style={{
                      display: "inline-flex",
                      marginTop: 14,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "#eef4ff",
                      color: "#2563eb",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {model.tag}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="plans" style={{ paddingTop: 86 }}>
            <div style={{ maxWidth: 760 }}>
              <div style={{ color: "#2563eb", fontSize: 12, fontWeight: 800 }}>Pricing</div>
              <h2 style={{ margin: "14px 0 0", fontSize: 54, lineHeight: 1.02, letterSpacing: "-0.05em" }}>价格套餐</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 28 }}>
              {plans.map((plan) => (
                <article key={plan.name} style={{ ...panel, padding: 22 }}>
                  <h3 style={{ margin: 0, fontSize: 22 }}>{plan.name}</h3>
                  <div style={{ marginTop: 14, fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em" }}>{plan.price}</div>
                  <p style={{ margin: "14px 0 0", color: "#4b5563", lineHeight: 1.8 }}>{plan.text}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
