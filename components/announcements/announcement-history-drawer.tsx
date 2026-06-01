/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";

type HistoryDrawerProps = {
  open: boolean;
  onClose: () => void;
};

type AnnouncementItem = {
  id: string;
  type?: string;
  title?: string;
  summary?: string;
  content?: string;
  pinned?: boolean;
  publishedAt?: string;
};

function formatTime(value?: string) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AnnouncementHistoryDrawer({ open, onClose }: HistoryDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [expandedId, setExpandedId] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/announcements?page=1&pageSize=30")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data?.announcements) ? data.announcements : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="announcement-history-layer" role="presentation" onClick={onClose}>
      <aside className="announcement-history-drawer" role="dialog" aria-modal="true" aria-label="历史系统公告" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>历史系统公告</strong>
          <button type="button" onClick={onClose}>关闭</button>
        </header>
        {loading ? <p className="history-empty">正在加载公告...</p> : null}
        {!loading && items.length === 0 ? <p className="history-empty">暂无历史公告</p> : null}
        {!loading && items.length > 0 ? (
          <div className="history-list">
            {items.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <article key={item.id} className="history-item">
                  <button type="button" className="history-item-button" onClick={() => setExpandedId(expanded ? "" : item.id)}>
                    <span className="history-item-head">
                      <em>{item.type || "系统更新"}</em>
                      {item.pinned ? <b>置顶</b> : null}
                    </span>
                    <strong>{item.title || "系统公告"}</strong>
                    <small>{formatTime(item.publishedAt)}</small>
                    <p>{item.summary || item.content || "暂无摘要"}</p>
                  </button>
                  {expanded ? <div className="history-item-content">{item.content || item.summary || "暂无详情"}</div> : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </aside>
      <style jsx>{`
        .announcement-history-layer {
          position: fixed;
          inset: 0;
          z-index: 1800;
          display: flex;
          justify-content: flex-end;
          background: rgba(2, 6, 23, 0.56);
          backdrop-filter: blur(10px);
        }
        .announcement-history-drawer {
          width: min(540px, 100vw);
          height: 100%;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 12px;
          padding: 20px;
          border-left: 1px solid var(--dash-border, rgba(148, 163, 184, 0.32));
          background: var(--dash-bg, #0b1120);
          color: var(--dash-text, #e5e7eb);
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        header strong {
          font-size: 20px;
          font-weight: 900;
        }
        header button {
          min-height: 36px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.32));
          background: var(--dash-card-bg, rgba(15, 23, 42, 0.5));
          color: inherit;
          font-weight: 800;
        }
        .history-empty {
          margin: 0;
          color: var(--dash-sub, #94a3b8);
        }
        .history-list {
          overflow: auto;
          display: grid;
          gap: 12px;
          padding-right: 4px;
        }
        .history-item {
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.32));
          border-radius: 14px;
          background: var(--dash-card-bg, rgba(15, 23, 42, 0.5));
          overflow: hidden;
        }
        .history-item-button {
          width: 100%;
          text-align: left;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 14px;
          display: grid;
          gap: 6px;
        }
        .history-item-head {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .history-item-head em,
        .history-item-head b {
          font-style: normal;
          font-size: 12px;
          font-weight: 900;
          border-radius: 999px;
          padding: 3px 8px;
        }
        .history-item-head em {
          background: rgba(99, 102, 241, 0.16);
          color: #818cf8;
        }
        .history-item-head b {
          background: rgba(16, 185, 129, 0.16);
          color: #34d399;
        }
        .history-item strong {
          font-size: 16px;
          line-height: 1.35;
        }
        .history-item small {
          color: var(--dash-sub, #94a3b8);
          font-size: 12px;
        }
        .history-item p {
          margin: 0;
          color: var(--dash-sub, #94a3b8);
          line-height: 1.6;
        }
        .history-item-content {
          border-top: 1px solid var(--dash-border, rgba(148, 163, 184, 0.32));
          padding: 12px 14px 14px;
          color: var(--dash-sub, #94a3b8);
          line-height: 1.75;
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  );
}
