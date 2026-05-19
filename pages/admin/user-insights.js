export const dynamic = "force-dynamic";
import Head from "next/head";
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";

/* ===================================================================
   MOCK DATA
   =================================================================== */

const MOCK_OVERVIEW = [
  { label: "总用户数", value: "1,284", change: "+12%", up: true },
  { label: "付费用户", value: "386", change: "+8%", up: true },
  { label: "复购用户", value: "142", change: "+15%", up: true },
  { label: "高价值用户", value: "48", change: "+5%", up: true },
  { label: "愿意加微信", value: "203", change: "+22%", up: true },
  { label: "企业/工作室", value: "31", change: "+3%", up: true },
];

const MOCK_HIGH_VALUE_USERS = [
  { id: "u1", name: "Zhang Wei", email: "zhang@devstudio.cn", type: "工作室", totalRecharge: 1250, calls7d: 842, repurchase30d: 4, apiKeys: 5, score: 98, tags: ["高价值", "复购", "愿意加微信"], lastActive: "2026-05-19 14:22" },
  { id: "u2", name: "陈敏", email: "chenmin@ai-startup.com", type: "企业", totalRecharge: 3200, calls7d: 1204, repurchase30d: 6, apiKeys: 8, score: 99, tags: ["高价值", "企业客户", "DeepSeek 重度"], lastActive: "2026-05-19 15:01" },
  { id: "u3", name: "Li Ming", email: "liming@demo.com", type: "开发者", totalRecharge: 520, calls7d: 680, repurchase30d: 2, apiKeys: 3, score: 87, tags: ["高价值", "复购", "Claude Code 用户"], lastActive: "2026-05-19 13:45" },
  { id: "u4", name: "王芳", email: "wangfang@edu-ai.cn", type: "企业", totalRecharge: 850, calls7d: 320, repurchase30d: 1, apiKeys: 2, score: 72, tags: ["企业客户", "价格敏感"], lastActive: "2026-05-19 11:30" },
];

const MOCK_USER_PROFILES = [
  { id: "up1", user: "Zhang Wei", source: "搜索引擎", product: "按量充值", amount: "¥500/月", purpose: "Cursor 编程", repurchase: true, wantWechat: true, type: "工作室", totalRecharge: 1250, totalSpend: 980, lastActive: "2026-05-19", ip: "北京", sourcePage: "首页 → 注册 → API 管理", score: 98 },
  { id: "up2", user: "陈敏", source: "知乎文章", product: "月卡套餐", amount: "¥200/月", purpose: "AI 客服", repurchase: true, wantWechat: true, type: "企业", totalRecharge: 3200, totalSpend: 2850, lastActive: "2026-05-19", ip: "深圳", sourcePage: "知乎 → 首页 → 注册", score: 99 },
  { id: "up3", user: "Li Ming", source: "GitHub", product: "按量充值", amount: "¥100/月", purpose: "代码辅助", repurchase: true, wantWechat: false, type: "开发者", totalRecharge: 520, totalSpend: 410, lastActive: "2026-05-19", ip: "上海", sourcePage: "GitHub → 首页 → 注册", score: 87 },
  { id: "up4", user: "王芳", source: "百度搜索", product: "按量充值", amount: "¥200/月", purpose: "教育内容", repurchase: false, wantWechat: true, type: "企业", totalRecharge: 850, totalSpend: 620, lastActive: "2026-05-19", ip: "广州", sourcePage: "百度 → 首页 → 模型广场", score: 72 },
  { id: "up5", user: "赵六", source: "微信群", product: "周畅用包", amount: "¥50/周", purpose: "文案写作", repurchase: true, wantWechat: true, type: "个人", totalRecharge: 200, totalSpend: 180, lastActive: "2026-05-18", ip: "杭州", sourcePage: "微信群 → 首页 → 注册", score: 65 },
  { id: "up6", user: "Test Bot", source: "直接访问", product: "未购买", amount: "¥0", purpose: "API 测试", repurchase: false, wantWechat: false, type: "开发者", totalRecharge: 0, totalSpend: 24.8, lastActive: "2026-05-19", ip: "美国", sourcePage: "直接访问", score: 12 },
  { id: "up7", user: "孙七", source: "B站视频", product: "按量充值", amount: "¥300/月", purpose: "视频脚本", repurchase: true, wantWechat: false, type: "个人", totalRecharge: 600, totalSpend: 450, lastActive: "2026-05-19", ip: "成都", sourcePage: "B站 → 首页 → 注册", score: 78 },
  { id: "up8", user: "周八", source: "知乎文章", product: "未购买", amount: "¥0", purpose: "浏览了解", repurchase: false, wantWechat: false, type: "AI 小白", totalRecharge: 0, totalSpend: 0, lastActive: "2026-05-17", ip: "武汉", sourcePage: "知乎 → 首页 → 离开", score: 8 },
];

const MOCK_PAGE_STATS = [
  { page: "API 管理", avgStay: "8m 42s", visits: 3420, bounceRate: "12%", clickRate: "68%", topAction: "创建 API Key" },
  { page: "模型广场", avgStay: "4m 15s", visits: 2850, bounceRate: "28%", clickRate: "52%", topAction: "复制模型 ID" },
  { page: "数据面板", avgStay: "6m 30s", visits: 2100, bounceRate: "18%", clickRate: "45%", topAction: "查看消耗趋势" },
  { page: "充值页", avgStay: "3m 50s", visits: 1800, bounceRate: "35%", clickRate: "38%", topAction: "选择 ¥100 面额" },
  { page: "帮助指南", avgStay: "5m 10s", visits: 1500, bounceRate: "22%", clickRate: "32%", topAction: "复制 CURL 示例" },
  { page: "首页", avgStay: "2m 20s", visits: 5200, bounceRate: "42%", clickRate: "28%", topAction: "点击注册按钮" },
];

const MOCK_CLICK_STATS = [
  { element: "注册按钮", clicks: 2890, rate: "55%", page: "首页", leadsTo: "注册页面" },
  { element: "创建 API Key", clicks: 2100, rate: "62%", page: "API 管理", leadsTo: "API Key 列表" },
  { element: "复制模型 ID", clicks: 1850, rate: "65%", page: "模型广场", leadsTo: "接入配置" },
  { element: "选择 ¥100", clicks: 980, rate: "54%", page: "充值页", leadsTo: "支付页面" },
  { element: "加入 QQ 群", clicks: 420, rate: "8%", page: "首页", leadsTo: "QQ 群链接" },
  { element: "复制 CURL", clicks: 1680, rate: "75%", page: "帮助指南", leadsTo: "本地测试" },
  { element: "导出数据", clicks: 340, rate: "16%", page: "数据面板", leadsTo: "下载 Excel" },
];

const MOCK_FUNNEL = [
  { step: "访问首页", count: 5200, rate: "100%" },
  { step: "注册账号", count: 1284, rate: "24.7%" },
  { step: "进入 API 管理", count: 890, rate: "17.1%" },
  { step: "创建 API Key", count: 720, rate: "13.8%" },
  { step: "完成首次调用", count: 580, rate: "11.2%" },
  { step: "进入充值页", count: 420, rate: "8.1%" },
  { step: "完成充值", count: 386, rate: "7.4%" },
  { step: "复购", count: 142, rate: "2.7%" },
];

const MOCK_SOURCES = [
  { channel: "搜索引擎", users: 420, payRate: "28%", avgRecharge: 280, highValueRate: "4.2%" },
  { channel: "知乎文章", users: 310, payRate: "35%", avgRecharge: 420, highValueRate: "6.8%" },
  { channel: "GitHub", users: 180, payRate: "42%", avgRecharge: 350, highValueRate: "8.3%" },
  { channel: "微信群", users: 150, payRate: "22%", avgRecharge: 180, highValueRate: "3.1%" },
  { channel: "B站视频", users: 120, payRate: "18%", avgRecharge: 200, highValueRate: "2.5%" },
  { channel: "直接访问", users: 104, payRate: "8%", avgRecharge: 50, highValueRate: "0.8%" },
];

const MOCK_REGIONS = [
  { region: "北京", users: 280, payRate: "32%", topSource: "搜索引擎" },
  { region: "深圳", users: 245, payRate: "38%", topSource: "知乎文章" },
  { region: "上海", users: 210, payRate: "35%", topSource: "GitHub" },
  { region: "广州", users: 165, payRate: "25%", topSource: "百度搜索" },
  { region: "杭州", users: 140, payRate: "28%", topSource: "微信群" },
  { region: "成都", users: 95, payRate: "20%", topSource: "B站视频" },
];

const MOCK_SEGMENTS = [
  { name: "高价值工作室", count: 18, description: "累计充值 ≥ ¥500，API Key ≥ 3 个，主要用 Cursor/Claude Code", action: "推荐企业额度包 + 一对一微信服务" },
  { name: "价格敏感用户", count: 86, description: "只看低价模型，多次访问充值页但未付款", action: "推送首充优惠或使用免费模型引导" },
  { name: "接入卡住用户", count: 42, description: "注册后未创建 API Key，停留在帮助指南", action: "引导至帮助指南或 QQ 群获取技术支持" },
];

const MOCK_FOLLOW_UPS = [
  { id: "fu1", user: "Zhang Wei", date: "2026-05-18", action: "已添加微信", note: "沟通了企业额度方案，对方表示下周确认团队人数", handler: "管理员" },
  { id: "fu2", user: "王芳", date: "2026-05-17", action: "发送首充优惠", note: "用户对教育场景感兴趣，推荐了 DeepSeek 低价模型", handler: "管理员" },
  { id: "fu3", user: "赵六", date: "2026-05-16", action: "引导 QQ 群", note: "帮助解决了 CC-Switch 配置问题，成功接入", handler: "管理员" },
];

const USER_TYPES = ["全部类型", "开发者", "工作室", "企业", "个人", "AI 小白"];
const SOURCES = ["全部来源", "搜索引擎", "知乎文章", "GitHub", "微信群", "B站视频", "直接访问"];

/* ===================================================================
   COMPONENTS
   =================================================================== */

function StatCard({ label, value, change, up }) {
  return (
    <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dash-sub)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'SF Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: up ? "var(--dash-green)" : "var(--dash-red)" }}>{change} {up ? "↑" : "↓"}</div>
    </div>
  );
}

const thS = { textAlign: "left", fontSize: 10, fontWeight: 600, color: "var(--dash-sub)", padding: "12px 14px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const tdS = { padding: "11px 14px", fontSize: 13, verticalAlign: "middle" };

function YesNo({ v }) { return <span style={{ color: v ? "var(--dash-green)" : "var(--dash-sub)" }}>{v ? "是" : "否"}</span>; }

function ScoreBadge({ score }) {
  const c = score >= 90 ? "#22c55e" : score >= 70 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  return <span style={{ padding: "3px 10px", borderRadius: 999, background: c + "18", color: c, fontSize: 11, fontWeight: 700, fontFamily: "'SF Mono', monospace" }}>{score}</span>;
}

function Tag({ label, color = "#6366f1" }) {
  return <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: color + "18", color, marginRight: 4 }}>{label}</span>;
}

/* ===================================================================
   MAIN PAGE
   =================================================================== */

export default function UserInsightsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部类型");
  const [sourceFilter, setSourceFilter] = useState("全部来源");
  const [repurchaseFilter, setRepurchaseFilter] = useState("");
  const [wechatFilter, setWechatFilter] = useState("");
  const [detailUser, setDetailUser] = useState(null);
  const [followUpText, setFollowUpText] = useState("");
  const [followUps, setFollowUps] = useState(MOCK_FOLLOW_UPS);

  const filteredUsers = MOCK_USER_PROFILES.filter((u) => {
    if (search && !u.user.includes(search) && !u.purpose.includes(search)) return false;
    if (typeFilter !== "全部类型" && u.type !== typeFilter) return false;
    if (sourceFilter !== "全部来源" && u.source !== sourceFilter) return false;
    if (repurchaseFilter === "yes" && !u.repurchase) return false;
    if (repurchaseFilter === "no" && u.repurchase) return false;
    if (wechatFilter === "yes" && !u.wantWechat) return false;
    if (wechatFilter === "no" && u.wantWechat) return false;
    return true;
  });

  function addFollowUp() {
    if (!detailUser || !followUpText.trim()) return;
    setFollowUps((prev) => [{ id: "fu" + Date.now(), user: detailUser.user, date: new Date().toISOString().slice(0, 10), action: "跟进记录", note: followUpText.trim(), handler: "管理员" }, ...prev]);
    setFollowUpText("");
  }

  return (
    <>
      <Head><title>用户画像分析 - FlowAPI</title></Head>
      <AdminLayout currentPath="/admin/user-insights">
        <div style={{ color: "var(--dash-text)" }}>

          {/* Header */}
          <header style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>用户画像分析</h1>
            <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>识别高价值用户，分析来源渠道、行为路径和转化漏斗</p>
          </header>

          {/* ===== 1. Overview Cards ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 24 }}>
            {MOCK_OVERVIEW.map((s) => <StatCard key={s.label} {...s} />)}
          </div>

          {/* ===== 2. High-Value Users ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>高价值用户识别</h2>
              <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "0 0 14px" }}>综合充值、调用、复购、停留等维度自动评分</p>
              <div style={{ display: "grid", gap: 10 }}>
                {MOCK_HIGH_VALUE_USERS.map((u) => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--dash-border)", cursor: "pointer" }} onClick={() => setDetailUser(u)}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{u.name} <span style={{ fontSize: 11, color: "var(--dash-sub)", fontWeight: 500 }}>{u.email}</span></div>
                      <div>{u.tags.map((t, i) => <Tag key={i} label={t} color={t === "高价值" ? "#22c55e" : t === "企业客户" ? "#3b82f6" : "#6366f1"} />)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontFamily: "'SF Mono', monospace", fontWeight: 600 }}>¥{u.totalRecharge}</div>
                        <div style={{ fontSize: 11, color: "var(--dash-sub)" }}>{u.calls7d} 次/7天</div>
                      </div>
                      <ScoreBadge score={u.score} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scoring Rules */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 14px" }}>高价值评分规则</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { rule: "累计充值 ≥ ¥500", weight: "+25 分" },
                  { rule: "近 7 天调用 ≥ 500 次", weight: "+20 分" },
                  { rule: "近 30 天复购 ≥ 2 次", weight: "+20 分" },
                  { rule: "停留 API 管理页 > 5 分钟", weight: "+10 分" },
                  { rule: "多次访问充值页但未付款", weight: "+5 分" },
                  { rule: "点击过加微信/QQ 群", weight: "+10 分" },
                  { rule: "用户类型为工作室/企业", weight: "+10 分" },
                  { rule: "API Key ≥ 3 个", weight: "+5 分" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--dash-border)" }}>
                    <span style={{ fontSize: 13 }}>{r.rule}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'SF Mono', monospace", color: "var(--dash-accent)" }}>{r.weight}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== 3. User Profile Table ===== */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--dash-border)" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 12px" }}>用户画像表</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="搜索用户或用途..." value={search} onChange={(e) => setSearch(e.target.value)} style={inputS} />
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectS}>
                  {USER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={selectS}>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={repurchaseFilter} onChange={(e) => setRepurchaseFilter(e.target.value)} style={selectS}>
                  <option value="">是否复购</option><option value="yes">已复购</option><option value="no">未复购</option>
                </select>
                <select value={wechatFilter} onChange={(e) => setWechatFilter(e.target.value)} style={selectS}>
                  <option value="">是否加微信</option><option value="yes">愿意</option><option value="no">不愿意</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
                <thead><tr style={{ background: "var(--dash-card-hover)" }}><th style={thS}>用户</th><th style={thS}>来源</th><th style={thS}>产品</th><th style={thS}>额度</th><th style={thS}>用途</th><th style={thS}>复购</th><th style={thS}>加微信</th><th style={thS}>类型</th><th style={thS}>累计充值</th><th style={thS}>累计消耗</th><th style={thS}>最近活跃</th><th style={thS}>IP</th><th style={thS}>评分</th><th style={thS}>操作</th></tr></thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={tdS}><b>{u.user}</b></td>
                      <td style={tdS}>{u.source}</td>
                      <td style={tdS}>{u.product}</td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{u.amount}</td>
                      <td style={tdS}>{u.purpose}</td>
                      <td style={tdS}><YesNo v={u.repurchase} /></td>
                      <td style={tdS}><YesNo v={u.wantWechat} /></td>
                      <td style={tdS}><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "var(--dash-accent)" + "18", color: "var(--dash-accent)" }}>{u.type}</span></td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{u.totalRecharge}</td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{u.totalSpend}</td>
                      <td style={{ ...tdS, color: "var(--dash-sub)", fontSize: 12 }}>{u.lastActive}</td>
                      <td style={tdS}>{u.ip}</td>
                      <td style={tdS}><ScoreBadge score={u.score} /></td>
                      <td style={tdS}><button onClick={() => setDetailUser(u)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--dash-accent)", background: "transparent", color: "var(--dash-accent)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>详情</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--dash-border)", fontSize: 12, color: "var(--dash-sub)" }}>共 {filteredUsers.length} 条记录</div>
          </div>

          {/* ===== 4 & 5: Behavior + Funnel ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Page Stay Stats */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>页面停留时长排行</h2>
              <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "0 0 14px" }}>用户在各页面平均停留时间和点击率</p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={thS}>页面</th><th style={thS}>平均停留</th><th style={thS}>访问量</th><th style={thS}>跳出率</th><th style={thS}>点击率</th></tr></thead>
                <tbody>
                  {MOCK_PAGE_STATS.map((p) => (
                    <tr key={p.page} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={tdS}><b>{p.page}</b></td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace", color: "var(--dash-accent)", fontWeight: 600 }}>{p.avgStay}</td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{p.visits.toLocaleString()}</td>
                      <td style={tdS}>{p.bounceRate}</td>
                      <td style={{ ...tdS, color: "var(--dash-green)", fontWeight: 700 }}>{p.clickRate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Conversion Funnel */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>转化漏斗分析</h2>
              <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "0 0 14px" }}>从访问到复购的每一步转化</p>
              <div style={{ display: "grid", gap: 6 }}>
                {MOCK_FUNNEL.map((f, i) => {
                  const maxCount = MOCK_FUNNEL[0].count;
                  const w = (f.count / maxCount) * 100;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 100, fontSize: 12, fontWeight: 600, textAlign: "right", flexShrink: 0 }}>{f.step}</span>
                      <div style={{ flex: 1, height: 28, background: "var(--dash-border)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                        <div style={{ height: "100%", width: w + "%", background: i <= 3 ? "linear-gradient(90deg, #6366f1, #8b5cf6)" : i <= 6 ? "linear-gradient(90deg, #8b5cf6, #a78bfa)" : "linear-gradient(90deg, #f59e0b, #f97316)", borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 10 }} />
                      </div>
                      <span style={{ width: 80, fontSize: 12, fontFamily: "'SF Mono', monospace", fontWeight: 700, textAlign: "right", flexShrink: 0 }}>{f.count.toLocaleString()}</span>
                      <span style={{ width: 50, fontSize: 11, color: "var(--dash-sub)", textAlign: "right", flexShrink: 0 }}>{f.rate}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Click Stats + Funnel details */}
          <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px", marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>点击率排行榜</h2>
            <p style={{ fontSize: 12, color: "var(--dash-sub)", margin: "0 0 14px" }}>哪些按钮/元素点击率最高，点击后去了哪里</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={thS}>元素</th><th style={thS}>点击次数</th><th style={thS}>点击率</th><th style={thS}>所在页面</th><th style={thS}>去向</th></tr></thead>
              <tbody>
                {MOCK_CLICK_STATS.map((c) => (
                  <tr key={c.element} style={{ borderTop: "1px solid var(--dash-border)" }}>
                    <td style={tdS}><b>{c.element}</b></td>
                    <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{c.clicks.toLocaleString()}</td>
                    <td style={{ ...tdS, color: "var(--dash-green)", fontWeight: 700 }}>{c.rate}</td>
                    <td style={tdS}>{c.page}</td>
                    <td style={tdS}>{c.leadsTo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== 6. Source & Region ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 14px" }}>来源渠道分析</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={thS}>渠道</th><th style={thS}>用户数</th><th style={thS}>付费率</th><th style={thS}>平均充值</th><th style={thS}>高价值率</th></tr></thead>
                <tbody>
                  {MOCK_SOURCES.map((s) => (
                    <tr key={s.channel} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={tdS}><b>{s.channel}</b></td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{s.users}</td>
                      <td style={{ ...tdS, color: "var(--dash-green)", fontWeight: 700 }}>{s.payRate}</td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>¥{s.avgRecharge}</td>
                      <td style={tdS}>{s.highValueRate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 14px" }}>地区分析</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={thS}>地区</th><th style={thS}>用户数</th><th style={thS}>付费率</th><th style={thS}>主要来源</th></tr></thead>
                <tbody>
                  {MOCK_REGIONS.map((r) => (
                    <tr key={r.region} style={{ borderTop: "1px solid var(--dash-border)" }}>
                      <td style={tdS}><b>{r.region}</b></td>
                      <td style={{ ...tdS, fontFamily: "'SF Mono', monospace" }}>{r.users}</td>
                      <td style={{ ...tdS, color: "var(--dash-green)", fontWeight: 700 }}>{r.payRate}</td>
                      <td style={tdS}>{r.topSource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ===== 7. Segments ===== */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 14px" }}>用户分群与标签</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {MOCK_SEGMENTS.map((seg) => (
                  <div key={seg.name} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--dash-border)", borderLeft: "3px solid var(--dash-accent)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{seg.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'SF Mono', monospace", color: "var(--dash-accent)" }}>{seg.count} 人</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dash-sub)", marginBottom: 6 }}>{seg.description}</div>
                    <div style={{ fontSize: 12, color: "var(--dash-yellow)", fontWeight: 600 }}>→ {seg.action}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Follow-ups */}
            <div style={{ background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", borderRadius: 10, padding: "20px 22px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 14px" }}>跟进记录</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {followUps.map((fu) => (
                  <div key={fu.id} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--dash-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{fu.user}</span>
                      <span style={{ fontSize: 11, color: "var(--dash-sub)" }}>{fu.date}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dash-accent)", fontWeight: 600, marginBottom: 2 }}>{fu.action}</div>
                    <div style={{ fontSize: 12, color: "var(--dash-sub)" }}>{fu.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== 8. User Detail Drawer ===== */}
          {detailUser && (
            <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }} onClick={() => setDetailUser(null)}>
              <div style={{ width: 520, maxWidth: "100vw", height: "100vh", overflowY: "auto", background: "var(--dash-card-bg)", borderLeft: "1px solid var(--dash-border)", padding: "28px 24px", boxShadow: "-8px 0 40px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{detailUser.user}</h2>
                  <button onClick={() => setDetailUser(null)} style={{ padding: "4px 8px", border: "none", background: "transparent", color: "var(--dash-sub)", fontSize: 20, cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                  <Section title="基础信息">
                    <DR label="邮箱" value={detailUser.email} />
                    <DR label="用户类型" value={detailUser.type} />
                    <DR label="来源渠道" value={detailUser.source || MOCK_USER_PROFILES.find((u) => u.user === detailUser.user)?.source || "-"} />
                    <DR label="IP / 地区" value={detailUser.ip || MOCK_USER_PROFILES.find((u) => u.user === detailUser.user)?.ip || "-"} />
                    <DR label="来源页面" value={MOCK_USER_PROFILES.find((u) => u.user === detailUser.user)?.sourcePage || "-"} />
                  </Section>

                  <Section title="消费数据">
                    <DR label="累计充值" value={`¥${detailUser.totalRecharge.toLocaleString()}`} />
                    <DR label="累计消耗" value={`¥${(MOCK_USER_PROFILES.find((u) => u.user === detailUser.user)?.totalSpend || 0).toLocaleString()}`} />
                    <DR label="购买产品" value={MOCK_USER_PROFILES.find((u) => u.user === detailUser.user)?.product || "-"} />
                    <DR label="是否复购" value={MOCK_USER_PROFILES.find((u) => u.user === detailUser.user)?.repurchase ? "是" : "否"} />
                    <DR label="是否愿意加微信" value={MOCK_USER_PROFILES.find((u) => u.user === detailUser.user)?.wantWechat ? "是" : "否"} />
                  </Section>

                  <Section title="行为数据">
                    <DR label="近 7 天调用" value={`${detailUser.calls7d || "-"} 次`} />
                    <DR label="近 30 天复购" value={`${detailUser.repurchase30d || 0} 次`} />
                    <DR label="API Key 数量" value={`${detailUser.apiKeys || 0} 个`} />
                    <DR label="高价值评分" value={<ScoreBadge score={detailUser.score || 0} />} />
                  </Section>

                  <Section title="自动标签">
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(detailUser.tags || []).map((t) => <Tag key={t} label={t} color={t === "高价值" ? "#22c55e" : t === "企业客户" ? "#3b82f6" : "#6366f1"} />)}
                      <Tag label="需跟进" color="#f59e0b" />
                    </div>
                  </Section>

                  <Section title="跟进记录">
                    {followUps.filter((f) => f.user === detailUser.user).map((fu) => (
                      <div key={fu.id} style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid var(--dash-border)", marginBottom: 6 }}>
                        <div style={{ fontSize: 12, color: "var(--dash-sub)", marginBottom: 2 }}>{fu.date} · {fu.action}</div>
                        <div style={{ fontSize: 13 }}>{fu.note}</div>
                      </div>
                    ))}
                    {followUps.filter((f) => f.user === detailUser.user).length === 0 && <p style={{ fontSize: 12, color: "var(--dash-sub)" }}>暂无跟进记录</p>}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <input placeholder="添加跟进记录..." value={followUpText} onChange={(e) => setFollowUpText(e.target.value)} style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit" }} />
                      <button onClick={addFollowUp} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "var(--dash-accent)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>添加</button>
                    </div>
                  </Section>

                  <Section title="建议动作">
                    <div style={{ display: "grid", gap: 6 }}>
                      <Suggestion icon="💬" text="添加微信，推荐企业额度包" />
                      <Suggestion icon="🎁" text="发送首充优惠券" />
                      <Suggestion icon="📖" text="引导查看帮助指南和模型广场" />
                    </div>
                  </Section>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

/* ===================================================================
   SUB-COMPONENTS
   =================================================================== */

function Section({ title, children }) {
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: "var(--dash-accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--dash-border)" }}>{title}</h3>
      {children}
    </div>
  );
}

function DR({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
      <span style={{ color: "var(--dash-sub)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Suggestion({ icon, text }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--dash-border)" }}><span>{icon}</span><span>{text}</span></div>;
}

const inputS = { padding: "8px 12px", borderRadius: 7, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", fontSize: 12, fontFamily: "inherit", outline: "none", minWidth: 140 };
const selectS = { ...inputS, minWidth: 100, cursor: "pointer" };
