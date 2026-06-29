import Head from "next/head";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

const workflows = [
  {
    title: "新增一个可售卖模型",
    goal: "把上游模型变成 FlowAPI 用户能购买、能创建 Key、能扣费的商品。",
    steps: ["打开模型接入向导", "填写上游 Base URL 和 Key", "测试连接", "拉取模型", "选择要卖的模型", "设置成本和售价", "发布到模型广场"],
    href: "/admin/model-wizard",
  },
  {
    title: "开通生成图片模型",
    goal: "让用户打开 /images 就能直接生成图片并扣费。",
    steps: ["打开图片模型", "点一键启用默认图片模型", "确认每张图售价大于 0", "去前台 /images 测试出图"],
    href: "/admin/image-models",
  },
  {
    title: "检查模型为什么 403",
    goal: "判断是 Key 权限、模型未开放、上游失败，还是余额不足。",
    steps: ["打开模型测试", "确认模型显示可用", "点击健康检查", "查看 actual model id", "再去调用日志查 request id"],
    href: "/admin/models",
  },
  {
    title: "改前台展示内容",
    goal: "修改首页、帮助、模型说明、公告等用户能看到的文字。",
    steps: ["打开前后台对应", "找到前台页面", "进入对应后台", "保存后刷新前台检查"],
    href: "/admin/content-map",
  },
  {
    title: "检查能不能商业化上线",
    goal: "上线前一键检查注册、充值、API Key、模型、扣费、日志、上游状态。",
    steps: ["打开商业闭环检查", "确认已登录管理员账号", "点击一键检查", "先处理红色异常，再处理黄色待确认"],
    href: "/admin/commercial-health",
  },
];

export default function OperatorGuidePage() {
  return (
    <>
      <Head><title>老板操作指南 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/operator-guide">
        <main className="operator-guide-page">
          <header className="operator-guide-hero">
            <span>OWNER GUIDE</span>
            <h1>老板操作指南</h1>
            <p>你不需要理解 New API、actual model id、分组这些技术词。按下面的业务动作点就行：新增模型、查 403、改前台、上线前检查。</p>
          </header>

          <section className="operator-guide-grid">
            {workflows.map((item) => (
              <article key={item.title}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.goal}</p>
                </div>
                <ol>
                  {item.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <Link href={item.href}>去操作</Link>
              </article>
            ))}
          </section>
        </main>
      </AdminLayout>
      <style jsx>{`
        .operator-guide-page { color: var(--dash-text); display: grid; gap: 16px; }
        .operator-guide-hero { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; padding: 22px; }
        .operator-guide-hero span { color: var(--dash-accent); font-size: 11px; font-weight: 900; letter-spacing: .08em; }
        .operator-guide-hero h1 { margin: 6px 0 0; font-size: 28px; font-weight: 950; letter-spacing: 0; }
        .operator-guide-hero p { max-width: 760px; margin: 8px 0 0; color: var(--dash-sub); line-height: 1.7; font-size: 13px; }
        .operator-guide-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        article { border: 1px solid var(--dash-border); background: var(--dash-card-bg); border-radius: 14px; padding: 18px; display: grid; gap: 14px; }
        article strong { font-size: 17px; font-weight: 950; }
        article p { margin: 7px 0 0; color: var(--dash-sub); font-size: 13px; line-height: 1.6; }
        ol { margin: 0; padding-left: 20px; color: var(--dash-sub); font-size: 13px; line-height: 1.8; }
        a { width: max-content; min-height: 38px; display: inline-flex; align-items: center; border-radius: 10px; padding: 0 13px; background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; text-decoration: none; font-size: 12px; font-weight: 900; }
        @media (max-width: 900px) { .operator-guide-grid { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
