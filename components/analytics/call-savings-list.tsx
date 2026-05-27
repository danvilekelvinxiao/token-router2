import { useState } from "react";
import ModelLogo from "@/components/ModelLogo";
import { formatSmallCny } from "@/lib/analytics/savings";

type CallSaving = {
  id: string;
  createdAt: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  officialInputPricePerM: number;
  officialOutputPricePerM: number;
  flowapiInputPricePerM: number;
  flowapiOutputPricePerM: number;
  officialCostCny: number;
  actualCostCny: number;
  savedAmountCny: number;
  savedPercent: number;
  requestIp?: string;
  status?: string;
  deductionBreakdown?: Array<{ walletName?: string; walletType?: string; tokensDeducted?: number; amountCnyDeducted?: number }>;
  deductionSource?: string;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function CallSavingsList({ items = [] }: { items?: CallSaving[] }) {
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState("");
  const visibleItems = expanded ? items : items.slice(0, 5);

  if (!items.length) {
    return (
      <div className="savings-empty-block">
        <strong>暂无调用节省流水</strong>
        <span>完成真实调用后，这里会展示每一笔调用的官方预估费用、实际费用和节省金额。</span>
      </div>
    );
  }

  return (
    <div className="call-savings-list">
      {visibleItems.map((item) => {
        const open = openId === item.id;
        const deductionLabel = item.deductionBreakdown?.length
          ? item.deductionBreakdown.map((part) => {
              const tokenText = Number(part.tokensDeducted || 0) > 0 ? `${Number(part.tokensDeducted || 0).toLocaleString()} Token` : "";
              const amountText = Number(part.amountCnyDeducted || 0) > 0 ? formatSmallCny(part.amountCnyDeducted) : "";
              return `${part.walletName || part.walletType || "额度"}${tokenText || amountText ? `：${tokenText || amountText}` : ""}`;
            }).join(" · ")
          : item.deductionSource || "扣费来源同步中";
        return (
          <article key={item.id} className={`call-savings-item ${open ? "open" : ""}`}>
            <button type="button" className="call-savings-row" onClick={() => setOpenId(open ? "" : item.id)}>
              <time>{formatTime(item.createdAt)}</time>
              <span className="call-savings-model">
                <ModelLogo model={item.model} provider={item.provider} size={24} />
                <b>{item.model}</b>
              </span>
              <span>{Number(item.inputTokens || 0).toLocaleString()} / {Number(item.outputTokens || 0).toLocaleString()} Token</span>
              <b>{formatSmallCny(item.officialCostCny)}</b>
              <b>{formatSmallCny(item.actualCostCny)}</b>
              <strong className={Number(item.savedAmountCny || 0) > 0 ? "saving-positive" : "saving-neutral"}>
                {Number(item.savedAmountCny || 0) > 0 ? formatSmallCny(item.savedAmountCny) : "未节省"}
              </strong>
              <em>{Number(item.savedPercent || 0).toFixed(1)}%</em>
            </button>
            {open ? (
              <div className="call-savings-detail">
                <h4>本次调用费用计算</h4>
                <div className="call-savings-detail-grid">
                  <div><span>官方价格</span><b>输入 {formatSmallCny(item.officialInputPricePerM)} / M Token</b><b>输出 {formatSmallCny(item.officialOutputPricePerM)} / M Token</b></div>
                  <div><span>FlowAPI 价格</span><b>输入 {formatSmallCny(item.flowapiInputPricePerM)} / M Token</b><b>输出 {formatSmallCny(item.flowapiOutputPricePerM)} / M Token</b></div>
                  <div><span>Token 用量</span><b>输入 {Number(item.inputTokens || 0).toLocaleString()} Token</b><b>输出 {Number(item.outputTokens || 0).toLocaleString()} Token</b></div>
                  <div><span>状态</span><b>{item.status || "success"}</b><b>IP：{item.requestIp || "-"}</b></div>
                  <div><span>扣费来源</span><b>{deductionLabel}</b></div>
                </div>
                <p>官方预估费用：({item.inputTokens} / 1M × {formatSmallCny(item.officialInputPricePerM)}) + ({item.outputTokens} / 1M × {formatSmallCny(item.officialOutputPricePerM)}) = <b>{formatSmallCny(item.officialCostCny)}</b></p>
                <p>FlowAPI 实际费用：({item.inputTokens} / 1M × {formatSmallCny(item.flowapiInputPricePerM)}) + ({item.outputTokens} / 1M × {formatSmallCny(item.flowapiOutputPricePerM)})，最终账单 = <b>{formatSmallCny(item.actualCostCny)}</b></p>
                <p>本次节省：官方预估费用 - FlowAPI 实际费用 = <b>{formatSmallCny(item.savedAmountCny)}</b></p>
                <p>节省比例：节省金额 / 官方预估费用 = <b>{Number(item.savedPercent || 0).toFixed(1)}%</b></p>
                <small>本系统按照 Token 用量计算费用，节省金额为基于官方公开价格和 FlowAPI 实际价格的估算结果，最终以平台账单为准。</small>
              </div>
            ) : null}
          </article>
        );
      })}
      {items.length > 5 ? (
        <button type="button" className="savings-expand-btn" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "收起" : `展开全部 ${items.length} 条`}
        </button>
      ) : null}
    </div>
  );
}
