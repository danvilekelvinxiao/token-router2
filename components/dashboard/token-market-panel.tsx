import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LiveNumber from "@/components/ui/live-number";
import TokenMarketTabs from "@/components/dashboard/token-market-tabs";
import TokenMarketTable from "@/components/dashboard/token-market-table";
import TokenMarketDetailDrawer from "@/components/dashboard/token-market-detail-drawer";
import { formatTokenCompact } from "@/lib/format/number-format";

function getStoredSessionToken() {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem("flowapi_customer");
    const parsed = stored ? JSON.parse(stored) : null;
    return parsed?.sessionToken || "";
  } catch {
    return "";
  }
}

function filterByCategory(models: Array<Record<string, any>>, category: string) {
  const rows = [...models];
  if (category === "up") return rows.filter((item) => Number(item.tokenChange || 0) > 0).sort((a, b) => Number(b.tokenChange || 0) - Number(a.tokenChange || 0));
  if (category === "down") return rows.filter((item) => Number(item.tokenChange || 0) < 0).sort((a, b) => Number(a.tokenChange || 0) - Number(b.tokenChange || 0));
  if (category === "cost") return rows.sort((a, b) => Number(b.currentSpendCny || 0) - Number(a.currentSpendCny || 0));
  if (category === "value") return rows.sort((a, b) => Number(b.savedPercent || 0) - Number(a.savedPercent || 0));
  if (category === "member") return rows.filter((item) => (item.statusTags || []).includes("会员专属"));
  return rows.filter((item) => (item.statusTags || []).includes("热门") || Number(item.currentTokens || 0) > 0);
}

function formatSummaryCnyNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSummaryInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.abs(number)).toLocaleString("zh-CN");
}

function TokenMarketSummaryValue({
  prefix,
  value,
  unit,
  emptyText = "数据同步中",
}: {
  prefix?: string;
  value: string | null;
  unit?: string;
  emptyText?: string;
}) {
  if (!value) {
    return <strong className="token-market-summary-value is-empty">{emptyText}</strong>;
  }

  return (
    <strong className="token-market-summary-value">
      {prefix ? <span className="token-market-summary-prefix">{prefix}</span> : null}
      <LiveNumber className="token-market-summary-live" value={value} />
      {unit ? <span className="token-market-summary-unit">{unit}</span> : null}
    </strong>
  );
}

export default function TokenMarketPanel() {
  const [category, setCategory] = useState("hot");
  const [period, setPeriod] = useState("24h");
  const [metric, setMetric] = useState("token");
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sessionToken = getStoredSessionToken();
    fetch(`/api/analytics/model-market?period=${period}&metric=${metric}`, {
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    })
      .then((response) => response.json())
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch(() => { if (!cancelled) setData({ source: "empty", models: [], message: "数据同步中" }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period, metric]);

  const models = useMemo(() => (Array.isArray(data?.models) ? data.models : []), [data]);
  const visibleModels = useMemo(() => filterByCategory(models, category), [models, category]);
  const summary = useMemo(() => models.reduce((acc, item) => ({
    tokens: acc.tokens + Number(item.currentTokens || 0),
    spend: acc.spend + Number(item.currentSpendCny || 0),
    requests: acc.requests + Number(item.currentRequests || 0),
    saving: acc.saving + Number(item.savedAmountCny || 0),
  }), { tokens: 0, spend: 0, requests: 0, saving: 0 }), [models]);
  const hasData = models.length > 0;
  const hasOfficialPricing = models.some((item) => Number(item.officialSpendCny || 0) > 0 || Number(item.officialInputPricePerM || 0) > 0);

  return (
    <section className="dash3-section token-market-panel">
      <div className="token-market-head">
        <div>
          <span>AI TOKEN MARKET</span>
          <h2>AI Token 行情面板</h2>
          <p>像观察股票和加密货币一样，查看不同模型的官方价格、FlowAPI 实际价格、Token 消耗和趋势变化。</p>
        </div>
        <div className="token-market-source">
          <i />
          {data?.source === "real" ? "真实调用数据" : data?.source === "local-demo" ? "本地演示数据" : "数据同步中"}
        </div>
      </div>

      <TokenMarketTabs
        category={category}
        period={period}
        metric={metric}
        onCategoryChange={setCategory}
        onPeriodChange={setPeriod}
        onMetricChange={setMetric}
      />

      {hasData ? (
        <>
          <div className="token-market-summary">
            <article>
              <span>当前周期 Token</span>
              <TokenMarketSummaryValue value={formatTokenCompact(summary.tokens)} />
              <p>模型调用资产流量</p>
            </article>
            <article>
              <span>FlowAPI 实际消费</span>
              <TokenMarketSummaryValue prefix="¥" value={formatSummaryCnyNumber(summary.spend)} />
              <p>按真实账单扣费统计</p>
            </article>
            <article>
              <span>请求次数</span>
              <TokenMarketSummaryValue value={formatSummaryInteger(summary.requests)} unit="次" />
              <p>当前周期模型调用</p>
            </article>
            <article>
              <span>节省金额</span>
              <TokenMarketSummaryValue prefix="¥" value={hasOfficialPricing ? formatSummaryCnyNumber(summary.saving) : null} emptyText="同步中" />
              <p>{hasOfficialPricing ? "官方价与 FlowAPI 价差" : "等待后台官方价格配置"}</p>
            </article>
          </div>

          {visibleModels.length ? (
            <TokenMarketTable models={visibleModels} metric={metric} onSelectModel={setSelectedModel} />
          ) : (
            <div className="token-market-empty compact">
              <strong>当前分类暂无模型行情</strong>
              <p>切换时间范围或维度后，系统会按真实调用数据重新排序。</p>
            </div>
          )}
        </>
      ) : (
        <div className="token-market-empty">
          <strong>{loading ? "模型行情同步中" : "暂无模型行情数据"}</strong>
          <p>完成真实模型调用后，系统会根据官方价格、FlowAPI 实际价格和 Token 消耗自动生成模型行情。</p>
          <div>
            <Link href="/api-management">创建 API Key</Link>
            <Link href="/models">去大模型接入</Link>
            <Link href="/guide">查看帮助指南</Link>
          </div>
        </div>
      )}

      <TokenMarketDetailDrawer model={selectedModel} onClose={() => setSelectedModel(null)} />
    </section>
  );
}
