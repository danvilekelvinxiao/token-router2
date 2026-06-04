import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import WalletProgressSection from "@/components/dashboard/wallet-progress-section";
import LiveNumber from "@/components/ui/live-number";
import { calculateWalletStatus } from "@/lib/wallet/calculate-wallet-status";
import { buildWalletProgress } from "@/lib/wallet/build-wallet-progress";
import { clampWalletProgress, formatWalletCny, formatWalletDate, formatWalletTokens } from "@/lib/wallet/format-wallet";
import WalletDetailDrawer from "./wallet-detail-drawer";
import WalletProgressBar from "./wallet-progress-bar";
import WalletSummaryStat from "./wallet-summary-stat";

export type WalletProgressCardProps = {
  balanceCny: number;
  totalQuotaCny?: number;
  usedQuotaCny?: number;
  remainingQuotaCny?: number;
  totalTokens?: number | null;
  usedTokens?: number | null;
  remainingTokens?: number | null;
  planName?: string;
  planAmountCny?: number;
  planStatus?: "active" | "expired" | "none";
  startedAt?: string;
  expiresAt?: string;
  remainingDays?: number | null;
  progressPercent: number;
  mode?: "dashboard" | "recharge" | "profile";
  loading?: boolean;
  empty?: boolean;
  data?: any;
  dashboardOverview?: any;
  dashboardCharts?: {
    balance?: Array<{ label: string; value: number | null; secondaryValue?: number | null }>;
    todaySpend?: Array<{ label: string; value: number | null; secondaryValue?: number | null }>;
    weekSpend?: Array<{ label: string; value: number | null; secondaryValue?: number | null }>;
    recentCalls?: Array<{ label: string; value: number | null; secondaryValue?: number | null }>;
    savings?: Array<{ label: string; value: number | null; secondaryValue?: number | null }>;
  };
  savingsSummary?: any;
  savingsLoading?: boolean;
  onOpenAsset?: (assetKey: string) => void;
  onOpenSavings?: () => void;
};

const MODE_COPY = {
  dashboard: {
    title: "钱包与套餐进度",
    subtitle: "查看当前套餐 Token、使用进度和到期时间。",
    primary: "查看充值",
    secondary: "查看消费明细",
  },
  recharge: {
    title: "当前钱包",
    subtitle: "充值前先确认当前余额和套餐使用情况。",
    primary: "继续充值",
    secondary: "兑换激活码",
  },
  profile: {
    title: "我的 FlowAPI 钱包",
    subtitle: "你的余额、套餐、Token 使用状态会在这里汇总。",
    primary: "查看全部账单",
    secondary: "使用佣金购买 Token",
  },
};

export default function WalletProgressCard({
  balanceCny,
  totalQuotaCny = 0,
  usedQuotaCny = 0,
  remainingQuotaCny,
  totalTokens,
  usedTokens,
  remainingTokens,
  planName,
  planAmountCny,
  planStatus = "none",
  startedAt,
  expiresAt,
  remainingDays,
  progressPercent,
  mode = "dashboard",
  loading = false,
  empty = false,
  data,
}: WalletProgressCardProps) {
  const [open, setOpen] = useState(false);
  const [detailFocus, setDetailFocus] = useState("钱包与套餐详情");
  const [priorityMode, setPriorityMode] = useState(data?.billingPreference?.priorityMode || "package_first");
  const [savingPreference, setSavingPreference] = useState(false);
  const [notice, setNotice] = useState("");
  const copy = MODE_COPY[mode] || MODE_COPY.dashboard;
  const remaining = remainingQuotaCny ?? balanceCny;
  const progress = clampWalletProgress(progressPercent);
  const status = useMemo(() => calculateWalletStatus({
    remainingQuotaCny: remaining,
    totalQuotaCny,
    planStatus,
    expiresAt,
  }), [expiresAt, planStatus, remaining, totalQuotaCny]);
  const membership = data?.membership;
  const wallets = Array.isArray(data?.wallets) ? data.wallets : [];
  const hasPlan = planStatus === "active" && Number(totalQuotaCny || 0) > 0;
  const usedTotalLabel = hasPlan ? `${formatWalletCny(usedQuotaCny)} / ${formatWalletCny(totalQuotaCny)}` : "普通余额钱包";
  const progressTitle = hasPlan ? "当前使用进度" : "普通余额可用";
  const planTimeline = hasPlan
    ? `兑换 ${startedAt ? formatWalletDate(startedAt) : "暂无记录"} · 到期 ${formatWalletDate(expiresAt)}${remainingDays !== null && remainingDays !== undefined ? ` · 剩余 ${remainingDays} 天` : ""}`
    : "暂无套餐到期时间，余额按实际模型调用扣费。";
  const tokenRemainingLabel = remainingTokens
    ? formatWalletTokens(remainingTokens)
    : hasPlan && totalTokens
      ? formatWalletTokens(remainingTokens)
      : "按实际余额折算";
  const isRechargeMode = mode === "recharge";
  const planRemainingCny = hasPlan ? Number(remaining || 0) : 0;
  const walletProgress = useMemo(() => {
    if (data?.walletProgress) return data.walletProgress;
    return buildWalletProgress({
      wallet: data?.wallet,
      token: data?.token,
      plan: data?.plan,
      calls: data?.recentConsumptions || [],
      membership: data?.membership,
    });
  }, [data]);

  useEffect(() => {
    if (data?.billingPreference?.priorityMode) {
      queueMicrotask(() => setPriorityMode(data.billingPreference.priorityMode));
    }
  }, [data?.billingPreference?.priorityMode]);

  async function switchPriority(nextMode: "package_first" | "balance_first") {
    if (savingPreference || nextMode === priorityMode) return;
    const previous = priorityMode;
    setPriorityMode(nextMode);
    setSavingPreference(true);
    setNotice("");
    try {
      const res = await fetch("/api/user/billing-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priorityMode: nextMode }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "failed");
      setNotice(nextMode === "package_first" ? "已切换为优先使用套餐" : "已切换为优先使用余额");
    } catch {
      setPriorityMode(previous);
      setNotice("切换失败，请稍后重试。");
    } finally {
      setSavingPreference(false);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  function openDetail(focus = "钱包与套餐详情") {
    setDetailFocus(focus);
    setOpen(true);
  }

  function renderTitle() {
    if (mode === "profile") {
      return <>我的 <FlowApiBrandText size="lg" /> 钱包</>;
    }
    if (mode === "dashboard") {
      return "钱包与套餐进度";
    }
    return copy.title;
  }

  function renderEyebrow() {
    return "资产钱包";
  }

  if (loading) {
    return (
      <section className={`wallet-progress-card wallet-mode-${mode} wallet-loading`}>
        <div className="wallet-card-head"><div><span>{renderEyebrow()}</span><h2>{renderTitle()}</h2></div></div>
        <div className="wallet-skeleton-grid"><i /><i /><i /></div>
        <div className="wallet-skeleton-line" />
      </section>
    );
  }

  if (empty) {
    return (
      <>
        <section className={`wallet-progress-card wallet-mode-${mode} wallet-empty`}>
          <div className="wallet-card-head">
            <div><span>{renderEyebrow()}</span><h2>{renderTitle()}</h2><p>{mode === "dashboard" ? "0 Token / 0 天" : copy.subtitle}</p></div>
            <em className="wallet-status-pill tone-none">暂无套餐</em>
          </div>
          {mode === "dashboard" ? (
            <WalletProgressSection walletProgress={walletProgress} onOpenDetail={openDetail} />
          ) : (
            <div className="wallet-empty-state">
              <strong>￥0.00</strong>
              <p>0 Token</p>
              <Link href="/recharge">立即充值</Link>
            </div>
          )}
        </section>
        <WalletDetailDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} focusTitle={detailFocus} />
      </>
    );
  }

  return (
    <>
      <section className={`wallet-progress-card wallet-mode-${mode} tone-${status.tone}`}>
        <div className="wallet-card-head">
          <div>
            <span>{renderEyebrow()}</span>
            <h2>{renderTitle()}</h2>
            <p>{mode === "dashboard" ? "Token / 到期 / 黑金会员" : copy.subtitle}</p>
          </div>
          <em className={`wallet-status-pill tone-${status.tone}`}>{status.label}</em>
        </div>

        {mode === "dashboard" ? (
          <WalletProgressSection walletProgress={walletProgress} onOpenDetail={openDetail} />
        ) : isRechargeMode ? (
          <>
            <div className="wallet-summary-grid wallet-summary-grid-compact">
              <WalletSummaryStat
                label="当前余额"
                value={Number(remaining || 0)}
                prefix="¥"
                decimals={2}
                tone="primary"
              />
              <WalletSummaryStat
                label="当前套餐"
                value={planName || "普通余额钱包"}
                tone={hasPlan ? "token" : "default"}
              />
            </div>
            <WalletProgressSection walletProgress={walletProgress} onOpenDetail={openDetail} variant="compact" />
          </>
        ) : (
          <div className="wallet-summary-grid">
            <WalletSummaryStat
              label={mode === "recharge" ? "当前余额" : "总剩余额度"}
              value={Number(remaining || 0)}
              prefix="¥"
              decimals={2}
              note={remaining <= 0 ? "建议充值" : "可继续调用"}
              tone="primary"
              onClick={() => openDetail("余额详情")}
            />
            <WalletSummaryStat
              label={hasPlan ? "已用 / 总量" : "计费模式"}
              value={usedTotalLabel}
              note={hasPlan ? "当前套餐周期" : "无套餐时按余额扣费"}
              tone={hasPlan ? "token" : "default"}
              onClick={() => openDetail(hasPlan ? "套餐使用详情" : "计费模式详情")}
            />
            <WalletSummaryStat
              label="最近到期"
              value={formatWalletDate(expiresAt)}
              tone={planStatus === "expired" ? "warning" : "default"}
              onClick={() => openDetail("到期时间详情")}
            />
          </div>
        )}

        {!isRechargeMode ? (
          <>
            {mode === "dashboard" ? null : (
              <button type="button" className="wallet-progress-wrap wallet-progress-click-target" onClick={() => openDetail("钱包与套餐进度")}>
                <div className="wallet-progress-topline">
                  <span>{progressTitle}</span>
                  <strong>{hasPlan ? <LiveNumber value={progress} suffix="%" decimals={1} /> : "暂无套餐进度"}</strong>
                </div>
                <WalletProgressBar progressPercent={hasPlan ? progress : 0} tone={hasPlan ? status.tone : "none"} />
              </button>
            )}

            {mode === "dashboard" ? null : <div className="wallet-billing-preference">
              <div>
                <span>消耗优先级</span>
                <p>会员赠送额度和黑金会员额度始终优先消耗。</p>
              </div>
              <div className="wallet-priority-switch" aria-label="消耗优先级切换">
                <button type="button" className={priorityMode === "package_first" ? "active" : ""} disabled={savingPreference} onClick={() => switchPriority("package_first")}>优先使用套餐</button>
                <button type="button" className={priorityMode === "balance_first" ? "active" : ""} disabled={savingPreference} onClick={() => switchPriority("balance_first")}>优先使用余额</button>
              </div>
              {notice ? <em className={notice.includes("失败") ? "error" : "success"}>{notice}</em> : null}
            </div>}

            {mode !== "dashboard" ? (
              <div className={`wallet-member-strip ${membership?.status === "active" ? "active" : "inactive"}`}>
                {membership?.status === "active" ? (
                  <>
                    <strong><FlowApiBrandText text="FLOWAPI" size="sm" /> 黑金会员</strong>
                    <span>今日赠送 {Number(membership.dailyBonusTokens || 0).toLocaleString()} Token · {membership.todayClaimed ? "已领取" : "未领取"}</span>
                    <small>会员到期：{formatWalletDate(membership.expiresAt)}</small>
                  </>
                ) : (
                  <>
                    <strong>开通 <FlowApiBrandText text="FLOWAPI" size="sm" /> 黑金会员</strong>
                    <span>每日领取免费 Token，并解锁会员专属模型和免费模型广场。</span>
                    <Link href="/recharge">开通黑金会员</Link>
                  </>
                )}
              </div>
            ) : null}

            {mode !== "dashboard" ? (
              <>
                <div className="wallet-token-row">
                  <span>已用 Token：{formatWalletTokens(usedTokens)}</span>
                  <span>剩余 Token：{tokenRemainingLabel}</span>
                </div>

                {wallets.length ? (
                  <div className="wallet-pool-preview">
                    {wallets.slice(0, 4).map((wallet: any) => (
                      <span key={wallet.type} className={wallet.locked ? "locked" : ""}>
                        {wallet.name}<b>{wallet.balanceTokens ? formatWalletTokens(wallet.balanceTokens) : formatWalletCny(wallet.balanceCnyEquivalent)}</b>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="wallet-actions" onClick={(event) => event.stopPropagation()}>
                  <Link href={mode === "profile" ? "/dashboard#dash-recent-calls" : "/recharge"}>{copy.primary}</Link>
                  <Link href={mode === "dashboard" ? "/dashboard#dash-recent-calls" : "/recharge"}>{copy.secondary}</Link>
                  <button type="button" aria-label="查看钱包与套餐详情" onClick={() => openDetail("钱包与套餐详情")}>↗</button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </section>

      <WalletDetailDrawer open={open} onClose={() => setOpen(false)} data={data} loading={loading} focusTitle={detailFocus} />
    </>
  );
}
