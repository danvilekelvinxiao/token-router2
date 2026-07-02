import Head from "next/head";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

const SUB2API_ADMIN_URL = String(process.env.SUB2API_ADMIN_URL || "").trim();

const helperLinks = [
  { href: "/admin/token-pool/status", label: "FlowAPI Token 状态页", desc: "查看当前仓库内的 token 池状态监控。" },
  { href: "/admin/token-pool/maintenance", label: "FlowAPI Token 维护页", desc: "执行巡检、批量测试和故障排查。" },
  { href: "/admin/upstreams", label: "FlowAPI 上游渠道", desc: "管理主中转站自己的上游渠道与优先级。" },
];

export default function AdminTokenPoolPage() {
  return (
    <>
      <Head><title>sub2api 原生后台 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/token-pool">
        <main className="admin-raw-admin-page">
          <header className="admin-raw-admin-card">
            <span>SUB2API</span>
            <h1>sub2api 原生后台</h1>
            <p>当前系统只保留 sub2api 原生后台的跳转说明。FlowAPI 不接管 sub2api 的原生配置。</p>
          </header>

          <section className="admin-raw-admin-grid">
            <article className="admin-raw-admin-card">
              <h2>打开 sub2api 原生后台</h2>
              <p>{SUB2API_ADMIN_URL ? `已配置：${SUB2API_ADMIN_URL}` : "未配置 sub2api 原生后台地址。"}</p>
              {SUB2API_ADMIN_URL ? (
                <a href={SUB2API_ADMIN_URL} target="_blank" rel="noopener noreferrer">打开原生后台</a>
              ) : (
                <div className="admin-raw-admin-empty">
                  <strong>sub2api 原生后台未配置</strong>
                  <p>请先在 `.env` 中设置 `SUB2API_ADMIN_URL=`，再单独部署 sub2api 的管理网页。</p>
                </div>
              )}
            </article>

            <article className="admin-raw-admin-card">
              <h2>环境变量说明</h2>
              <p>SUB2API_ADMIN_URL 只填写后台网页地址，不要填 `/v1`、`/v1/responses`、`/v1/chat/completions` 这类 API Base URL。</p>
              <pre>SUB2API_ADMIN_URL=http://127.0.0.1:8081</pre>
            </article>
          </section>

          <section className="admin-raw-admin-links">
            {helperLinks.map((item) => (
              <Link key={item.href} href={item.href}>
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </Link>
            ))}
          </section>
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
        .admin-raw-admin-card a {
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
