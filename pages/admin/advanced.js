import Head from "next/head";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

const SUB2API_ADMIN_URL = String(process.env.SUB2API_ADMIN_URL || "").trim();
const NEW_API_ADMIN_URL = String(process.env.NEW_API_ADMIN_URL || "").trim();

const links = [
  { label: "New API 说明页", href: "/admin/new-api", desc: "打开 New API 原生后台或查看原生后台地址。" },
  { label: "API 分组管理", href: "/admin/groups", desc: "控制不同模型走哪个上游分组。" },
  { label: "Token 直通白名单", href: "/admin/newapi-passthrough", desc: "高风险入口，只给调试和迁移使用。" },
  { label: "导入 New API Token", href: "/admin/api-keys/import-newapi-token", desc: "把外部 token 导入管理。" },
  { label: "全局转发规则", href: "/admin/routing", desc: "调整模型路由策略和故障切换。" },
  { label: "限流规则", href: "/admin/rate-limits", desc: "控制请求频率、并发和风控。" },
  { label: "请求缓存", href: "/admin/request-cache", desc: "控制团队重复请求缓存。" },
  { label: "维护任务中心", href: "/admin/maintenance-tasks", desc: "执行维护脚本和检查任务。" },
  { label: "sub2api 说明页", href: "/admin/token-pool", desc: "打开 sub2api 原生后台或查看地址说明。" },
];

const upstreamAdminLinks = [
  {
    label: "sub2api 后台",
    href: SUB2API_ADMIN_URL,
    desc: SUB2API_ADMIN_URL ? "打开 sub2api 的管理后台地址。" : "未配置后台地址。",
  },
  {
    label: "New API 后台",
    href: NEW_API_ADMIN_URL,
    desc: NEW_API_ADMIN_URL ? "打开 New API 的管理后台地址。" : "未配置后台地址。",
  },
];

export default function AdvancedAdminPage() {
  return (
    <>
      <Head><title>高级技术入口 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/advanced">
        <main className="advanced-admin-page">
          <header>
            <span>ADVANCED</span>
            <h1>高级技术入口</h1>
            <p>这里是会影响路由、风控、直通和维护任务的技术入口。原生后台入口只负责跳转，不接管 sub2api / New API 的配置。</p>
          </header>
          <section>
            {upstreamAdminLinks.map((item) => (
              item.href ? (
                <a key={item.label} href={item.href} target="_blank" rel="noreferrer">
                  <strong>{item.label}</strong>
                  <span>{item.desc}</span>
                </a>
              ) : (
                <div key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.desc}</span>
                </div>
              )
            ))}
          </section>
          <section>
            <div>
              <strong>代理模式</strong>
              <span>New API 代理入口默认关闭，只有 `FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY=true` 才启用。</span>
            </div>
            <div>
              <strong>地址口径</strong>
              <span>SUB2API_ADMIN_URL / NEW_API_ADMIN_URL 只填写后台网页地址，不要填 `/v1`。</span>
            </div>
            <div>
              <strong>本机状态</strong>
              <span>如果没有真正独立的 sub2api / New API 服务，这里只会显示跳转说明。</span>
            </div>
          </section>
          <section>
            {links.map((item) => (
              <Link key={item.href} href={item.href}>
                <strong>{item.label}</strong>
                <span>{item.desc}</span>
              </Link>
            ))}
          </section>
        </main>
      </AdminLayout>
      <style jsx>{`
        .advanced-admin-page { color: var(--dash-text); display: grid; gap: 16px; }
        header, a, section > div { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; }
        header { padding: 22px; }
        header span { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        h1 { margin: 6px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        header p { max-width: 760px; margin: 8px 0 0; color: var(--dash-sub); line-height: 1.7; font-size: 13px; }
        section { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        a, section > div { padding: 16px; text-decoration: none; color: var(--dash-text); display: grid; gap: 8px; }
        a strong { font-size: 15px; font-weight: 950; }
        a span, section > div span { color: var(--dash-sub); font-size: 12px; line-height: 1.6; }
        @media (max-width: 900px) { section { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
