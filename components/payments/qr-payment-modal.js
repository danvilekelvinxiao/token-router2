import { useEffect, useState } from "react";

function PaymentQrPreview({ qrSrc, qrValue, methodName }) {
  const [dynamicQrSrc, setDynamicQrSrc] = useState("");
  const [missing, setMissing] = useState(false);
  const directSrc = qrSrc ? `${qrSrc}${qrSrc.includes("?") ? "&" : "?"}v=20260602-modal` : "";

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
    return <img src={dynamicQrSrc} alt={`${methodName}二维码`} className="payment-modal-qr-image" />;
  }

  if (!missing && directSrc) {
    return <img src={directSrc} alt={`${methodName}二维码`} className="payment-modal-qr-image" onError={() => setMissing(true)} />;
  }

  return <div className="payment-modal-empty">支付通道加载中</div>;
}

export default function QrPaymentModal({
  open,
  title,
  amountLabel,
  orderNumber,
  methodName,
  qrSrc,
  qrValue,
  hint,
  notice,
  statusLabel,
  paymentRef,
  onPaymentRefChange,
  onConfirm,
  onClose,
  onCopy,
  copied,
  error,
  processing,
  confirmLabel,
}) {
  if (!open) return null;

  return (
    <div className="payment-modal-backdrop" role="presentation">
      <div className="payment-modal-shell payment-qr-modal" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="payment-modal-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className="payment-modal-header">
          <div>
            <span className="payment-modal-kicker">SCAN TO PAY</span>
            <h2>{title}</h2>
            <p>{hint}</p>
          </div>
          <span className="payment-modal-status-pill">{statusLabel}</span>
        </div>

        <div className="payment-modal-summary-grid">
          <div className="payment-modal-amount-card">
            <span>应付金额</span>
            <strong>{amountLabel}</strong>
          </div>
          <div className="payment-modal-meta-card">
            <span>订单号</span>
            <div className="payment-modal-inline-copy">
              <code>{orderNumber}</code>
              <button type="button" className="btn-secondary" onClick={() => onCopy(orderNumber)}>
                {copied === orderNumber ? "已复制" : "复制"}
              </button>
            </div>
          </div>
        </div>

        {notice ? <div className="payment-modal-banner">{notice}</div> : null}
        {error ? <div className="payment-modal-banner danger">{error}</div> : null}

        <div className="payment-modal-qr-layout">
          <div className="payment-modal-qr-card">
            <div className="payment-modal-qr-head">
              <strong>请扫码支付</strong>
              <span>{methodName}</span>
            </div>
            <PaymentQrPreview qrSrc={qrSrc} qrValue={qrValue} methodName={methodName} />
          </div>

          <div className="payment-modal-side-card">
            <strong>到账说明</strong>
            <ul>
              <li>请使用对应支付 App 扫码。</li>
              <li>完成支付后填写备注，方便系统或人工核对。</li>
              <li>到账后会自动更新余额或进入人工确认。</li>
            </ul>

            <label className="payment-modal-input">
              <span>付款备注 / 订单号</span>
              <input
                value={paymentRef}
                onChange={(event) => onPaymentRefChange(event.target.value)}
                placeholder="填写微信 / 支付宝备注、付款流水或昵称"
              />
            </label>
          </div>
        </div>

        <div className="payment-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            返回修改
          </button>
          <button type="button" className="btn-primary" disabled={processing} onClick={onConfirm}>
            {processing ? "提交中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
