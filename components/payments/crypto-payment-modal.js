import { useEffect, useState } from "react";

function PaymentQrPreview({ qrSrc, qrValue, title }) {
  const [dynamicQrSrc, setDynamicQrSrc] = useState("");
  const [missing, setMissing] = useState(false);
  const directSrc = qrSrc ? `${qrSrc}${qrSrc.includes("?") ? "&" : "?"}v=20260602-crypto` : "";

  useEffect(() => {
    let cancelled = false;
    if (!qrValue) return undefined;
    import("qrcode")
      .then((mod) => mod.toDataURL(qrValue, { margin: 1, width: 360 }))
      .then((url) => {
        if (!cancelled) setDynamicQrSrc(url);
      })
      .catch(() => {
        if (!cancelled) setDynamicQrSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [qrValue]);

  if (dynamicQrSrc) {
    return <img src={dynamicQrSrc} alt={`${title}二维码`} className="payment-modal-qr-image" />;
  }

  if (!missing && directSrc) {
    return <img src={directSrc} alt={`${title}二维码`} className="payment-modal-qr-image" onError={() => setMissing(true)} />;
  }

  return <div className="payment-modal-empty">二维码同步中</div>;
}

export default function CryptoPaymentModal({
  open,
  title,
  amountLabel,
  cnyAmountLabel,
  orderNumber,
  token,
  network,
  countdown,
  address,
  qrSrc,
  qrValue,
  notice,
  statusLabel,
  paymentRef,
  onPaymentRefChange,
  manualFallback,
  copied,
  onCopy,
  onClose,
  onRefresh,
  onConfirm,
  processing,
  checkoutUrl,
  error,
}) {
  if (!open) return null;

  return (
    <div className="payment-modal-backdrop" role="presentation">
      <div className="payment-modal-shell payment-crypto-modal" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="payment-modal-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className="payment-modal-header">
          <div>
            <span className="payment-modal-kicker">CRYPTO CHECKOUT</span>
            <h2>{title}</h2>
            <p>请按指定币种与网络完成转账，系统会自动轮询到账状态。</p>
          </div>
          <div className="payment-modal-countdown">
            <span>{manualFallback ? "人工确认" : "剩余时间"}</span>
            <strong>{manualFallback ? "待核对" : countdown}</strong>
          </div>
        </div>

        <div className="payment-modal-summary-grid crypto">
          <div className="payment-modal-amount-card">
            <span>应付数量</span>
            <strong>{amountLabel}</strong>
            <small>订单金额 {cnyAmountLabel}</small>
          </div>
          <div className="payment-modal-meta-card">
            <span>订单号</span>
            <div className="payment-modal-inline-copy">
              <code>{orderNumber}</code>
              <button type="button" className="btn-secondary" onClick={() => onCopy(orderNumber)}>
                {copied === orderNumber ? "已复制" : "复制"}
              </button>
            </div>
            <div className="payment-modal-network-line">
              <em>{token}</em>
              <em>{network}</em>
              <em>{statusLabel}</em>
            </div>
          </div>
        </div>

        {notice ? <div className={`payment-modal-banner ${manualFallback ? "warning" : ""}`}>{notice}</div> : null}
        {error ? <div className="payment-modal-banner danger">{error}</div> : null}

        <div className="payment-modal-qr-layout crypto">
          <div className="payment-modal-qr-card">
            <div className="payment-modal-qr-head">
              <strong>扫码或复制地址付款</strong>
              <span>{token} · {network}</span>
            </div>
            <PaymentQrPreview qrSrc={qrSrc} qrValue={qrValue} title={title} />
          </div>

          <div className="payment-modal-side-card">
            <strong>收款地址</strong>
            <div className="payment-modal-address-card">
              <code>{address}</code>
              <button type="button" className="btn-secondary" onClick={() => onCopy(address)}>
                {copied === address ? "已复制" : "复制地址"}
              </button>
            </div>
            <ul>
              <li>请确认币种和网络完全一致。</li>
              <li>仅接收对应链上的资产，选错链会导致资产丢失。</li>
              <li>{manualFallback ? "当前链路需人工确认，请提交转账信息。" : "链上确认后自动到账，通常几分钟内完成。"}</li>
            </ul>

            {manualFallback ? (
              <label className="payment-modal-input">
                <span>转账哈希 / 备注</span>
                <input
                  value={paymentRef}
                  onChange={(event) => onPaymentRefChange(event.target.value)}
                  placeholder="填写 TxHash、付款地址后四位或备注"
                />
              </label>
            ) : null}
          </div>
        </div>

        <div className="payment-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            返回修改
          </button>
          {checkoutUrl ? (
            <a href={checkoutUrl} target="_blank" rel="noreferrer" className="btn-secondary payment-modal-link-button">
              打开收银台
            </a>
          ) : null}
          <button type="button" className="btn-secondary" disabled={processing} onClick={onRefresh}>
            {processing ? "查询中..." : "刷新支付状态"}
          </button>
          <button type="button" className="btn-primary" disabled={processing} onClick={onConfirm}>
            {manualFallback ? (processing ? "提交中..." : "提交人工确认") : (processing ? "查询中..." : "我已完成转账")}
          </button>
        </div>
      </div>
    </div>
  );
}
