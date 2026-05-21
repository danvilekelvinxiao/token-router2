import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import CardDetailModal from "@/components/CardDetailModal";

export default function ProfilePage() {
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qqCopied, setQqCopied] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);

  const refreshProfile = useCallback(async (c) => {
    if (!c) {
      const stored = localStorage.getItem("flowapi_customer");
      if (!stored) return;
      try { c = JSON.parse(stored); } catch { return; }
    }
    // always use localStorage as fallback so the page doesn't get stuck
    queueMicrotask(() => {
      setCustomer(c);
      setName(c.name || "");
    });

    try {
      const res = await fetch(`/api/profile?customerId=${c.id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomer(data);
        setName(data.name || "");
        localStorage.setItem("flowapi_customer", JSON.stringify(data));
      }
    } catch { /* keep localStorage fallback */ }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) { router.push("/login"); return; }
    let c;
    try { c = JSON.parse(stored); } catch { router.push("/login"); return; }
    queueMicrotask(() => refreshProfile(c));
  }, [refreshProfile, router]);

  async function handleSave(e) {
    e.preventDefault();
    if (!customer) return;
    setSaving(true);
    setSaved(false);

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: customer.id, name: name.trim() }),
    });

    if (res.ok) {
      const data = await res.json();
      setCustomer(data);
      localStorage.setItem("flowapi_customer", JSON.stringify(data));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (!customer) {
    return (
      <main className="landing-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--page-sub)" }}>加载中...</p>
      </main>
    );
  }

  const apiKeys = customer.apiKeys || [];
  const calls = customer.calls || [];
  const inviteCount = customer.inviteCount || 0;
  const joinDate = customer.createdAt
    ? new Date(customer.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : "-";
  const nowText = new Date().toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const announcements = [
    {
      type: "模型变更",
      status: "success",
      title: "FlowAPI DeepSeek 官方渠道已上线",
      content: "当前已支持 deepseek-chat 和 deepseek-reasoner。用户可在 API 管理页创建密匙后，通过 CC-Switch、Cherry Studio、Chatbox 等工具接入。",
      time: nowText,
    },
    {
      type: "系统更新",
      status: "progress",
      title: "CC-Switch 自动配置优化中",
      content: "正在优化 API Key 同步、/v1/responses 兼容、自动导入自定义供应商等问题。建议优先使用自定义供应商 + https://flowapi.fun/v1 手动配置。",
      time: nowText,
    },
    {
      type: "福利活动",
      status: "default",
      title: "赠送额度规则说明",
      content: "登录赠送 0.5 额度，实际产生 Token 使用时赠送 1.5 额度。赠送额度仅当日可用，并优先消耗。",
      time: nowText,
    },
    {
      type: "维护通知",
      status: "warning",
      title: "源站巡检与监控加强",
      content: "FlowAPI 会持续检查正式域名、API 健康状态和上游通道。出现异常时会优先恢复访问，再同步处理原因。",
      time: nowText,
    },
    {
      type: "重要提醒",
      status: "default",
      title: "请妥善保管 API Key",
      content: "API Key 只用于 FlowAPI 调用模型，不要公开发到群聊、论坛或截图中。如怀疑泄露，请尽快禁用并重新创建。",
      time: nowText,
    },
  ];
  const totalSpend = Number(customer.totalSpend || calls.reduce((sum, call) => sum + Number(call.cost || 0), 0));
  const totalTokens = calls.reduce((sum, call) => sum + Number(call.tokens || 0), 0);
  const spendTopPercent = totalSpend >= 300 ? 8 : totalSpend >= 100 ? 18 : totalSpend > 0 ? 36 : 88;
  const tokenTopPercent = totalTokens >= 1000000 ? 1 : totalTokens >= 300000 ? 9 : totalTokens > 0 ? 28 : 92;
  const spendBeatPercent = Math.max(1, 100 - spendTopPercent);
  const tokenBeatPercent = Math.max(1, 100 - tokenTopPercent);

  async function copyQqGroup() {
    await navigator.clipboard.writeText("217637139");
    setQqCopied(true);
    setTimeout(() => setQqCopied(false), 2000);
  }

  return (
    <>
      <Head>
        <title>个人资料 - FlowAPI</title>
      </Head>

      <ConsoleLayout customer={customer} currentPath="/profile">

        {/* ===== Profile Header ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 30, fontWeight: 900, flex: "none",
          }}>
            {(customer.name || customer.email || "U")[0].toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--page-heading)", margin: 0, letterSpacing: "-0.03em" }}>
              {customer.name || customer.email?.split("@")[0]}
            </h1>
            <p style={{ color: "var(--page-sub)", fontSize: 14, margin: "4px 0 0" }}>{customer.email}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--page-subtle)", fontWeight: 600 }}>注册于 {joinDate}</span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: "var(--page-success-bg)", color: "var(--page-success-text)",
                padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--page-success-text)" }} />
                已验证
              </span>
            </div>
          </div>
        </div>

        {/* ===== Two-column layout ===== */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20, marginBottom: 32 }}>

          {/* ---- Left ---- */}
          <div style={{ display: "grid", gap: 20, alignContent: "start" }}>

            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {[
                { label: "账户余额", value: `¥ ${Number(customer.balance).toFixed(2)}`, accent: "#6366f1" },
                { label: "累计消耗", value: `¥ ${Number(customer.totalSpend).toFixed(2)}`, accent: "#8b5cf6" },
                { label: "调用次数", value: `${calls.length} 次`, accent: "#059669" },
                { label: "API 密匙", value: `${apiKeys.length} 个`, accent: "var(--page-heading)" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 14, padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 12, color: "var(--page-subtle)", fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: s.accent, marginTop: 6, letterSpacing: "-0.02em" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Edit Form */}
            <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: "24px" }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--page-accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  编辑资料
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--page-heading)", margin: "4px 0 0", letterSpacing: "-0.02em" }}>
                  个人信息
                </h3>
              </div>

              <form onSubmit={handleSave}>
                <div className="form-field">
                  <label>邮箱</label>
                  <input type="email" value={customer.email || ""} disabled style={{ background: "var(--page-soft-bg)", color: "var(--page-sub)", cursor: "not-allowed" }} />
                  <span style={{ fontSize: 11, color: "var(--page-subtle)", marginTop: 3, display: "block" }}>邮箱不可修改</span>
                </div>
                <div className="form-field">
                  <label>姓名</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="你的姓名" />
                </div>
                {saved && <p style={{ color: "var(--page-success-text)", fontSize: 13, fontWeight: 600, margin: "8px 0" }}>保存成功</p>}
                <button type="submit" disabled={saving} className="btn-primary" style={{ width: "100%", marginTop: 20, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "保存中..." : "保存修改"}
                </button>
              </form>
            </div>

            <section className="profile-asset-rank-card">
              <div className="profile-panel-head">
                <div>
                  <span>资产排名</span>
                  <h2>我的 FlowAPI 资产排名</h2>
                </div>
                <em>平台参考</em>
              </div>
              <div className="profile-rank-grid">
                <div>
                  <span>累计消费</span>
                  <strong>¥{totalSpend.toFixed(2)}</strong>
                  <p>消费排名：<b>前 {spendTopPercent}%</b></p>
                  <small>你的累计消费超过了平台 {spendBeatPercent}% 的用户。</small>
                </div>
                <div>
                  <span>累计消耗 Token</span>
                  <strong>{totalTokens >= 1000000 ? `${(totalTokens / 1000000).toFixed(2)}M` : totalTokens.toLocaleString()} Token</strong>
                  <p>Token 消耗排名：<b>前 {tokenTopPercent}%</b></p>
                  <small>你的 Token 使用量超过了平台 {tokenBeatPercent}% 的用户。</small>
                </div>
              </div>
            </section>

          </div>

          {/* ---- Right ---- */}
          <div style={{ display: "grid", gap: 20, alignContent: "start" }}>

            {/* Invite Card */}
            {customer.myInviteCode && (
              <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: "24px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--page-accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  邀请好友
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                  我的邀请码
                </h3>

                {/* Big code display */}
                <div style={{
                  background: "var(--page-accent-soft)",
                  border: "1px solid var(--page-accent-border)", borderRadius: 14,
                  padding: "18px 12px", marginTop: 12,
                }}>
                  <code style={{
                    fontSize: 38, fontWeight: 900, color: "var(--page-heading)",
                    letterSpacing: "0.14em",
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                  }}>
                    {customer.myInviteCode}
                  </code>
                </div>

                <div style={{ marginTop: 14 }}>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(customer.myInviteCode);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 1500);
                    }}
                    className="btn-primary"
                    style={{ width: "100%", fontSize: 14 }}
                  >
                    {saved ? "已复制" : "复制邀请码"}
                  </button>
                </div>

                {/* Invite count */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
                  marginTop: 16, padding: "14px 0",
                  borderTop: "1px solid var(--page-card-border)",
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "var(--page-accent)" }}>{inviteCount}</div>
                    <div style={{ fontSize: 11, color: "var(--page-subtle)", fontWeight: 600, marginTop: 2 }}>已邀请</div>
                  </div>
                </div>

                {/* Reward notice */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 14px",
                  background: "var(--page-warning-bg)",
                  borderRadius: 10, border: "1px solid var(--page-warning-bg)",
                }}>
                  <span style={{ fontSize: 20 }}>🎁</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--page-warning-text)" }}>邀请成功送 ¥20 额度</div>
                    <div style={{ fontSize: 11, color: "var(--page-warning-sub)", marginTop: 1 }}>每成功邀请一位新用户，邀请人获得 ¥20</div>
                  </div>
                </div>
              </div>
            )}

            {/* Account Info */}
            <div style={{ background: "var(--page-card-bg)", border: "1px solid var(--page-card-border)", borderRadius: 16, padding: "24px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--page-accent)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                账户信息
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 16px", letterSpacing: "-0.02em" }}>
                详细资料
              </h3>
              <div style={{ display: "grid", gap: 0 }}>
                {[
                  { label: "邮箱", value: customer.email },
                  { label: "注册日期", value: joinDate },
                  { label: "邀请人数", value: `${inviteCount} 人` },
                ].map((item, i, arr) => (
                  <div key={item.label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "11px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--page-row-divider)" : "none",
                  }}>
                    <span style={{ fontSize: 12, color: "var(--page-subtle)", fontWeight: 500 }}>{item.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--page-text)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section className="profile-support-grid">
          <div
            role="button"
            tabIndex={0}
            className="profile-announcement-card profile-clickable-panel"
            onClick={() => setShowAnnouncements(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setShowAnnouncements(true);
              }
            }}
          >
            <div className="profile-panel-head">
              <div>
                <span>系统消息</span>
                <h2>系统公告</h2>
              </div>
              <em>点击查看历史公告</em>
            </div>
            <div className="profile-timeline">
              {announcements.slice(0, 3).map((item) => (
                <article key={item.title} className={`profile-timeline-item ${item.status}`}>
                  <div className="profile-timeline-dot" />
                  <div>
                    <div className="profile-timeline-top">
                      <strong>{item.title}</strong>
                      <span>{item.type}</span>
                    </div>
                    <p>{item.content}</p>
                    <time>{item.time}</time>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="profile-qq-card">
            <div className="profile-panel-head">
              <div>
                <span>QQ 社群支持</span>
                <h2>加入 FlowAPI QQ 交流群</h2>
              </div>
            </div>
            <p className="profile-qq-main">更多优惠活动和技术支持，请扫码加入 QQ 群。</p>
            <p className="profile-qq-desc">群里会优先同步不定期福利；模型选择、Base URL、API Key、客户端安装这类具体问题，也可以直接问。</p>
            <div className="profile-qq-tags">
              <span>新人教程</span>
              <span>福利同步</span>
              <span>下载协助</span>
            </div>
            <div className="profile-qq-qr-wrap">
              <Image src="/images/qq-group-qr.png" alt="FlowAPI QQ 交流群二维码" width={190} height={190} />
            </div>
            <div className="profile-qq-number">
              <span>群号</span>
              <strong>217637139</strong>
              <button type="button" onClick={copyQqGroup}>{qqCopied ? "已复制" : "复制群号"}</button>
            </div>
          </div>
        </section>

        <CardDetailModal
          open={showAnnouncements}
          onClose={() => setShowAnnouncements(false)}
          title="历史系统公告"
          description="按时间倒序展示 FlowAPI 的系统更新、维护通知、模型变更、福利活动和重要提醒。"
          badge="系统公告"
          sections={[
            {
              title: "公告列表",
              content: (
                <div className="profile-announcement-history">
                  {announcements.map((item) => (
                    <article key={`${item.type}-${item.title}`} className={`profile-history-item ${item.status}`}>
                      <div>
                        <span>{item.type}</span>
                        <strong>{item.title}</strong>
                        <time>{item.time}</time>
                      </div>
                      <p>{item.content}</p>
                    </article>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </ConsoleLayout>
    </>
  );
}
