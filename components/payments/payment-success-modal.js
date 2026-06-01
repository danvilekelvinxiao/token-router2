export default function PaymentSuccessModal({
  open,
  title,
  description,
  orderNumber,
  methodName,
  amountLabel,
  onViewOrders,
  onGoDashboard,
  onContinue,
}) {
  if (!open) return null;

  return (
    <div className="payment-modal-backdrop" role="presentation">
      <div className="payment-modal-shell payment-success-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="payment-success-icon" aria-hidden="true">✓</div>
        <span className="payment-modal-kicker">PAYMENT SUCCESS</span>
        <h2>{title}</h2>
        <p>{description}</p>

        <div className="payment-success-grid">
          <div>
            <span>订单号</span>
            <strong>{orderNumber}</strong>
          </div>
          <div>
            <span>支付方式</span>
            <strong>{methodName}</strong>
          </div>
          <div>
            <span>到账金额</span>
            <strong>{amountLabel}</strong>
          </div>
        </div>

        <div className="payment-modal-actions">
          <button type="button" className="btn-secondary" onClick={onViewOrders}>查看账单记录</button>
          <button type="button" className="btn-secondary" onClick={onGoDashboard}>返回数据面板</button>
          <button type="button" className="btn-primary" onClick={onContinue}>继续充值</button>
        </div>
      </div>
    </div>
  );
}
