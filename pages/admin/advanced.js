import Head from "next/head";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

const links = [
  { label: "New API 管理", href: "/admin/new-api", desc: "内部中转层配置，普通运营不要频繁修改。" },
  { label: "API 分组管理", href: "/admin/groups", desc: "控制不同模型走哪个上游分组。" },
  { label: "Token 直通白名单", href: "/admin/newapi-passthrough", desc: "高风险入口，只给调试和迁移使用。" },
  { label: "导入 New API Token", href: "/admin/api-keys/import-newapi-token", desc: "把外部 token 导入管理。" },
  { label: "限流规则", href: "/admin/rate-limits", desc: "控制请求频率、并发和风控。" },
  { label: "请求缓存", href: "/admin/request-cache", desc: "控制团队重复请求缓存。" },
  { label: "维护任务中心", href: "/admin/maintenance-tasks", desc: "执行维护脚本和检查任务。" },
  { label: "团队 Token 池", href: "/admin/token-pool", desc: "管理团队共享 token 池。" },
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
            <p>这里是会影响路由、风控、直通和维护任务的技术入口。日常运营优先使用左侧 8 个老板菜单。</p>
          </header>
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
        header, a { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; }
        header { padding: 22px; }
        header span { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        h1 { margin: 6px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        header p { max-width: 760px; margin: 8px 0 0; color: var(--dash-sub); line-height: 1.7; font-size: 13px; }
        section { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        a { padding: 16px; text-decoration: none; color: var(--dash-text); display: grid; gap: 8px; }
        a strong { font-size: 15px; font-weight: 950; }
        a span { color: var(--dash-sub); font-size: 12px; line-height: 1.6; }
        @media (max-width: 900px) { section { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
