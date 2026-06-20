
export function DetailRows({ rows = [] }) {
  if (!rows.length) {
    return <div className="card-detail-empty">—</div>;
  }
  return (
    <div className="card-detail-rows">
      {rows.map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value || "-"}</strong>
          {row.note ? <small>{row.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

export function DetailTable({ columns = [], rows = [] }) {
  if (!rows.length) {
    return <div className="card-detail-empty">—</div>;
  }
  return (
    <div className="card-detail-table-wrap">
      <table className="card-detail-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `${row.time || row.date || "row"}-${index}`}>
              {columns.map((column) => <td key={column.key}>{row[column.key] ?? "-"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CardDetailModal({
  open,
  onClose,
  onOpenChange,
  title,
  description,
  badge,
  updatedAt = "刚刚更新",
  sections = [],
  actions,
}) {
  if (!open) return null;
  const handleClose = () => {
    onOpenChange?.(false);
    onClose?.();
  };
  return (
    <div className="card-detail-backdrop" onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}>
      <section className="card-detail-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="card-detail-header">
          <div>
            {badge ? <span className="card-detail-badge">{badge}</span> : null}
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
            <small>{updatedAt}</small>
          </div>
          <button type="button" onClick={handleClose} aria-label="关闭">×</button>
        </header>

        <div className="card-detail-body">
          {sections.map((section) => (
            <section key={section.title} className="card-detail-section">
              <h3>{section.title}</h3>
              {section.content}
            </section>
          ))}
        </div>

        <footer className="card-detail-footer">
          <div>{actions}</div>
        </footer>
      </section>
    </div>
  );
}
