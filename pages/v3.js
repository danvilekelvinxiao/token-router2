import Head from "next/head";
import Link from "next/link";
import { apiBaseUrl, docItems, models, quickStats, quickSteps, valueCards } from "@/lib/landing-content";

function cardStyle(background = "rgba(10, 20, 33, 0.72)") {
  return {
    border: "1px solid rgba(121, 183, 255, 0.12)",
    borderRadius: 18,
    background,
    boxShadow: "0 28px 70px rgba(0,0,0,0.26)",
  };
}

export default function V3Page() {
  return (
    <>
      <Head>
        <title>FlowAPI 版本 B - 深色简洁稳重</title>
      </Head>
      <main
        style={{
          minHeight: "100vh",
          color: "#f4f8ff",
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background:
            "linear-gradient(rgba(84, 160, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(84, 160, 255, 0.04) 1px, transparent 1px), radial-gradient(circle at 18% 8%, rgba(48, 196, 166, 0.15), transparent 26%), linear-gradient(180deg, #0b1018 0%, #0d1320 100%)",
          backgroundSize: "46px 46px, 46px 46px, auto, auto",
          padding: "0 24px 72px",
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "22px 0",
            }}
          >
            <Link href="/versions" style={{ color: "#f4f8ff", textDecoration: "none" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>智流 FlowAPI</div>
              <div style={{ marginTop: 4, color: "#7e8aa4", fontSize: 12 }}>版本 B · 深色简洁稳重</div>
            </Link>
            <div style={{ display: "flex", gap: 28, color: "#b9c4d7", fontSize: 14 }}>
              <a href="#quick" style={{ color: "inherit", textDecoration: "none" }}>快速开始</a>
              <a href="#models" style={{ color: "inherit", textDecoration: "none" }}>模型广场</a>
              <a href="#docs" style={{ color: "inherit", textDecoration: "none" }}>帮助文档</a>
            </div>
          </nav>

          <section style={{ padding: "48px 0 24px", textAlign: "center" }}>
            <div
              style={{
                display: "inline-flex",
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid rgba(121, 183, 255, 0.24)",
                color: "#93d8ff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              API 稳定接入服务
            </div>
            <h1 style={{ margin: "22px 0 0", fontSize: 82, lineHeight: 0.96, letterSpacing: "-0.06em" }}>
              智流
              <br />
              FlowAPI
            </h1>
            <h2 style={{ margin: "22px auto 0", fontSize: 34, lineHeight: 1.2, maxWidth: 760 }}>
              一个 API Key，稳定调用全球主流 AI 模型
            </h2>
            <p style={{ margin: "18px auto 0", maxWidth: 780, color: "#aeb9cc", fontSize: 18, lineHeight: 1.8 }}>
              面向中国用户的 AI API 中转站。无需海外支付，无需复杂配置，
              充值 Token 后即可统一接入 GPT、Claude、DeepSeek、Qwen 等模型。
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
              <a
                href="#quick"
                style={{
                  padding: "14px 26px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, #7bc6ff, #80f0d4)",
                  color: "#081019",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                立即开始接入
              </a>
              <a
                href="#docs"
                style={{
                  padding: "14px 26px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  color: "#f4f8ff",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                查看帮助文档
              </a>
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 0.85fr",
              gap: 20,
              marginTop: 30,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18 }}>
              {valueCards.map((item, index) => (
                <article key={item.title} style={{ ...cardStyle(), padding: 24, minHeight: 196 }}>
                  <div style={{ color: "#75bfff", fontSize: 12, fontWeight: 800 }}>0{index + 1}</div>
                  <h3 style={{ margin: "22px 0 0", fontSize: 28, lineHeight: 1.1 }}>{item.title}</h3>
                  <p style={{ margin: "14px 0 0", color: "#9aa7bf", lineHeight: 1.8 }}>{item.text}</p>
                </article>
              ))}
            </div>

            <aside style={{ ...cardStyle("rgba(9, 18, 28, 0.9)"), padding: 26 }}>
              <div style={{ color: "#8ea2be", fontSize: 12, fontWeight: 700 }}>OpenAI Compatible Endpoint</div>
              <div style={{ marginTop: 22, display: "grid", gap: 16 }}>
                <div>
                  <div style={{ color: "#6f7d98", fontSize: 12 }}>Base URL</div>
                  <code style={{ display: "block", marginTop: 8, color: "#f4f8ff", fontSize: 14 }}>{apiBaseUrl}</code>
                </div>
                <div>
                  <div style={{ color: "#6f7d98", fontSize: 12 }}>Authorization</div>
                  <code style={{ display: "block", marginTop: 8, color: "#f4f8ff", fontSize: 14 }}>Bearer sk-xxxx</code>
                </div>
                <div>
                  <div style={{ color: "#6f7d98", fontSize: 12 }}>Model</div>
                  <code style={{ display: "block", marginTop: 8, color: "#f4f8ff", fontSize: 14 }}>deepseek-chat</code>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 24 }}>
                {quickStats.map(([value, text]) => (
                  <div key={value} style={{ ...cardStyle("rgba(255,255,255,0.03)"), padding: 16, boxShadow: "none" }}>
                    <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
                    <div style={{ marginTop: 6, color: "#8ea2be", fontSize: 13, lineHeight: 1.6 }}>{text}</div>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section id="quick" style={{ paddingTop: 92 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#7bc6ff", fontSize: 12, fontWeight: 800 }}>Quick Start</div>
              <h2 style={{ margin: "14px 0 0", fontSize: 62, lineHeight: 1.02, letterSpacing: "-0.05em" }}>三步即可开始</h2>
              <p style={{ margin: "16px auto 0", maxWidth: 760, color: "#aeb9cc", fontSize: 18, lineHeight: 1.8 }}>
                打开网站后，用户一眼就能知道怎么接入。先注册，再创建 API Key，再导入 CC Switch。
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginTop: 36 }}>
              {quickSteps.map((step) => (
                <article key={step.step} style={{ ...cardStyle(), padding: 24, minHeight: 220 }}>
                  <div style={{ color: "#76d6ff", fontSize: 18, fontWeight: 900 }}>{step.step}</div>
                  <h3 style={{ margin: "30px 0 0", fontSize: 34, lineHeight: 1.04 }}>{step.title}</h3>
                  <p style={{ margin: "14px 0 0", color: "#9aa7bf", lineHeight: 1.9 }}>{step.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section style={{ paddingTop: 28 }}>
            <div style={{ ...cardStyle("rgba(16, 22, 32, 0.92)"), padding: 28, display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}>
              <div>
                <div style={{ color: "#7bc6ff", fontSize: 12, fontWeight: 800 }}>推荐接入</div>
                <h2 style={{ margin: "14px 0 0", fontSize: 44, lineHeight: 1.08 }}>使用 CC Switch 一键配置</h2>
                <p style={{ margin: "16px 0 0", color: "#aeb9cc", lineHeight: 1.9, fontSize: 17 }}>
                  登录后进入控制台创建 API Key，点击 CC Switch，即可自动填入 Base URL、模型和 API Key。
                  如果工具不支持一键配置，也可以手动填写上方三项参数。
                </p>
              </div>
              <div style={{ ...cardStyle("rgba(255,255,255,0.04)"), padding: 20, boxShadow: "none" }}>
                <div style={{ color: "#8ea2be", fontSize: 12 }}>兼容工具</div>
                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  {["CC Switch", "OpenClaw", "Cline", "Roo-Code"].map((tool) => (
                    <div key={tool} style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)" }}>
                      {tool}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="models" style={{ paddingTop: 92 }}>
            <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#7bc6ff", fontSize: 12, fontWeight: 800 }}>Model Hub</div>
                <h2 style={{ margin: "14px 0 0", fontSize: 54, lineHeight: 1.04, letterSpacing: "-0.04em" }}>模型广场</h2>
              </div>
              <p style={{ margin: 0, maxWidth: 440, color: "#aeb9cc", lineHeight: 1.8 }}>
                少讲空话，直接告诉用户每个模型更适合做什么，帮助他们更快选型。
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 30 }}>
              {models.map((model) => (
                <article key={model.name} style={{ ...cardStyle(), padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 24 }}>{model.name}</h3>
                    <div style={{ color: "#f2c86b", fontSize: 12, fontWeight: 800 }}>推荐 {model.score}</div>
                  </div>
                  <p style={{ margin: "14px 0 0", color: "#aeb9cc", lineHeight: 1.8 }}>{model.scene}</p>
                  <div
                    style={{
                      display: "inline-flex",
                      marginTop: 16,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.05)",
                      color: "#dbe6fa",
                      fontSize: 12,
                    }}
                  >
                    {model.tag}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="docs" style={{ paddingTop: 92 }}>
            <div style={{ ...cardStyle("rgba(11, 18, 28, 0.88)"), padding: 28, display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 20 }}>
              <div>
                <div style={{ color: "#7bc6ff", fontSize: 12, fontWeight: 800 }}>帮助文档</div>
                <h2 style={{ margin: "14px 0 0", fontSize: 48, lineHeight: 1.08 }}>不会 API 也能接入</h2>
                <p style={{ margin: "16px 0 0", color: "#aeb9cc", lineHeight: 1.9 }}>
                  让新手第一眼就知道怎么填 Base URL、怎么复制 API Key、怎么选择模型，
                  这是中国用户转化非常关键的一步。
                </p>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {docItems.map((item) => (
                  <div key={item} style={{ ...cardStyle("rgba(255,255,255,0.03)"), padding: 18, boxShadow: "none" }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
