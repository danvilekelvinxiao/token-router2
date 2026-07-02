import Link from "next/link";
import type { ReactNode } from "react";
import LiveNumber from "@/components/ui/live-number";
import { formatApiCredit, formatRmb, formatWalletCny, formatWalletDate, formatWalletTokens } from "@/lib/wallet/format-wallet";

type WalletSummaryData = {
  source?: "real" | "empty" | string;
  updatedAt?: string;
  wallet?: {
    balanceCny?: number;
    totalQuotaCny?: number;
    usedQuotaCny?: number;
    remainingQuotaCny?: number;
    progressPercent?: number;
  };
  token?: {
    totalTokens?: number | null;
    usedTokens?: number | null;
    remainingTokens?: number | null;
  };
  plan?: {
    planName?: string;
    planAmountCny?: number;
    status?: string;
    startedAt?: string;
    expiresAt?: string;
    remainingDays?: number | null;
    quotaText?: string;
  } | null;
  recentRecharges?: Array<Record<string, any>>;
  recentConsumptions?: Array<Record<string, any>>;
  balanceLogs?: Array<Record<string, any>>;
  spendTrend7d?: Array<Record<string, any>>;
  message?: string;
};

type WalletDetailDrawerProps = {
  open: boolean;
  onClose: () => void;
  data?: WalletSummaryData | null;
  loading?: boolean;
  focusTitle?: string;
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="wallet-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function WalletDetailDrawer({ open, onClose, data, loading = false, focusTitle = "钱包详情" }: WalletDetailDrawerProps) {
  if (!open) return null;

  const wallet = data?.wallet || {};
  const plan = data?.plan || null;
  const logs = data?.balanceLogs || [];
  const recentRecharges = data?.recentRecharges || [];
  const recentConsumptions = data?.recentConsumptions || [];
  const trend = data?.spendTrend7d || [];
  const wallets = data?.wallets || [];
  const maxTrendAmount = Math.max(...trend.map((item) => Number(item.amountCny || 0)), 0);
  const isEmpty = !loading && data?.source === "empty";

  return (
    <div className="wallet-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="wallet-detail-drawer" role="dialog" aria-modal="true" aria-label="钱包详情" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="wallet-drawer-close" onClick={onClose}>×</button>
        <div className="wallet-detail-head">
          <span>WALLET DETAIL</span>
          <h2>{focusTitle}</h2>
          <p>查看当前钱包余额、充值记录、消费记录和余额变动。</p>
        </div>

        {loading ? (
          <div className="wallet-detail-loading">钱包数据同步中...</div>
        ) : isEmpty ? (
          <div className="wallet-detail-empty">
            <strong>暂无钱包数据</strong>
            <p>完成充值或兑换激活码后，这里会显示你的余额和相关流水。</p>
            <Link href="/recharge">立即充值</Link>
          </div>
        ) : (
          <>
            {data?.dashboardOverview ? (
              <>
            <div className="wallet-detail-metrics">
              <div><span>钱包余额</span><strong>{formatApiCredit(Number(wallet.balanceCny || 0))}</strong></div>
              <div><span>真实充值</span><strong>{formatRmb(Number(wallet.totalRechargedRmb || 0))}</strong></div>
              <div><span>累计消费</span><strong>{formatApiCredit(Number(wallet.usedQuotaCny || 0))}</strong></div>
              <div><span>使用进度</span><strong><LiveNumber value={Number(wallet.progressPercent || 0)} suffix="%" decimals={1} /></strong></div>
            </div>

            <section className="wallet-detail-section">
              <h3>资产构成</h3>
              <Row label="开始时间" value={formatWalletDate(plan?.startedAt)} />
              <Row label="到期时间" value={formatWalletDate(plan?.expiresAt)} />
              <Row label="可用余额" value={formatApiCredit(wallet.remainingQuotaCny)} />
              <Row label="累计兑换额度" value={formatApiCredit(Number(data?.wallet?.totalQuotaCny || 0))} />
              <Row label="累计赠送额度" value={formatApiCredit(Number(data?.token?.usedTokens || 0))} />
              <Row label="长期有效额度" value={formatApiCredit(Number(data?.wallet?.totalQuotaCny || 0) - Number(data?.wallet?.usedQuotaCny || 0))} />
            </section>

            <section className="wallet-detail-section">
              <h3>余额明细</h3>
              {wallets.length ? (
                <div className="wallet-pool-list">
                  {wallets.map((wallet: any) => (
                    <article key={wallet.type} className={wallet.locked ? "locked" : ""}>
                      <div>
                        <strong>{wallet.name}</strong>
                        <span>{wallet.locked ? "固定优先消耗" : "可切换"} · 优先级 {wallet.priority || "-"}</span>
                      </div>
                      <div>
                        <b>{wallet.balanceTokens ? formatWalletTokens(wallet.balanceTokens) : formatWalletCny(wallet.balanceCnyEquivalent)}</b>
                        <small>{wallet.expiresAt ? `${formatWalletDate(wallet.expiresAt)} 到期` : "长期有效"}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="wallet-detail-muted">暂无可用余额。</p>}
              <p className="wallet-detail-muted">系统会优先消耗会员赠送余额和会员专属余额，之后根据你选择的消耗优先级使用充值余额。</p>
            </section>

            <section className="wallet-detail-section">
              <h3>最近 7 天消耗趋势</h3>
              {maxTrendAmount > 0 ? (
                <div className="wallet-trend-bars">
                  {trend.map((item) => (
                    <div key={item.date} className="wallet-trend-item">
                      <i style={{ height: `${Math.max(12, (Number(item.amountCny || 0) / maxTrendAmount) * 100)}%` }} />
                      <span>{item.label}</span>
                      <b>{formatWalletCny(item.amountCny)}</b>
                    </div>
                  ))}
                </div>
              ) : <p className="wallet-detail-muted">暂无近 7 天真实消费趋势。</p>}
            </section>

            <section className="wallet-detail-section">
              <h3>最近充值记录</h3>
              {recentRecharges.length ? recentRecharges.map((item) => (
                <div key={item.id} className="wallet-log-row">
                  <div><strong>{item.title}</strong><span>{formatWalletDate(item.approvedAt || item.createdAt)}</span></div>
                  <b>{formatApiCredit(item.amountCny)}</b>
                </div>
              )) : <p className="wallet-detail-muted">暂无充值记录。</p>}
            </section>

            <section className="wallet-detail-section">
              <h3>最近消费记录</h3>
              {recentConsumptions.length ? recentConsumptions.map((item) => (
                <div key={item.id} className="wallet-log-row consume">
                  <div><strong>{item.model}</strong><span>{formatWalletTokens(item.tokens)} · {formatWalletDate(item.createdAt)}</span></div>
                  <b>-{formatApiCredit(item.amountCny)}</b>
                </div>
              )) : <p className="wallet-detail-muted">暂无消费记录。</p>}
            </section>

            <section className="wallet-detail-section">
              <h3>钱包流水</h3>
              {logs.length ? logs.map((item) => (
                <div key={`${item.type}-${item.id}`} className={`wallet-log-row ${item.amountCny < 0 ? "consume" : ""}`}>
                  <div><strong>{item.title}</strong><span>{formatWalletDate(item.approvedAt || item.createdAt)}</span></div>
                  <b>{item.amountCny < 0 ? "-" : ""}{formatApiCredit(Math.abs(Number(item.amountCny || 0)))}</b>
                </div>
              )) : <p className="wallet-detail-muted">暂无余额变动。</p>}
            </section>

            <div className="wallet-detail-actions">
              <Link href="/recharge">充值</Link>
              <Link href="/dashboard#dash-recent-calls">查看账单</Link>
              <Link href="/recharge">兑换激活码</Link>
            </div>
              </>
            ) : (
              <>
                <div className="wallet-detail-metrics">
                  <div><span>钱包余额</span><strong><LiveNumber value={Number(wallet.balanceCny || 0)} prefix="¥" decimals={2} /></strong></div>
                  <div><span>当前状态</span><strong>{plan?.planName || "普通钱包"}</strong></div>
                  <div><span>累计消费</span><strong><LiveNumber value={Number(wallet.usedQuotaCny || 0)} prefix="¥" decimals={2} /></strong></div>
                  <div><span>使用进度</span><strong><LiveNumber value={Number(wallet.progressPercent || 0)} suffix="%" decimals={1} /></strong></div>
                </div>
                <section className="wallet-detail-section">
                  <h3>钱包周期</h3>
                  <Row label="开始时间" value={formatWalletDate(plan?.startedAt)} />
                  <Row label="到期时间" value={formatWalletDate(plan?.expiresAt)} />
                  <Row label="可用余额" value={formatWalletCny(wallet.remainingQuotaCny)} />
                  <Row label="总余额" value={wallet.totalQuotaCny ? formatWalletCny(wallet.totalQuotaCny) : "暂无数据"} />
                  <Row label="已用余额" value={formatWalletTokens(data?.token?.usedTokens)} />
                </section>
                <section className="wallet-detail-section">
                  <h3>余额明细</h3>
                  {wallets.length ? (
                    <div className="wallet-pool-list">
                      {wallets.map((wallet: any) => (
                        <article key={wallet.type} className={wallet.locked ? "locked" : ""}>
                          <div>
                            <strong>{wallet.name}</strong>
                            <span>{wallet.locked ? "固定优先消耗" : "可切换"} · 优先级 {wallet.priority || "-"}</span>
                          </div>
                          <div>
                            <b>{wallet.balanceTokens ? formatWalletTokens(wallet.balanceTokens) : formatWalletCny(wallet.balanceCnyEquivalent)}</b>
                            <small>{wallet.expiresAt ? `${formatWalletDate(wallet.expiresAt)} 到期` : "长期有效"}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <p className="wallet-detail-muted">暂无可用余额。</p>}
                  <p className="wallet-detail-muted">系统会优先消耗会员赠送余额和会员专属余额，之后根据你选择的消耗优先级使用充值余额。</p>
                </section>
                <section className="wallet-detail-section">
                  <h3>最近 7 天消耗趋势</h3>
                  {maxTrendAmount > 0 ? (
                    <div className="wallet-trend-bars">
                      {trend.map((item) => (
                        <div key={item.date} className="wallet-trend-item">
                          <i style={{ height: `${Math.max(12, (Number(item.amountCny || 0) / maxTrendAmount) * 100)}%` }} />
                          <span>{item.label}</span>
                          <b>{formatWalletCny(item.amountCny)}</b>
                        </div>
                      ))}
                    </div>
                  ) : <p className="wallet-detail-muted">暂无近 7 天真实消费趋势。</p>}
                </section>
                <section className="wallet-detail-section">
                  <h3>最近充值记录</h3>
                  {recentRecharges.length ? recentRecharges.map((item) => (
                    <div key={item.id} className="wallet-log-row">
                      <div><strong>{item.title}</strong><span>{formatWalletDate(item.approvedAt || item.createdAt)}</span></div>
                      <b>{formatWalletCny(item.amountCny)}</b>
                    </div>
                  )) : <p className="wallet-detail-muted">暂无充值记录。</p>}
                </section>
                <section className="wallet-detail-section">
                  <h3>最近消费记录</h3>
                  {recentConsumptions.length ? recentConsumptions.map((item) => (
                    <div key={item.id} className="wallet-log-row consume">
                      <div><strong>{item.model}</strong><span>{formatWalletTokens(item.tokens)} · {formatWalletDate(item.createdAt)}</span></div>
                      <b>-{formatWalletCny(item.amountCny)}</b>
                    </div>
                  )) : <p className="wallet-detail-muted">暂无消费记录。</p>}
                </section>
                <section className="wallet-detail-section">
                  <h3>钱包流水</h3>
                  {logs.length ? logs.map((item) => (
                    <div key={`${item.type}-${item.id}`} className={`wallet-log-row ${item.amountCny < 0 ? "consume" : ""}`}>
                      <div><strong>{item.title}</strong><span>{formatWalletDate(item.approvedAt || item.createdAt)}</span></div>
                      <b>{item.amountCny < 0 ? "-" : ""}{formatWalletCny(Math.abs(Number(item.amountCny || 0)))}</b>
                    </div>
                  )) : <p className="wallet-detail-muted">暂无余额变动。</p>}
                </section>
                <div className="wallet-detail-actions">
                  <Link href="/recharge">充值</Link>
                  <Link href="/dashboard#dash-recent-calls">查看账单</Link>
                  <Link href="/recharge">兑换激活码</Link>
                </div>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
