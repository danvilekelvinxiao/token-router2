import { useState } from "react";
import Link from "next/link";
import ModelLogo from "@/components/ModelLogo";
import TokenMarketSparkline from "@/components/dashboard/token-market-sparkline";
import { formatChangeCny, formatRequestCount, formatSmallCny, formatToken, formatTrendPercent } from "@/lib/format/number-format";

type TokenMarketDetailDrawerProps = {
  model: Record<string, any> | null;
  onClose: () => void;
};

function formatPrice(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${formatSmallCny(number)} / M Token` : "数据同步中";
}

function recommendation(model: Record<string, any>) {
  if (Number(model.savedPercent || 0) >= 20) {
    return `FlowAPI 当前为你节省了 ${Number(model.savedPercent || 0).toFixed(1)}%，建议继续使用该模型处理高价值任务。`;
  }
  if (Number(model.spendChangePercent || 0) > 30) {
    return "该模型最近消耗增长明显，请确认是否用于高价值任务。";
  }
  if (Number(model.currentSpendCny || 0) > 10) {
    return "该模型成本较高，简单任务可考虑切换到 DeepSeek / Qwen 等低成本模型。";
  }
  return "当前模型使用成本处于可控状态，可继续观察 Token 趋势。";
}

export default function TokenMarketDetailDrawer({ model, onClose }: TokenMarketDetailDrawerProps) {
  const [copied, setCopied] = useState(false);
  if (!model) return null;
  const hasOfficialPricing = Number(model.officialSpendCny || 0) > 0 || Number(model.officialInputPricePerM || 0) > 0;

  const copyModelId = async () => {
    try {
      await navigator.clipboard.writeText(model.modelId || model.model || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="token-market-drawer-layer" role="presentation" onClick={onClose}>
      <aside className="token-market-drawer" role="dialog" aria-modal="true" aria-label="模型行情详情" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="token-market-drawer-close" onClick={onClose}>关闭</button>
        <div className="token-market-drawer-head">
          <ModelLogo model={model.modelId || model.model} provider={model.provider} size={46} />
          <div>
            <span>模型行情详情</span>
            <strong>{model.displayName || model.model}</strong>
            <p>{model.provider || "FlowAPI"} · {model.modelId}</p>
          </div>
        </div>

        <div className="token-market-drawer-grid">
          <div><span>官方输入价格</span><strong>{formatPrice(model.officialInputPricePerM)}</strong></div>
          <div><span>官方输出价格</span><strong>{formatPrice(model.officialOutputPricePerM)}</strong></div>
          <div><span>FlowAPI 输入价格</span><strong>{formatPrice(model.flowapiInputPricePerM)}</strong></div>
          <div><span>FlowAPI 输出价格</span><strong>{formatPrice(model.flowapiOutputPricePerM)}</strong></div>
          <div><span>最近 24h Token</span><strong>{formatToken(model.tokens24h ?? model.currentTokens, { compact: false })}</strong></div>
          <div><span>最近 7 天 Token</span><strong>{formatToken(model.tokens7d ?? model.currentTokens, { compact: false })}</strong></div>
          <div><span>最近 30 天 Token</span><strong>{formatToken(model.tokens30d ?? model.currentTokens, { compact: false })}</strong></div>
          <div><span>请求次数</span><strong>{formatRequestCount(model.currentRequests)}</strong></div>
          <div><span>总消费金额</span><strong>{formatSmallCny(model.currentSpendCny)}</strong></div>
          <div><span>变化金额</span><strong>{formatChangeCny(model.spendChangeCny)}</strong></div>
          <div><span>变化百分比</span><strong>{formatTrendPercent(model.spendChangePercent)}</strong></div>
          <div><span>总节省金额</span><strong>{hasOfficialPricing ? formatSmallCny(model.savedAmountCny) : "数据同步中"}</strong></div>
        </div>

        <div className="token-market-drawer-chart">
          <div>
            <span>使用趋势图</span>
            <b>{Number(model.tokenChangePercent || 0) >= 0 ? "上涨" : "下降"} {Math.abs(Number(model.tokenChangePercent || 0)).toFixed(1)}%</b>
          </div>
          <TokenMarketSparkline points={model.trend || []} metric="token" color={Number(model.tokenChangePercent || 0) >= 0 ? "green" : "red"} height={104} />
        </div>

        <div className="token-market-drawer-chart">
          <div>
            <span>官方价格 vs FlowAPI 价格趋势图</span>
            <b>{hasOfficialPricing ? "价差可追踪" : "价格同步中"}</b>
          </div>
          <TokenMarketSparkline points={model.trend || []} metric="flowapi_price" color="purple" height={96} />
        </div>

        <div className="token-market-drawer-chart">
          <div>
            <span>调用流水</span>
            <b>按模型核账</b>
          </div>
          <p>可在 API 调用流水中查看该模型每一次调用的 Token、官方价预估、FlowAPI 实际扣费和扣费来源。</p>
        </div>

        <div className="token-market-drawer-note">
          <span>推荐操作</span>
          <p>{recommendation(model)}</p>
        </div>

        <div className="token-market-drawer-actions">
          <button type="button" onClick={copyModelId}>{copied ? "已复制" : "复制 Model ID"}</button>
          <Link href={`/models?model=${encodeURIComponent(model.modelId || model.model || "")}`}>立即接入</Link>
          <Link href="/guide">查看帮助指南</Link>
          <Link href="/models?category=low-cost">切换到更低成本模型</Link>
        </div>
      </aside>
    </div>
  );
}
