import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import ConsoleLayout from "@/components/ConsoleLayout";
import CardDetailModal from "@/components/CardDetailModal";
import UserBadges from "@/components/profile/user-badges";
import UserBadgeDrawer from "@/components/profile/user-badge-drawer";
import LiveNumber from "@/components/ui/live-number";
import { useSafePolling } from "@/hooks/useSafePolling";

const ANNOUNCEMENTS = [
  {
    id: "ann-dashboard-upgrade",
    type: "系统更新",
    status: "已发布",
    tone: "success",
    pinned: true,
    title: "FlowAPI 数据面板升级",
    content: "数据面板已升级为 AI Token 资产分析中心，新增模型成本排行、余额预测和缓存命中率。",
    publishedAt: "2026-05-22T09:00:00+08:00",
  },
  {
    id: "ann-deepseek-online",
    type: "模型变更",
    status: "已发布",
    tone: "success",
    pinned: false,
    title: "FlowAPI DeepSeek 官方渠道已上线",
    content: "当前已支持 deepseek-chat 和 deepseek-reasoner。用户可在 API 管理页创建 API Key 后，通过 CC-Switch、Cherry Studio、Chatbox 等工具接入。",
    publishedAt: "2026-05-21T16:00:00+08:00",
  },
  {
    id: "ann-ccswitch-progress",
    type: "系统更新",
    status: "进行中",
    tone: "progress",
    pinned: false,
    title: "CC-Switch 自动配置持续优化",
    content: "正在优化 API Key 同步、/v1/responses 兼容、自动导入自定义供应商等问题。建议优先使用自定义供应商 + https://flowapi.fun/v1 手动配置。",
    publishedAt: "2026-05-20T14:30:00+08:00",
  },
  {
    id: "ann-gift-credit",
    type: "福利活动",
    status: "已发布",
    tone: "default",
    pinned: false,
    title: "赠送额度规则说明",
    content: "登录赠送 0.5 额度，实际产生 Token 使用时赠送 1.5 额度。赠送额度仅当日可用，并优先消耗。",
    publishedAt: "2026-05-19T10:00:00+08:00",
  },
  {
    id: "ann-monitoring",
    type: "维护通知",
    status: "已发布",
    tone: "warning",
    pinned: false,
    title: "源站巡检与监控加强",
    content: "FlowAPI 会持续检查正式域名、API 健康状态和上游通道。出现异常时会优先恢复访问，再同步处理原因。",
    publishedAt: "2026-05-18T18:00:00+08:00",
  },
  {
    id: "ann-key-safe",
    type: "重要提醒",
    status: "已发布",
    tone: "default",
    pinned: false,
    title: "请妥善保管 API Key",
    content: "API Key 只用于 FlowAPI 调用模型，不要公开发到群聊、论坛或截图中。如怀疑泄露，请尽快禁用并重新创建。",
    publishedAt: "2026-05-18T12:00:00+08:00",
  },
];

function formatProfileTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatRelativeUpdate(value) {
  if (!value) return "等待更新";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return formatProfileTime(value);
}

function formatMoney(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function buildLocalRanking(customer = {}) {
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const totalSpendCny = Number(customer.totalSpend || calls.reduce((sum, call) => sum + Number(call.cost || 0), 0));
  const totalTokens = calls.reduce((sum, call) => sum + Number(call.tokens || 0), 0);
  const spendPercentileTop = totalSpendCny >= 300 ? 8 : totalSpendCny >= 100 ? 18 : totalSpendCny > 0 ? 36 : 88;
  const tokenPercentileTop = totalTokens >= 1000000 ? 1 : totalTokens >= 300000 ? 9 : totalTokens > 0 ? 28 : 92;
  return {
    totalSpendCny,
    totalTokens,
    spendPercentileTop,
    tokenPercentileTop,
    spendBeatsUsersPercent: Math.max(1, 100 - spendPercentileTop),
    tokenBeatsUsersPercent: Math.max(1, 100 - tokenPercentileTop),
    rankUpdatedAt: new Date().toISOString(),
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [customer, setCustomer] = useState(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [qqCopied, setQqCopied] = useState(false);
  const [qqQrFailed, setQqQrFailed] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [assetRanking, setAssetRanking] = useState(null);
  const [referral, setReferral] = useState(null);
  const [referralCopied, setReferralCopied] = useState("");
  const [invitesExpanded, setInvitesExpanded] = useState(false);
  const [rewardsExpanded, setRewardsExpanded] = useState(false);
  const [referralModal, setReferralModal] = useState("");
  const [referralDetailsOpen, setReferralDetailsOpen] = useState(false);
  const [referralForm, setReferralForm] = useState({ amountCny: "", method: "alipay", account: "", realName: "", remark: "" });
  const [referralMessage, setReferralMessage] = useState("");
  const [badgesData, setBadgesData] = useState(null);
  const [badgesLoading, setBadgesLoading] = useState(true);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [walletData, setWalletData] = useState(null);

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

  const refreshAssetRanking = useCallback(async (currentCustomer = customer) => {
    if (!currentCustomer?.id) return;
    try {
      const res = await fetch(`/api/user/asset-ranking?customerId=${encodeURIComponent(currentCustomer.id)}`);
      if (!res.ok) throw new Error("ranking unavailable");
      const data = await res.json();
      setAssetRanking(data);
    } catch {
      setAssetRanking(buildLocalRanking(currentCustomer));
    }
  }, [customer]);

  useEffect(() => {
    if (!customer?.id) return undefined;
    queueMicrotask(() => refreshAssetRanking(customer));
  }, [customer, refreshAssetRanking]);

  useSafePolling({
    intervalMs: 30000,
    enabled: Boolean(customer?.id),
    callback: () => refreshAssetRanking(customer),
  });

  const refreshReferral = useCallback(async (currentCustomer = customer) => {
    if (!currentCustomer?.id) return;
    try {
      const res = await fetch(`/api/referrals/me?customerId=${encodeURIComponent(currentCustomer.id)}`);
      if (res.ok) setReferral(await res.json());
    } catch {
      setReferral(null);
    }
  }, [customer]);

  useEffect(() => {
    if (!customer?.id) return;
    queueMicrotask(() => refreshReferral(customer));
  }, [customer, refreshReferral]);

  useEffect(() => {
    if (!customer?.id) return undefined;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setBadgesLoading(true); });
    fetch("/api/user/titles")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setBadgesData(data); })
      .catch(() => { if (!cancelled) setBadgesData({ source: "empty", summary: { totalBadges: 0 }, displayBadges: [], allBadges: [] }); })
      .finally(() => { if (!cancelled) setBadgesLoading(false); });
    return () => { cancelled = true; };
  }, [customer?.id]);

  useEffect(() => {
    if (!customer?.id) return undefined;
    let cancelled = false;
    fetch("/api/user/wallet-summary")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setWalletData(data); })
      .catch(() => { if (!cancelled) setWalletData({ source: "empty", wallet: null, plan: null }); })
    return () => { cancelled = true; };
  }, [customer?.id, customer?.balance, customer?.calls?.length]);

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
  const announcements = ANNOUNCEMENTS
    .filter((item) => item.status === "已发布" || item.status === "进行中")
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.publishedAt) - new Date(a.publishedAt));
  const ranking = assetRanking || buildLocalRanking(customer);
  const isBlackGoldMember = walletData?.membership?.status === "active";

  async function copyQqGroup() {
    await navigator.clipboard.writeText("217637139");
    setQqCopied(true);
    setTimeout(() => setQqCopied(false), 2000);
  }

  async function copyReferral(text, type) {
    await navigator.clipboard.writeText(text);
    setReferralCopied(type);
    setTimeout(() => setReferralCopied(""), 1800);
  }

  async function submitReferralAction(event) {
    event.preventDefault();
    if (!referralModal) return;
    setReferralMessage("");
    const endpoint = referralModal === "convert" ? "/api/referrals/commission/convert" : "/api/referrals/withdraw";
    const payload = referralModal === "convert"
      ? { amountCny: Number(referralForm.amountCny) }
      : {
          amountCny: Number(referralForm.amountCny),
          method: referralForm.method,
          account: referralForm.account,
          realName: referralForm.realName,
          remark: referralForm.remark,
        };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setReferralMessage(data.error || "操作失败，请稍后重试");
      return;
    }
    setReferralMessage(referralModal === "convert" ? `已成功使用 ${formatMoney(payload.amountCny)} 佣金兑换 FlowAPI 余额。` : "已提交提现申请，管理员审核后会处理。");
    setReferralForm({ amountCny: "", method: "alipay", account: "", realName: "", remark: "" });
    await refreshReferral(customer);
    await refreshProfile(customer);
  }

  return (
    <>
      <Head>
        <title>个人资料 - FlowAPI</title>
      </Head>

      <ConsoleLayout customer={customer} currentPath="/profile">

        {/* ===== Profile Header ===== */}
        <div className="profile-user-hero">
          <div className={`profile-avatar-wrap ${isBlackGoldMember ? "is-black-gold" : ""}`}>
            <div className="profile-avatar-core">
              {(customer.name || customer.email || "U")[0].toUpperCase()}
            </div>
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
              {isBlackGoldMember ? (
                <span className="profile-membership-badge">FLOWAPI 黑金会员</span>
              ) : null}
            </div>
          </div>
          <UserBadges
            badges={badgesData?.displayBadges || []}
            total={Number(badgesData?.summary?.totalBadges || 0)}
            loading={badgesLoading}
            onOpen={() => setBadgesOpen(true)}
          />
        </div>

        {/* ===== Two-column layout ===== */}
        <div className="profile-main-grid">

          {/* ---- Left ---- */}
          <div style={{ display: "grid", gap: 20, alignContent: "start" }}>

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
                  <strong>¥{Number(ranking.totalSpendCny || 0).toFixed(2)}</strong>
                  <p>消费排名：<b>前 {Number(ranking.spendPercentileTop || 0)}%</b></p>
                  <small>你的累计消费超过了平台 {Number(ranking.spendBeatsUsersPercent || 0)}% 的用户。</small>
                </div>
                <div>
                  <span>累计消耗 Token</span>
                  <strong>{Number(ranking.totalTokens || 0) >= 1000000 ? `${(Number(ranking.totalTokens || 0) / 1000000).toFixed(2)}M` : Number(ranking.totalTokens || 0).toLocaleString()} Token</strong>
                  <p>Token 消耗排名：<b>前 {Number(ranking.tokenPercentileTop || 0)}%</b></p>
                  <small>你的 Token 使用量超过了平台 {Number(ranking.tokenBeatsUsersPercent || 0)}% 的用户。</small>
                </div>
              </div>
              <p className="profile-rank-updated">排名更新时间：{formatRelativeUpdate(ranking.rankUpdatedAt)}</p>
            </section>

          </div>

          {/* ---- Right ---- */}
          <div style={{ display: "grid", gap: 20, alignContent: "start" }}>

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

        <ReferralProgram
          referral={referral}
          fallbackCode={customer.myInviteCode}
          copied={referralCopied}
          onCopy={copyReferral}
          invitesExpanded={invitesExpanded}
          setInvitesExpanded={setInvitesExpanded}
          rewardsExpanded={rewardsExpanded}
          setRewardsExpanded={setRewardsExpanded}
          onOpenDetails={() => setReferralDetailsOpen(true)}
          onOpenAction={(type) => {
            setReferralModal(type);
            setReferralMessage("");
            setReferralForm({ amountCny: "", method: "alipay", account: "", realName: "", remark: "" });
          }}
        />

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
              <em aria-hidden="true">↗</em>
            </div>
            <div className="profile-timeline">
              {announcements.slice(0, 3).map((item) => (
                <article key={item.id} className={`profile-timeline-item ${item.tone}`}>
                  <div className="profile-timeline-dot" />
                  <div>
                    <div className="profile-timeline-top">
                      <strong>{item.pinned ? <b className="profile-pinned-badge">置顶</b> : null}{item.title}</strong>
                      <span>{item.type}</span>
                    </div>
                    <p>{item.content}</p>
                    <time>{formatProfileTime(item.publishedAt)}</time>
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
              {qqQrFailed ? (
                <div className="profile-qq-fallback">
                  <strong>QQ 群：217637139</strong>
                  <button type="button" onClick={copyQqGroup}>{qqCopied ? "已复制" : "复制群号"}</button>
                </div>
              ) : (
                <Image src="/images/qrcode/flowapi-qq-group.png" alt="FlowAPI QQ 交流群二维码" width={190} height={190} onError={() => setQqQrFailed(true)} />
              )}
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
                    <article key={`${item.type}-${item.title}`} className={`profile-history-item ${item.tone}`}>
                      <div>
                        <span>{item.pinned ? "置顶" : item.type}</span>
                        <strong>{item.title}</strong>
                        <time>{formatProfileTime(item.publishedAt)}</time>
                      </div>
                      <p>{item.content}</p>
                    </article>
                  ))}
                </div>
              ),
            },
          ]}
        />
        {referralModal ? (
          <div className="referral-modal-backdrop" role="presentation" onMouseDown={() => setReferralModal("")}>
            <form className="referral-action-modal" onSubmit={submitReferralAction} onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" className="referral-modal-close" onClick={() => setReferralModal("")}>×</button>
              <span>{referralModal === "convert" ? "佣金兑换" : "提现申请"}</span>
              <h2>{referralModal === "convert" ? "使用佣金购买 Token" : "申请提现"}</h2>
              <p>
                当前可提现佣金为 <strong>{formatMoney(referral?.withdrawableCommissionCny || 0)}</strong>。
                {referralModal === "convert" ? "确认后会增加 FlowAPI 账户余额，可继续购买 Token。" : "提现申请提交后，管理员审核通过后打款到你的支付宝或微信。"}
              </p>
              <label>
                <span>{referralModal === "convert" ? "使用金额" : "提现金额"}</span>
                <input type="number" min="1" step="0.01" value={referralForm.amountCny} onChange={(event) => setReferralForm({ ...referralForm, amountCny: event.target.value })} placeholder="输入金额" required />
              </label>
              {referralModal === "withdraw" ? (
                <>
                  <label>
                    <span>提现方式</span>
                    <select value={referralForm.method} onChange={(event) => setReferralForm({ ...referralForm, method: event.target.value })}>
                      <option value="alipay">支付宝</option>
                      <option value="wechat">微信</option>
                    </select>
                  </label>
                  <label>
                    <span>收款账号</span>
                    <input value={referralForm.account} onChange={(event) => setReferralForm({ ...referralForm, account: event.target.value })} placeholder="支付宝账号 / 微信号" required />
                  </label>
                  <label>
                    <span>收款姓名</span>
                    <input value={referralForm.realName} onChange={(event) => setReferralForm({ ...referralForm, realName: event.target.value })} placeholder="用于人工核对" required />
                  </label>
                  <label>
                    <span>备注</span>
                    <input value={referralForm.remark} onChange={(event) => setReferralForm({ ...referralForm, remark: event.target.value })} placeholder="可选" />
                  </label>
                  <small>最低提现金额：¥20。提现申请提交后状态为待审核。</small>
                </>
              ) : null}
              {referralMessage ? <p className={referralMessage.includes("失败") || referralMessage.includes("不足") ? "referral-error" : "referral-success"}>{referralMessage}</p> : null}
              <div className="referral-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setReferralModal("")}>取消</button>
                <button type="submit" className="btn-primary">{referralModal === "convert" ? "确认兑换" : "提交提现申请"}</button>
              </div>
            </form>
          </div>
        ) : null}
        <ReferralDetailDrawer
          open={referralDetailsOpen}
          referral={referral}
          onClose={() => setReferralDetailsOpen(false)}
          onOpenAction={(type) => {
            setReferralDetailsOpen(false);
            setReferralModal(type);
            setReferralMessage("");
            setReferralForm({ amountCny: "", method: "alipay", account: "", realName: "", remark: "" });
          }}
        />
        <UserBadgeDrawer
          open={badgesOpen}
          onClose={() => setBadgesOpen(false)}
          badges={badgesData?.allBadges || []}
          summary={badgesData?.summary}
        />
      </ConsoleLayout>
    </>
  );
}

function ReferralProgram({
  referral,
  fallbackCode,
  copied,
  onCopy,
  invitesExpanded,
  setInvitesExpanded,
  rewardsExpanded,
  setRewardsExpanded,
  onOpenDetails,
  onOpenAction,
}) {
  const code = referral?.code || fallbackCode || "FLOW8888";
  const inviteUrl = referral?.inviteUrl || `https://www.flowapi.fun/register?invite=${code}`;
  const rules = referral?.rules?.length ? referral.rules : [
    { key: "basic", level: "普通邀请", rangeLabel: "0 - 19 人", commissionRate: 0, creditBonusRate: 10 },
    { key: "advanced", level: "进阶邀请", rangeLabel: "20 - 49 人", commissionRate: 10, creditBonusRate: 10 },
    { key: "premium", level: "高级邀请", rangeLabel: "50 人及以上", commissionRate: 15, creditBonusRate: 15 },
  ];
  const invitedUsers = referral?.invitedUsers || [];
  const rewards = referral?.rewards || [];
  const visibleInvites = invitesExpanded ? invitedUsers : invitedUsers.slice(0, 5);
  const visibleRewards = rewardsExpanded ? rewards : rewards.slice(0, 5);
  const validInvites = Number(referral?.validInvites || 0);
  const progressValue = Math.min(100, (validInvites / 50) * 100);
  const nextTarget = validInvites >= 50 ? null : validInvites >= 20 ? 50 : 20;
  const nextNeed = nextTarget ? Math.max(0, nextTarget - validInvites) : 0;
  const nextLevelName = nextTarget === 20 ? "进阶邀请" : nextTarget === 50 ? "高级邀请" : "最高等级";
  const rewardSteps = rules.map((rule) => {
    const threshold = rule.key === "premium" ? 50 : rule.key === "advanced" ? 20 : 0;
    const isUnlocked = validInvites >= threshold;
    const isCurrent = referral?.levelKey ? referral.levelKey === rule.key : (!nextTarget && rule.key === "premium") || (nextTarget === 20 && rule.key === "basic") || (nextTarget === 50 && rule.key === "advanced");
    return { ...rule, threshold, isUnlocked, isCurrent };
  });

  return (
    <section className="profile-referral-suite">
      <div className="profile-referral-hero">
        <div>
          <span>邀请返佣</span>
          <h2>邀请好友赚佣金</h2>
          <p>分享专属链接给好友。好友完成真实充值后，系统自动结算佣金和奖励额度。</p>
        </div>
        <div className="profile-referral-actions">
          <button type="button" className="btn-primary" onClick={() => onOpenAction("withdraw")}>申请提现</button>
          <button type="button" className="btn-secondary" onClick={() => onOpenAction("convert")}>用佣金购买 Token</button>
        </div>
      </div>

      <div className="profile-referral-share-panel">
        <div className="profile-referral-share-main">
          <span>专属邀请链接</span>
          <div>
            <code>{inviteUrl}</code>
            <button type="button" onClick={() => onCopy(inviteUrl, "url")}>{copied === "url" ? "已复制" : "复制链接"}</button>
          </div>
          <p>建议直接发链接给客户，注册关系会自动绑定。</p>
        </div>
        <div className="profile-referral-code-card">
          <span>邀请码</span>
          <strong>{code}</strong>
          <button type="button" onClick={() => onCopy(code, "code")}>{copied === "code" ? "已复制" : "复制"}</button>
        </div>
      </div>

      <div className="profile-referral-summary">
        {[
          { label: "累计邀请", value: Number(referral?.totalInvites || 0), suffix: "人", hint: "通过你的链接注册的好友" },
          { label: "有效邀请", value: Number(referral?.validInvites || 0), suffix: "人", hint: "累计充值满 ￥30 后计入" },
          { label: "可提现佣金", value: Number(referral?.withdrawableCommissionCny || 0), prefix: "¥", decimals: 2, hint: "可申请提现或购买 Token" },
        ].map((item) => (
          <div key={item.label} className="profile-referral-kpi">
            <span>{item.label}</span>
            <strong><LiveNumber value={item.value} prefix={item.prefix || ""} suffix={item.suffix || ""} decimals={item.decimals} /></strong>
            <p>{item.hint}</p>
          </div>
        ))}
        <button type="button" className="profile-referral-detail-card" onClick={onOpenDetails}>
          <span>佣金明细</span>
          <strong>查看完整返佣数据</strong>
          <p>累计佣金、已提现、奖励额度、购买 Token 记录都收进这里。</p>
          <em aria-hidden="true">↗</em>
        </button>
      </div>

      <div className="profile-referral-section">
        <div className="profile-panel-head">
          <div><span>邀请等级进度</span><h2>当前有效邀请人数：{validInvites} 人</h2></div>
          <em>{referral?.level || "普通邀请"}</em>
        </div>
        <div className="profile-referral-progress-card">
          <div className="profile-referral-progress-summary">
            <div>
              <span>当前进度</span>
              <strong>{validInvites >= 50 ? "50+" : `${validInvites} / 50`}</strong>
            </div>
            <div className="profile-referral-next-goal">
              <span>{nextTarget ? "下一目标" : "已达最高等级"}</span>
              <strong>{nextTarget ? `还差 ${nextNeed} 人解锁${nextLevelName}` : "高级邀请已解锁"}</strong>
              <p>{nextTarget ? "有效充值用户越多，返佣等级越高。" : "继续邀请好友，每次有效充值仍会继续结算奖励。"}</p>
            </div>
          </div>
          <div className="profile-referral-progress-track"><i style={{ width: `${progressValue}%` }} /></div>
          <div className="profile-referral-progress-nodes">
            <span className={validInvites >= 0 ? "active" : ""}><b>0</b>普通邀请</span>
            <span className={validInvites >= 20 ? "active" : ""}><b>20</b>进阶邀请</span>
            <span className={validInvites >= 50 ? "active" : ""}><b>50</b>高级邀请</span>
          </div>
          <div className="profile-referral-reward-steps" aria-label="邀请等级奖励">
            {rewardSteps.map((rule) => (
              <article
                key={rule.key}
                className={[
                  "profile-referral-reward-step",
                  rule.isUnlocked ? "unlocked" : "locked",
                  rule.isCurrent ? "current" : "",
                ].filter(Boolean).join(" ")}
              >
                <div>
                  <span>{rule.threshold === 0 ? "0 人起" : `${rule.threshold} 人解锁`}</span>
                  <strong>{rule.level}</strong>
                </div>
                <ul>
                  <li>{rule.commissionRate}% 可提现佣金</li>
                  <li>{rule.creditBonusRate}% 等额 Token 额度</li>
                </ul>
                <em>{rule.isUnlocked ? "已解锁" : "未解锁"}</em>
              </article>
            ))}
          </div>
        </div>
      </div>

      <ReferralList
        title="我的邀请用户"
        subtitle="查看好友充值金额、你获得的可提现佣金和奖励额度。"
        expanded={invitesExpanded}
        setExpanded={setInvitesExpanded}
        total={invitedUsers.length}
      >
        {visibleInvites.map((item) => (
          <article key={item.id} className="profile-referral-row">
            <div><strong>{item.name}</strong><span>注册时间：{formatDate(item.registeredAt)}</span></div>
            <div><span>{item.firstRecharge ? "有效邀请" : Number(item.totalRechargeCny || 0) > 0 ? "待充值达标" : "已注册"}</span><b>{formatMoney(item.totalRechargeCny)}</b></div>
            <div><span>最近充值</span><b>{item.latestRechargeCny ? formatMoney(item.latestRechargeCny) : "-"}</b></div>
            <div><span>可提现佣金</span><b>{formatMoney(item.commissionCny)}</b></div>
            <div><span>奖励额度</span><b>{formatMoney(item.creditBonusCny)}</b></div>
            <em>{item.status}</em>
          </article>
        ))}
      </ReferralList>

      <ReferralList
        title="奖励明细"
        subtitle="每一笔邀请奖励都由服务端按订单实付金额和当前等级计算。"
        expanded={rewardsExpanded}
        setExpanded={setRewardsExpanded}
        total={rewards.length}
      >
        {visibleRewards.map((item) => (
          <article key={item.id} className="profile-referral-row reward">
            <div><strong>{item.friend || "好友"}</strong><span>{formatProfileTime(item.createdAt)}</span></div>
            <div><span>订单金额</span><b>{formatMoney(item.paidAmountCny)}</b></div>
            <div><span>奖励类型</span><b>{item.rewardType === "first_recharge_bonus" ? "首笔双向奖励" : "充值返佣"}</b></div>
            <div><span>奖励比例</span><b>{item.commissionRate}% / {item.creditBonusRate}%</b></div>
            <div><span>可提现佣金</span><b>{formatMoney(item.commissionAmountCny)}</b></div>
            <div><span>奖励额度</span><b>{formatMoney(item.creditBonusCny)}</b></div>
            <em>{item.status === "settled" ? "已结算" : item.status}</em>
          </article>
        ))}
      </ReferralList>
    </section>
  );
}

function ReferralDetailDrawer({ open, referral, onClose, onOpenAction }) {
  if (!open) return null;
  const detailItems = [
    ["累计邀请", `${referral?.totalInvites || 0} 人`, "所有通过你邀请链接或邀请码注册的用户。"],
    ["有效充值", `${referral?.validInvites || 0} 人`, "完成真实充值后才会进入有效邀请统计。"],
    ["累计佣金", formatMoney(referral?.totalCommissionCny), "历史累计获得的可提现佣金总额。"],
    ["可提现佣金", formatMoney(referral?.withdrawableCommissionCny), "当前可以提现，也可以直接购买 Token。"],
    ["已提现佣金", formatMoney(referral?.withdrawnCommissionCny), "已经提交并完成处理的提现金额。"],
    ["累计奖励额度", formatMoney(referral?.totalCreditBonusCny), "系统发放到账户的等额奖励额度。"],
    ["已用佣金购买 Token", formatMoney(referral?.usedCommissionForTokenCny), "已转入 FlowAPI 余额用于模型调用的佣金。"],
  ];

  return (
    <div className="referral-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="referral-detail-drawer" aria-label="邀请返佣明细">
        <header>
          <div>
            <span>Referral Detail</span>
            <h2>邀请返佣明细</h2>
            <p>这里集中展示返佣、提现和奖励额度，主页面只保留最关键的行动数字。</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="referral-detail-grid">
          {detailItems.map(([label, value, desc]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <p>{desc}</p>
            </article>
          ))}
        </div>
        <div className="referral-detail-actions">
          <button type="button" className="btn-primary" onClick={() => onOpenAction("withdraw")}>申请提现</button>
          <button type="button" className="btn-secondary" onClick={() => onOpenAction("convert")}>用佣金购买 Token</button>
        </div>
        <p className="referral-detail-note">返佣数据以服务端真实充值订单和结算记录为准，没有记录时不会用假数据冒充收益。</p>
      </aside>
    </div>
  );
}

function ReferralList({ title, subtitle, children, expanded, setExpanded, total }) {
  return (
    <div className="profile-referral-section">
      <div className="profile-panel-head">
        <div><span>Referral</span><h2>{title}</h2><p>{subtitle}</p></div>
        {total > 5 ? <button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "展开全部"}</button> : null}
      </div>
      <div className="profile-referral-list">
        {total ? children : <p className="profile-referral-empty">暂无记录。好友通过邀请链接注册并完成充值后，这里会显示佣金和奖励额度。</p>}
      </div>
    </div>
  );
}
