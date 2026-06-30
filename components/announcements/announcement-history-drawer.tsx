/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";

type AnnouncementImage = {
  url: string;
  alt?: string;
};

type HistoryDrawerProps = {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
};

type AnnouncementItem = {
  id: string;
  type?: string;
  title?: string;
  summary?: string;
  content?: string;
  contentHtml?: string;
  pinned?: boolean;
  publishedAt?: string;
  coverImage?: string;
  imageItems?: AnnouncementImage[];
  accentColor?: string;
  confirmLabel?: string;
  isUnread?: boolean;
  isAcknowledged?: boolean;
};

function formatTime(value?: string) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AnnouncementHistoryDrawer({ open, onClose, onUnreadCountChange }: HistoryDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState("");
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
        if (typeof data?.unreadCount === "number") onUnreadCountChange?.(data.unreadCount);
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
  }, [open, onUnreadCountChange]);

  const unreadCount = useMemo(() => items.filter((item) => item.isUnread).length, [items]);

  async function acknowledgeAnnouncement(item: AnnouncementItem) {
    if (!item?.id || item.isAcknowledged) return;
    setMarkingId(item.id);
    try {
      const res = await fetch("/api/announcements/mark-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementIds: [item.id] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "确认公告失败");
      setItems((current) => current.map((entry) => (
        entry.id === item.id
          ? { ...entry, isUnread: false, isAcknowledged: true }
          : entry
      )));
      if (typeof data?.unreadCount === "number") onUnreadCountChange?.(data.unreadCount);
    } catch {
      // ignore transient UI failures
    } finally {
      setMarkingId("");
    }
  }

  if (!open) return null;

  return (
    <div className="announcement-history-layer" role="presentation" onClick={onClose}>
      <aside className="announcement-history-drawer" role="dialog" aria-modal="true" aria-label="历史系统公告" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>系统公告中心</strong>
            <p>查看最近公告、历史通知和未确认提醒。</p>
          </div>
          <div className="history-head-actions">
            {unreadCount > 0 ? <span>未确认 {unreadCount}</span> : null}
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </header>
        {loading ? <p className="history-empty">正在加载公告...</p> : null}
        {!loading && items.length === 0 ? <p className="history-empty">暂无历史公告</p> : null}
        {!loading && items.length > 0 ? (
          <div className="history-list">
            {items.map((item) => {
              const expanded = expandedId === item.id;
              const images = Array.isArray(item.imageItems) ? item.imageItems.filter((entry) => entry?.url) : [];
              return (
                <article key={item.id} className="history-item" style={item.accentColor ? { borderColor: `${item.accentColor}55` } : undefined}>
                  <button type="button" className="history-item-button" onClick={() => setExpandedId(expanded ? "" : item.id)}>
                    <span className="history-item-head">
                      <em style={item.accentColor ? { color: item.accentColor, background: `${item.accentColor}22` } : undefined}>{item.type || "系统更新"}</em>
                      {item.pinned ? <b>置顶</b> : null}
                      {item.isUnread ? <i>未读</i> : <u>已确认</u>}
                    </span>
                    <strong>{item.title || "系统公告"}</strong>
                    <small>{formatTime(item.publishedAt)}</small>
                    <p>{item.summary || item.content || "暂无摘要"}</p>
                  </button>
                  {expanded ? (
                    <div className="history-item-content">
                      {item.coverImage ? <img className="history-cover" src={item.coverImage} alt={item.title || "公告图片"} /> : null}
                      <div dangerouslySetInnerHTML={{ __html: item.contentHtml || item.content || item.summary || "暂无详情" }} />
                      {images.length > 1 ? (
                        <div className="history-gallery">
                          {images.slice(item.coverImage ? 1 : 0).map((image) => (
                            <figure key={image.url}>
                              <img src={image.url} alt={image.alt || item.title || "公告图片"} />
                              {image.alt ? <figcaption>{image.alt}</figcaption> : null}
                            </figure>
                          ))}
                        </div>
                      ) : null}
                      {item.isUnread ? (
                        <div className="history-item-actions">
                          <button type="button" onClick={() => acknowledgeAnnouncement(item)} disabled={markingId === item.id}>
                            {markingId === item.id ? "处理中..." : (item.confirmLabel || "确认收到")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
          width: min(560px, 100vw);
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
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        header strong {
          font-size: 20px;
          font-weight: 900;
          display: block;
        }
        header p {
          margin: 6px 0 0;
          color: var(--dash-sub, #94a3b8);
          line-height: 1.6;
          font-size: 13px;
        }
        .history-head-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .history-head-actions span {
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 900;
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(248, 113, 113, 0.28);
        }
        .history-head-actions button {
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
          flex-wrap: wrap;
        }
        .history-item-head em,
        .history-item-head b,
        .history-item-head i,
        .history-item-head u {
          font-style: normal;
          text-decoration: none;
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
        .history-item-head i {
          background: rgba(239, 68, 68, 0.14);
          color: #fca5a5;
        }
        .history-item-head u {
          background: rgba(16, 185, 129, 0.14);
          color: #86efac;
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
          color: var(--dash-sub, #cbd5e1);
          line-height: 1.75;
          display: grid;
          gap: 12px;
        }
        .history-item-content :global(p),
        .history-item-content :global(ul),
        .history-item-content :global(ol),
        .history-item-content :global(blockquote),
        .history-item-content :global(h3),
        .history-item-content :global(h4) {
          margin: 0 0 12px;
        }
        .history-item-content :global(ul),
        .history-item-content :global(ol) {
          padding-left: 20px;
        }
        .history-cover {
          width: 100%;
          display: block;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.24);
        }
        .history-gallery {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
        }
        .history-gallery figure {
          margin: 0;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.24);
        }
        .history-gallery img {
          width: 100%;
          display: block;
        }
        .history-gallery figcaption {
          padding: 8px 10px;
          color: var(--dash-sub, #94a3b8);
          font-size: 12px;
        }
        .history-item-actions {
          display: flex;
          justify-content: flex-end;
        }
        .history-item-actions button {
          min-height: 38px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid rgba(59, 130, 246, 0.4);
          background: linear-gradient(90deg, #3b82f6, #22d3ee);
          color: #fff;
          font-weight: 850;
        }
      `}</style>
    </div>
  );
}
