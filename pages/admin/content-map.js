import Head from "next/head";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

const rows = [
  { front: "首页横幅、卖点、客服入口", admin: "前台内容", href: "/admin/content", note: "改完会影响 flowapi.fun 首页和帮助入口。" },
  { front: "模型广场卡片、价格、按钮", admin: "模型广场", href: "/admin/model-market", note: "用户看到的模型名称、标签、价格来自这里。" },
  { front: "API Key 可选模型", admin: "模型测试", href: "/admin/models", note: "只有健康检查通过、标记可用的模型才建议开放。" },
  { front: "生成图片模型", admin: "图片模型管理", href: "/admin/image-models", note: "影响 /images 里的图片模型选择和价格。" },
  { front: "充值审核和订单", admin: "充值审核", href: "/admin/recharges", note: "影响用户余额到账和财务记录。" },
  { front: "系统公告弹窗", admin: "系统公告", href: "/admin/announcements", note: "影响用户打开网站时看到的通知。" },
  { front: "会员套餐权益", admin: "套餐会员", href: "/admin/plans", note: "影响会员价格、每日权益和专属模型入口。" },
  { front: "调用失败、扣费争议", admin: "调用日志", href: "/admin/logs", note: "用 request id 查用户每一次调用。" },
];

export default function ContentMapPage() {
  return (
    <>
      <Head><title>前后台对应关系 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/content-map">
        <main className="content-map-page">
          <header>
            <span>CONTENT MAP</span>
            <h1>前后台对应关系</h1>
            <p>不知道改哪里时，先来这里。左边是用户前台看到的东西，右边是你后台应该点击的位置。</p>
          </header>
          <section>
            {rows.map((row) => (
              <article key={row.front}>
                <div>
                  <span>前台</span>
                  <strong>{row.front}</strong>
                </div>
                <div>
                  <span>后台</span>
                  <Link href={row.href}>{row.admin}</Link>
                </div>
                <p>{row.note}</p>
              </article>
            ))}
          </section>
        </main>
      </AdminLayout>
      <style jsx>{`
        .content-map-page { color: var(--dash-text); display: grid; gap: 16px; }
        header { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; padding: 22px; }
        header span { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        h1 { margin: 6px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        header p { max-width: 760px; margin: 8px 0 0; color: var(--dash-sub); line-height: 1.7; font-size: 13px; }
        section { display: grid; gap: 10px; }
        article { display: grid; grid-template-columns: 1.1fr .9fr 1.5fr; gap: 14px; align-items: center; border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 12px; padding: 15px; }
        article span { display: block; margin-bottom: 5px; color: var(--dash-sub); font-size: 11px; font-weight: 900; }
        article strong { font-size: 14px; font-weight: 900; }
        article a { color: var(--dash-accent); font-size: 14px; font-weight: 900; text-decoration: none; }
        article p { margin: 0; color: var(--dash-sub); font-size: 13px; line-height: 1.55; }
        @media (max-width: 900px) { article { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
