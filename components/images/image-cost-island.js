export default function ImageCostIsland({ notice, onClose }) {
  if (!notice) return null;
  const hasCost = notice.tokenCost !== undefined && notice.moneyCost !== undefined;

  return (
    <div className={`image-cost-island ${notice.type === "error" ? "is-error" : "is-success"}`} role="status" aria-live="polite">
      <div className="image-cost-island-top">
        <strong>{notice.title}</strong>
        <button type="button" onClick={onClose} aria-label="关闭提示">×</button>
      </div>
      <div className="image-cost-island-main">
        {notice.type === "error" ? (
          <span>{notice.message}</span>
        ) : hasCost ? (
          <>
            <span>-{notice.tokenCost} Token</span>
            <span>-${notice.moneyCost}</span>
          </>
        ) : (
          <span>{notice.message || "操作成功"}</span>
        )}
      </div>
      <div className="image-cost-island-foot">
        {notice.type === "error"
          ? notice.requestId
          : hasCost
            ? `模型：${notice.modelDisplayName}${notice.balanceAfterText ? ` · 余额 ${notice.balanceAfterText}` : ""}`
            : (notice.modelDisplayName || "")}
      </div>
    </div>
  );
}
