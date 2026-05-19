import Head from "next/head";

const versions = [
  {
    href: "/",
    label: "当前版",
    title: "深色平台感",
    text: "信息完整、平台感强，适合保留控制台和模型调度的专业感。",
  },
  {
    href: "/v2",
    label: "版本 A",
    title: "白底极简成交",
    text: "更像干净 SaaS 首页，适合强调快速接入、价格透明和新手友好。",
  },
  {
    href: "/v3",
    label: "版本 B",
    title: "深色简洁稳重",
    text: "更贴近 aheapi 的骨架，首页先讲核心能力，再讲三步接入与帮助文档。",
  },
  {
    href: "/v4",
    label: "版本 C",
    title: "文档优先转化",
    text: "更适合中国用户先看怎么接入，信息克制，帮助区和配置区更显眼。",
  },
];

export default function VersionsPage() {
  return (
    <>
      <Head>
        <title>FlowAPI 版本预览</title>
      </Head>
      <main
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top left, rgba(73, 170, 255, 0.12), transparent 32%), linear-gradient(180deg, #071018 0%, #0b1018 100%)",
          color: "#f5f7fb",
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: "56px 24px 72px",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ maxWidth: 720 }}>
            <div
              style={{
                display: "inline-flex",
                padding: "6px 12px",
                borderRadius: 999,
                background: "rgba(120, 188, 255, 0.14)",
                color: "#91c3ff",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              明天挑版本用
            </div>
            <h1 style={{ margin: "18px 0 0", fontSize: 54, lineHeight: 1.02, letterSpacing: "-0.04em" }}>
              智流 FlowAPI
              <br />
              首页方案对比
            </h1>
            <p style={{ margin: "18px 0 0", color: "#aeb9cc", fontSize: 18, lineHeight: 1.8 }}>
              我把首页整理成几个方向，重点都围绕你说的那件事：
              保留平台感，但减少噪音，让用户更快看懂这是一个 AI API 中转站。
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 18,
              marginTop: 40,
            }}
          >
            {versions.map((version) => (
              <a
                key={version.href}
                href={version.href}
                style={{
                  display: "block",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 18,
                  background: "rgba(13, 20, 31, 0.78)",
                  padding: 24,
                  color: "#f5f7fb",
                  textDecoration: "none",
                  boxShadow: "0 24px 60px rgba(0,0,0,0.26)",
                }}
              >
                <div style={{ color: "#79b7ff", fontSize: 12, fontWeight: 700 }}>{version.label}</div>
                <h2 style={{ margin: "12px 0 0", fontSize: 28, lineHeight: 1.08 }}>{version.title}</h2>
                <p style={{ margin: "14px 0 0", color: "#9ba7bd", lineHeight: 1.8, minHeight: 88 }}>
                  {version.text}
                </p>
                <div style={{ marginTop: 18, color: "#d6e6ff", fontWeight: 700 }}>打开预览</div>
              </a>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
