import ProviderLogo from "@/components/model-market/ProviderLogo";

export default function ModelCard({ model, onAccess, creating, isAdmin }) {
  const avail = model.isAvailable;
  const comingSoon = model.isComingSoon;
  const badgeClass = avail ? "badge-success" : comingSoon ? "badge-muted" : "badge-danger";
  const btnLabel = creating ? "创建中..." : avail ? "创建 API Key" : comingSoon ? "即将开放" : "暂不可用";
  const reason = comingSoon
    ? "上游检测中，即将开放"
    : !avail
      ? "上游不可用，请选择其他模型"
      : "";

  return (
    <div className={`model-card-v2${avail ? "" : " unavailable"}`}>
      <div className="model-card-v2-top">
        <ProviderLogo providerId={model.providerId} size={30} variant="rounded" />
        <div className="model-card-v2-name-wrap">
          <strong className="model-card-v2-name">{model.displayName}</strong>
          <div className="model-card-v2-type-tags">
            {(model.typeTags || []).slice(0, 3).map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>
        <span className={`badge ${badgeClass}`}>{model.statusLabel}</span>
        {isAdmin && (
          <a href="/admin/models" className="btn-ghost btn-small" title="管理" style={{ fontSize: 10, padding: "2px 6px" }}>
            管理
          </a>
        )}
      </div>

      <p className="model-card-v2-desc">{model.description}</p>

      {((model.useCases || []).length > 0) && (
        <div className="model-card-v2-tags">
          {model.useCases.slice(0, 4).map((t) => (
            <span key={t} className="model-card-v2-tag-item">{t}</span>
          ))}
        </div>
      )}

      {avail && model.inputPrice != null ? (
        <div className="model-card-v2-pricing">
          <div className="model-card-v2-price-row">
            <span>输入</span><b>¥{model.inputPrice} / M tokens</b>
          </div>
          <div className="model-card-v2-price-row">
            <span>输出</span><b>¥{model.outputPrice} / M tokens</b>
          </div>
        </div>
      ) : (
        <p className="model-card-v2-desc">价格待配置</p>
      )}

      <div className="model-card-v2-actions">
        <button type="button" className="btn-primary btn-small"
                disabled={!avail || !!creating} onClick={onAccess}>
          {btnLabel}
        </button>
        <button type="button" className="btn-ghost btn-small"
                onClick={() => navigator.clipboard.writeText(model.publicModelId)}>
          复制 ID
        </button>
      </div>

      {!avail && reason && (
        <p className="model-card-v2-reason">{reason}</p>
      )}
    </div>
  );
}
