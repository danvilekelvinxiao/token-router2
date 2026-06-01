export default function PaymentLaunchModal({
  open,
  title,
  description,
  progressLabel,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="payment-modal-backdrop" role="presentation">
      <div className="payment-modal-shell payment-launch-modal" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="payment-modal-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <span className="payment-modal-kicker">PAYMENT FLOW</span>
        <h2>{title}</h2>
        <p>{description}</p>

        <div className="payment-launch-progress" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="payment-launch-line" aria-hidden="true">
          <i />
        </div>
        <strong>{progressLabel}</strong>
      </div>
    </div>
  );
}
