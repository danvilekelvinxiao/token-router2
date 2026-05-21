import Head from "next/head";
import Link from "next/link";
import { useState } from "react";

const apiBaseUrl = "https://flowapi.fun/v1";

const models = [
  { name: "GPT", scene: "复杂分析 / 代码辅助", price: "均衡", score: "4.8" },
  { name: "Claude", scene: "长文分析 / 复杂推理", price: "成本较高", score: "5.0" },
  { name: "DeepSeek", scene: "中文内容 / 日常写作", price: "低成本", score: "5.0" },
  { name: "Qwen", scene: "商务邮件 / 办公总结", price: "低成本", score: "4.5" },
  { name: "Kimi", scene: "长文阅读 / 知识整理", price: "中低", score: "4.6" },
  { name: "GLM", scene: "办公问答 / 轻量推理", price: "低成本", score: "4.4" },
  { name: "Gemini", scene: "多模态 / 海外资料", price: "均衡", score: "4.5" },
  { name: "Mistral", scene: "英文任务 / 自动化", price: "低成本", score: "4.2" },
  { name: "MiniMax", scene: "内容生成 / 角色场景", price: "灵活", score: "4.3" },
];

const plans = [
  { name: "免费体验", price: "¥0", desc: "注册即送 Token，适合先测试效果", features: ["网页端体验", "基础模型试用", "新手文档"] },
  { name: "个人版", price: "按量充值", desc: "适合个人开发者、AI 工具玩家", features: ["人民币充值", "调用日志", "模型广场"] },
  { name: "团队版", price: "余额池", desc: "适合工作室、小团队、自媒体", features: ["多密匙管理", "成本统计", "智能路由"] },
  { name: "企业版", price: "专属方案", desc: "更高额度、独立通道、专属客服", features: ["独立通道", "专属客服", "用量对账"] },
];

export default function V2() {
  const [prompt, setPrompt] = useState("用中文解释一下 FlowAPI 为什么适合新手接入 AI API。");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");

  async function copy(text, label) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  async function testChat() {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer sk-******", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      setResult(data.choices?.[0]?.message?.content || "未获取到回复");
    } catch (e) {
      setResult("请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head><title>智流 FlowAPI - 版本 A</title></Head>

      <main style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: "#111", background: "#fff" }}>
        {/* ---- Nav ---- */}
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1160, margin: "0 auto", padding: "24px 24px" }}>
          <Link href="/versions" style={{ fontWeight: 800, fontSize: 22, color: "#111", textDecoration: "none", letterSpacing: "-0.02em" }}>智流 FlowAPI</Link>
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <a href="#quickstart" style={{ color: "#555", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>快速开始</a>
            <a href="#models" style={{ color: "#555", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>模型</a>
            <a href="#pricing" style={{ color: "#555", textDecoration: "none", fontSize: 14, fontWeight: 500 }}>价格</a>
            <a href="#try" style={{ background: "#111", color: "#fff", padding: "8px 20px", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>控制台</a>
          </div>
        </nav>

        {/* ---- Hero ---- */}
        <section style={{ maxWidth: 1160, margin: "0 auto", padding: "80px 24px 60px" }}>
          <div style={{ display: "inline-block", background: "#eef2ff", color: "#4338ca", padding: "4px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 28 }}>
            版本 A · 白底极简成交
          </div>
          <h1 style={{ fontSize: 54, fontWeight: 900, lineHeight: 1.1, margin: 0, letterSpacing: "-0.03em" }}>
            一个 API 密匙
            <br />
            调用全球主流 AI 模型
          </h1>
          <p style={{ fontSize: 18, color: "#666", lineHeight: 1.7, marginTop: 24, maxWidth: 500 }}>
            无需海外支付，无需复杂配置。充值 Token 即可使用 GPT、Claude、DeepSeek 等模型。
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <a href="#quickstart" style={{ background: "#111", color: "#fff", padding: "13px 26px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 6 }}>
              立即开始 <span style={{ fontSize: 16 }}>→</span>
            </a>
            <a href="#try" style={{ background: "#f4f4f5", color: "#333", padding: "13px 26px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 15 }}>
              在线体验
            </a>
          </div>

          {/* Quick copy bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 18px", marginTop: 48, maxWidth: 620, flexWrap: "wrap" }}>
            <code style={{ fontSize: 13, color: "#111", fontWeight: 600 }}>{apiBaseUrl}</code>
            <span style={{ color: "#999", fontSize: 13 }}>/chat/completions</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => copy(apiBaseUrl, "base")} style={{ border: "none", background: "#fff", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#111", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
              {copied === "base" ? "已复制" : "复制 Base URL"}
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginTop: 64 }}>
            {[["99.7%", "可用率"], ["1.4s", "平均响应"], ["9+", "主流模型"], ["1 个密匙", "统一接入"]].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontSize: 36, fontWeight: 900, color: "#111", letterSpacing: "-0.02em" }}>{v}</div>
                <div style={{ fontSize: 14, color: "#888", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Quick Start ---- */}
        <section id="quickstart" style={{ background: "#fafafa", padding: "88px 24px" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <span style={{ display: "inline-block", background: "#e0e7ff", color: "#4338ca", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>Quick Start</span>
              <h2 style={{ fontSize: 42, fontWeight: 900, color: "#111", margin: 0, letterSpacing: "-0.02em" }}>三步即可开始</h2>
              <p style={{ color: "#888", marginTop: 12, fontSize: 16 }}>不懂 API 也能照着走，3 分钟完成接入</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {[
                { step: "01", title: "注册账号", text: "完成注册进入控制台，获得专属接入环境" },
                { step: "02", title: "创建 API 密匙", text: "在控制台创建 API 密匙，支持多 API 密匙管理" },
                { step: "03", title: "一键配置", text: "复制 Base URL 和 API 密匙，接入 OpenAI 兼容客户端" },
              ].map((s) => (
                <div key={s.step} style={{ background: "#fff", borderRadius: 12, padding: "36px 28px", border: "1px solid #f0f0f0", transition: "box-shadow .2s" }}>
                  <div style={{ fontSize: 44, fontWeight: 900, color: "#e5e7eb", lineHeight: 1 }}>{s.step}</div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: "20px 0 8px" }}>{s.title}</h3>
                  <p style={{ color: "#888", lineHeight: 1.7, margin: 0, fontSize: 15 }}>{s.text}</p>
                </div>
              ))}
            </div>

            {/* Code block */}
            <div style={{ background: "#1e1e2e", borderRadius: 12, padding: 24, marginTop: 28, overflow: "auto" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>curl 示例</div>
              <pre style={{ color: "#a6e3a1", fontSize: 13, lineHeight: 2, margin: 0, fontFamily: "'SF Mono','Fira Code',monospace" }}>
{`curl ${apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer sk-xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "deepseek-chat",
       "messages": [{"role":"user","content":"你好"}]}'`}
              </pre>
            </div>
          </div>
        </section>

        {/* ---- Models ---- */}
        <section id="models" style={{ padding: "88px 24px", maxWidth: 1160, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <span style={{ display: "inline-block", background: "#fef3c7", color: "#d97706", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>Model Hub</span>
            <h2 style={{ fontSize: 42, fontWeight: 900, color: "#111", margin: 0, letterSpacing: "-0.02em" }}>模型广场</h2>
            <p style={{ color: "#888", marginTop: 12, fontSize: 16 }}>按任务选择最合适的模型，一个 API 密匙调用所有</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {models.map((m) => (
              <div key={m.name} style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: "22px 20px", background: "#fff", transition: "box-shadow .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: 0 }}>{m.name}</h3>
                  <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>⭐ {m.score}</span>
                </div>
                <p style={{ color: "#888", fontSize: 13, margin: "10px 0" }}>{m.scene}</p>
                <span style={{ background: "#f5f5f5", padding: "2px 10px", borderRadius: 6, fontSize: 12, color: "#666", fontWeight: 500 }}>{m.price}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Try ---- */}
        <section id="try" style={{ background: "#fafafa", padding: "88px 24px" }}>
          <div style={{ maxWidth: 660, margin: "0 auto", textAlign: "center" }}>
            <span style={{ display: "inline-block", background: "#d1fae5", color: "#059669", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>Web Chat</span>
            <h2 style={{ fontSize: 42, fontWeight: 900, color: "#111", margin: 0, letterSpacing: "-0.02em" }}>在线体验</h2>
            <p style={{ color: "#888", margin: "12px 0 32px", fontSize: 16 }}>不想配置 API？先在网页端体验模型效果</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ width: "100%", minHeight: 100, border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, fontSize: 15, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}
            />
            <button
              onClick={testChat}
              disabled={loading}
              style={{ marginTop: 14, background: "#111", color: "#fff", border: "none", padding: "13px 36px", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.5 : 1 }}
            >
              {loading ? "调用中..." : "体验智能路由"}
            </button>
            {result && (
              <div style={{ marginTop: 20, background: "#fff", border: "1px solid #f0f0f0", borderRadius: 10, padding: 24, textAlign: "left", color: "#333", lineHeight: 1.8, whiteSpace: "pre-wrap", fontSize: 15 }}>
                {result}
              </div>
            )}
          </div>
        </section>

        {/* ---- Pricing ---- */}
        <section id="pricing" style={{ padding: "88px 24px", maxWidth: 1160, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <span style={{ display: "inline-block", background: "#fce7f3", color: "#db2777", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>Pricing</span>
            <h2 style={{ fontSize: 42, fontWeight: 900, color: "#111", margin: 0, letterSpacing: "-0.02em" }}>价格透明</h2>
            <p style={{ color: "#888", marginTop: 12, fontSize: 16 }}>从免费到企业，按需选择</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {plans.map((p) => (
              <div key={p.name} style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 28, background: "#fff" }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: 0 }}>{p.name}</h3>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "14px 0", letterSpacing: "-0.02em" }}>{p.price}</div>
                <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6 }}>{p.desc}</p>
                <ul style={{ listStyle: "none", padding: 0, marginTop: 22 }}>
                  {p.features.map((f) => (
                    <li key={f} style={{ borderTop: "1px solid #f5f5f5", padding: "9px 0", color: "#555", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#22c55e", fontSize: 12 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Footer ---- */}
        <footer style={{ borderTop: "1px solid #f0f0f0", padding: "32px 24px", textAlign: "center", color: "#999", fontSize: 13 }}>
          智流 FlowAPI · 版本 A · AI API 中转平台 · 让用户更快看懂并开始接入
        </footer>
      </main>
    </>
  );
}
