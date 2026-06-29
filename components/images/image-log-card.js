/* eslint-disable @next/next/no-img-element */
function StatusTag({ status }) {
  const label = status === "success"
    ? "成功"
    : status === "partial_success"
      ? "部分成功"
      : status === "retrying"
        ? "重试中"
        : "失败";
  return <span className={`image-log-status status-${status || "failed"}`}>{label}</span>;
}

export default function ImageLogCard({
  item,
  onReuse,
  onCopyLink,
  compact = false,
}) {
  return (
    <article className={`image-log-card ${compact ? "is-compact" : ""}`}>
      <div className="image-log-card-head">
        <div>
          <div className="image-log-card-topline">
            <span>{item.modelDisplayName}</span>
            <StatusTag status={item.status} />
          </div>
          <h3>{item.promptPreview || "图片任务"}</h3>
          <p>{item.requestId}</p>
        </div>
        <div className="image-log-metrics">
          <strong>-{Number(item.tokenCost || 0).toFixed(1)} Token</strong>
          <span>-${Number(item.moneyCost || 0).toFixed(2)}</span>
        </div>
      </div>

      {Array.isArray(item.inputImageUrls) && item.inputImageUrls.length ? (
        <div className="image-log-input-strip">
          {item.inputImageUrls.slice(0, 3).map((src, index) => (
            <img key={`${item.id}-input-${index}`} src={src} alt={`输入图 ${index + 1}`} />
          ))}
        </div>
      ) : null}

      <div className="image-log-output-grid">
        {(item.outputImageUrls || []).map((src, index) => (
          <a key={`${item.id}-output-${index}`} href={src} target="_blank" rel="noreferrer" className="image-log-output-tile">
            <img src={src} alt={`生成结果 ${index + 1}`} />
          </a>
        ))}
      </div>

      <div className="image-log-meta-grid">
        <span>类型：{item.mode === "image_to_image" ? "图生图 / 改图" : "文生图"}</span>
        <span>张数：{item.outputImageCount || 0}</span>
        <span>比例：{item.aspectRatio || "1:1"}</span>
        <span>质量：{item.quality || "standard"}</span>
        <span>耗时：{item.latencyMs || 0} ms</span>
        <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
      </div>

      {item.errorMessage ? <div className="image-log-error">{item.errorMessage}</div> : null}

      <div className="image-log-actions">
        <button type="button" onClick={() => onReuse?.(item)}>再生成一次</button>
        <button type="button" onClick={() => onReuse?.(item, true)}>复用参数</button>
        <button type="button" onClick={() => onCopyLink?.(item.outputImageUrls?.[0] || "")}>复制链接</button>
        <a href={`/dashboard/logs?requestId=${encodeURIComponent(item.requestId)}`}>查看日志</a>
      </div>
    </article>
  );
}
