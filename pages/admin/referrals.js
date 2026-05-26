import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { DEFAULT_REFERRAL_SETTINGS } from "@/lib/referrals/calculate";

const tabs = [
  { key: "overview", label: "邀请概览" },
  { key: "relations", label: "邀请关系" },
  { key: "rewards", label: "佣金与额度记录" },
  { key: "withdrawals", label: "提现审核" },
  { key: "settings", label: "规则配置" },
];

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

export default function AdminReferralsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [relations, setRelations] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_REFERRAL_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [overviewRes, relationRes, rewardRes, withdrawalRes, settingsRes] = await Promise.all([
          fetch("/api/admin/referrals/overview"),
          fetch("/api/admin/referrals/relations"),
          fetch("/api/admin/referrals/rewards"),
          fetch("/api/admin/referrals/withdrawals"),
          fetch("/api/admin/referrals/settings"),
        ]);
        if (cancelled) return;
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (relationRes.ok) setRelations((await relationRes.json()).items || []);
        if (rewardRes.ok) setRewards((await rewardRes.json()).items || []);
        if (withdrawalRes.ok) setWithdrawals((await withdrawalRes.json()).items || []);
        if (settingsRes.ok) setSettings(await settingsRes.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const metrics = useMemo(() => ([
    { label: "总邀请人数", value: overview?.totalInvites || 0 },
    { label: "有效邀请人数", value: overview?.validInvites || 0 },
    { label: "总可提现佣金", value: money(overview?.totalCommissionCny) },
    { label: "待提现金额", value: money(overview?.pendingWithdrawCny) },
    { label: "已提现金额", value: money(overview?.paidWithdrawCny) },
    { label: "奖励额度发放", value: money(overview?.totalCreditBonusCny) },
  ]), [overview]);

  async function reviewWithdrawal(id, action) {
    const text = action === "paid" ? "确认已人工打款？" : action === "reject" ? "确认拒绝这笔提现？" : "确认通过这笔提现？";
    if (!window.confirm(text)) return;
    const res = await fetch("/api/admin/referrals/withdrawals/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) {
      const data = await res.json();
      setWithdrawals((current) => current.map((item) => (item.id === id ? data.withdrawal : item)));
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const res = await fetch("/api/admin/referrals/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) setSettings(await res.json());
  }

  return (
    <AdminLayout currentPath="/admin/referrals">
      <Head><title>邀请返佣管理 - FlowAPI Admin</title></Head>
      <section className="admin-page-shell admin-referrals-page">
        <div className="admin-page-head">
          <div>
            <span>Growth System</span>
            <h1>邀请返佣管理</h1>
            <p>管理邀请关系、可提现佣金、奖励额度、提现审核和返佣规则。佣金提现必须人工审核，适合商业站上线前风控。</p>
          </div>
        </div>

        <div className="admin-referral-tabs">
          {tabs.map((tab) => (
            <button key={tab.key} type="button" className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? <div className="admin-card">正在加载邀请返佣数据...</div> : null}

        {activeTab === "overview" && (
          <div className="admin-referral-metrics">
            {metrics.map((item) => (
              <div className="admin-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        )}

        {activeTab === "relations" && (
          <AdminTable
            columns={["邀请人", "被邀请用户", "邀请码", "注册时间", "是否首充", "累计充值", "状态"]}
            rows={relations.map((item) => [
              item.referrer || item.referrerUserId,
              item.friend || item.referredUserId,
              item.referralCode,
              item.registeredAt ? new Date(item.registeredAt).toLocaleString("zh-CN", { hour12: false }) : "-",
              item.firstBonusGranted ? "已首充" : "未充值",
              money(item.totalRechargeCny),
              item.status,
            ])}
          />
        )}

        {activeTab === "rewards" && (
          <AdminTable
            columns={["时间", "邀请人", "好友", "订单金额", "等级", "佣金比例", "可提现佣金", "奖励额度", "状态"]}
            rows={rewards.map((item) => [
              item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }) : "-",
              item.referrer || item.referrerUserId,
              item.friend || item.referredUserId,
              money(item.paidAmountCny),
              item.level,
              `${item.commissionRate}%`,
              money(item.commissionAmountCny),
              money(item.creditBonusCny),
              item.status,
            ])}
          />
        )}

        {activeTab === "withdrawals" && (
          <div className="admin-card admin-table-card">
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    {["申请时间", "用户", "提现金额", "提现方式", "收款账号", "收款姓名", "状态", "操作"].map((col) => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((item) => (
                    <tr key={item.id}>
                      <td>{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                      <td>{item.userId}</td>
                      <td className="num">{money(item.amountCny)}</td>
                      <td>{item.method === "wechat" ? "微信" : "支付宝"}</td>
                      <td>{item.account}</td>
                      <td>{item.realName}</td>
                      <td><span className={`admin-status ${item.status}`}>{item.status}</span></td>
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" onClick={() => reviewWithdrawal(item.id, "approve")}>通过</button>
                          <button type="button" onClick={() => reviewWithdrawal(item.id, "paid")}>已打款</button>
                          <button type="button" className="danger" onClick={() => reviewWithdrawal(item.id, "reject")}>拒绝</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!withdrawals.length ? <tr><td colSpan={8}>暂无提现申请</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <form className="admin-card admin-referral-settings" onSubmit={saveSettings}>
            <h2>规则配置</h2>
            <label><input type="checkbox" checked={Boolean(settings.enabled)} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /> 开启邀请返佣</label>
            <label><input type="checkbox" checked={Boolean(settings.continueRechargeReward)} onChange={(event) => setSettings({ ...settings, continueRechargeReward: event.target.checked })} /> 好友后续充值继续返佣</label>
            <label><input type="checkbox" checked={Boolean(settings.allowCommissionConvert)} onChange={(event) => setSettings({ ...settings, allowCommissionConvert: event.target.checked })} /> 允许佣金购买 Token</label>
            <div className="admin-form-grid">
              <label>首充双向奖励比例<input type="number" value={settings.firstRechargeBonusRate} onChange={(event) => setSettings({ ...settings, firstRechargeBonusRate: Number(event.target.value) })} /></label>
              <label>最低提现金额<input type="number" value={settings.minWithdrawAmountCny} onChange={(event) => setSettings({ ...settings, minWithdrawAmountCny: Number(event.target.value) })} /></label>
              <label>佣金结算延迟天数<input type="number" value={settings.settlementDelayDays} onChange={(event) => setSettings({ ...settings, settlementDelayDays: Number(event.target.value) })} /></label>
            </div>
            <div className="admin-referral-rule-grid">
              {(settings.levels || []).map((level) => (
                <div key={level.key}>
                  <strong>{level.level}</strong>
                  <span>{level.rangeLabel}</span>
                  <p>可提现佣金 {level.commissionRate}% · 等额额度 {level.creditBonusRate}%</p>
                </div>
              ))}
            </div>
            <button type="submit" className="btn-primary">保存返佣规则</button>
          </form>
        )}
      </section>
    </AdminLayout>
  );
}

function AdminTable({ columns, rows }) {
  return (
    <div className="admin-card admin-table-card">
      <div className="admin-table-scroll">
        <table>
          <thead>
            <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${columns[cellIndex]}-${cellIndex}`} className={String(cell).startsWith("¥") ? "num" : ""}>{cell}</td>)}</tr>
            ))}
            {!rows.length ? <tr><td colSpan={columns.length}>暂无数据</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
