import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

const NEW_API_ADMIN_URL = String(process.env.NEW_API_ADMIN_URL || "").trim();
const FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY = String(process.env.FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY || "false").trim() === "true";

const helperLinks = [
  { href: "/admin/channels", label: "FlowAPI 渠道管理", desc: "管理主中转站自己的上游渠道与余额。"},
  { href: "/admin/newapi-passthrough", label: "FlowAPI 直通白名单", desc: "仅用于迁移和调试，不作为默认入口。" },
  { href: "/admin/logs", label: "FlowAPI 调用日志", desc: "查看主中转站自己的请求与错误日志。" },
];

export default function AdminNewApiPage() {
  const [health, setHealth] = useState(null);
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/newapi/health");
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: "error", message: "无法连接 New API 原生后台" });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void testConnection();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <Head><title>New API 原生后台 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/new-api">
        <main className="admin-raw-admin-page">
          <header className="admin-raw-admin-card">
            <span>NEW API</span>
            <h1>New API 原生后台</h1>
            <p>当前系统只保留 New API 原生后台的跳转说明。FlowAPI 不接管 New API 的原生配置。</p>
          </header>

          <section className="admin-raw-admin-grid">
            <article className="admin-raw-admin-card">
              <h2>打开 New API 原生后台</h2>
              <p>{NEW_API_ADMIN_URL ? `已配置：${NEW_API_ADMIN_URL}` : "未配置 New API 原生后台地址。"}</p>
              {NEW_API_ADMIN_URL ? (
                <a href={NEW_API_ADMIN_URL} target="_blank" rel="noopener noreferrer">打开原生后台</a>
              ) : (
                <div className="admin-raw-admin-empty">
                  <strong>New API 原生后台未配置</strong>
                  <p>请先在 `.env` 中设置 `NEW_API_ADMIN_URL=`，再单独部署 New API 的管理网页。</p>
                </div>
              )}
            </article>

            <article className="admin-raw-admin-card">
              <h2>代理模式说明</h2>
              <p>默认优先打开 New API 自己的后台。只有 `FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY=true` 时，才会允许代理入口参与。</p>
              <pre>{`FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY=${FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY ? "true" : "false"}`}</pre>
            </article>
          </section>

          <section className="admin-raw-admin-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginTop: 0 }}>连接测试</h2>
                <p style={{ marginBottom: 0 }}>这个测试只检查原生后台是否可达，不会接管配置。</p>
              </div>
              <button type="button" onClick={testConnection} disabled={testing}>
                {testing ? "检测中..." : "测试连接"}
              </button>
            </div>
            {health ? (
              <pre style={{ marginTop: 12 }}>{JSON.stringify(health, null, 2)}</pre>
            ) : null}
          </section>

          <section className="admin-raw-admin-links">
            {helperLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </Link>
            ))}
          </section>

          {FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY ? (
            <section className="admin-raw-admin-card">
              <h2>可选代理入口</h2>
              <p>仅在显式开启时可用：<code>/newapi-admin</code>。默认不推荐把它当成主入口。</p>
            </section>
          ) : null}
        </main>
      </AdminLayout>
      <style jsx>{`
        .admin-raw-admin-page {
          display: grid;
          gap: 16px;
          color: var(--dash-text);
        }
        .admin-raw-admin-card,
        .admin-raw-admin-links a {
          border: 1px solid var(--dash-border);
          border-radius: 14px;
          background: var(--dash-card-bg);
          padding: 18px 20px;
        }
        header.admin-raw-admin-card span {
          color: var(--dash-accent);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }
        header.admin-raw-admin-card h1,
        .admin-raw-admin-card h2 {
          margin: 8px 0 0;
          font-size: 28px;
          font-weight: 950;
        }
        .admin-raw-admin-card p,
        .admin-raw-admin-empty p,
        .admin-raw-admin-links span {
          margin: 8px 0 0;
          color: var(--dash-sub);
          line-height: 1.7;
          font-size: 13px;
        }
        .admin-raw-admin-card a,
        .admin-raw-admin-card button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: #fff;
          font-weight: 800;
          text-decoration: none;
          border: 0;
          cursor: pointer;
        }
        .admin-raw-admin-card button:disabled {
          opacity: 0.72;
          cursor: progress;
        }
        .admin-raw-admin-empty {
          margin-top: 12px;
          padding: 14px;
          border-radius: 12px;
          background: rgba(99, 102, 241, 0.08);
        }
        .admin-raw-admin-empty strong {
          display: block;
          font-size: 14px;
          font-weight: 900;
        }
        .admin-raw-admin-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .admin-raw-admin-links {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .admin-raw-admin-links a {
          text-decoration: none;
          color: inherit;
        }
        .admin-raw-admin-links strong {
          display: block;
          font-size: 15px;
          font-weight: 900;
        }
        pre {
          margin: 12px 0 0;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(2, 6, 23, 0.55);
          color: #bfdbfe;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
        code {
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.8);
          padding: 2px 6px;
          border-radius: 6px;
        }
        @media (max-width: 900px) {
          .admin-raw-admin-grid,
          .admin-raw-admin-links {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
