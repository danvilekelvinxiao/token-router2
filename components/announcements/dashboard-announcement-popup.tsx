/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useMemo, useState } from "react";

type AnnouncementImage = {
  url: string;
  alt?: string;
};

type AnnouncementItem = {
  id: string;
  title?: string;
  type?: string;
  summary?: string;
  content?: string;
  contentHtml?: string;
  pinned?: boolean;
  publishedAt?: string;
  coverImage?: string;
  imageItems?: AnnouncementImage[];
  accentColor?: string;
  confirmLabel?: string;
  requireAck?: boolean;
  isUnread?: boolean;
};

type PopupData = {
  announcementVersion: string;
  announcements: AnnouncementItem[];
  unreadCount?: number;
  qqGroup?: {
    enabled?: boolean;
    number?: string;
    title?: string;
    description?: string;
    tags?: string[];
  };
};

type PopupProps = {
  open: boolean;
  data: PopupData | null;
  onClose: () => void;
  onConfirm: () => void;
  onOpenHistory?: () => void;
  loading?: boolean;
};

function formatTime(value?: string) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function getConfirmLabel(items: AnnouncementItem[] = []) {
  const labels = Array.from(new Set(items.map((item) => item.confirmLabel).filter(Boolean)));
  if (labels.length === 1) return labels[0] || "我知道了";
  return "确认收到";
}

export default function DashboardAnnouncementPopup({ open, data, onClose, onConfirm, onOpenHistory, loading = false }: PopupProps) {
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState("");

  const tags = useMemo(() => {
    const list = data?.qqGroup?.tags;
    return Array.isArray(list) ? list.slice(0, 3) : [];
  }, [data?.qqGroup?.tags]);

  const requiresAck = useMemo(
    () => Boolean(data?.announcements?.some((item) => item?.requireAck !== false)),
    [data?.announcements],
  );
  const confirmLabel = useMemo(() => getConfirmLabel(data?.announcements || []), [data?.announcements]);

  if (!open || !data) return null;

  async function copyQqNumber() {
    if (!data?.qqGroup?.number) return;
    try {
      await navigator.clipboard.writeText(data.qqGroup.number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="dashboard-announcement-layer" role="presentation" onClick={!loading && !requiresAck ? onClose : undefined}>
      <section className="dashboard-announcement-modal" role="dialog" aria-modal="true" aria-label="FlowAPI 系统公告" onClick={(event) => event.stopPropagation()}>
        {!requiresAck ? <button type="button" className="announcement-close" onClick={onClose} disabled={loading}>×</button> : null}
        <header>
          <div>
            <strong>FlowAPI 系统公告</strong>
            <p>最新福利、模型变更和使用提醒都会在这里同步。</p>
          </div>
          {data.unreadCount ? <span className="announcement-unread-pill">未确认 {data.unreadCount}</span> : null}
        </header>
        <div className="announcement-list">
          {data.announcements.map((item) => {
            const expanded = expandedId === item.id || data.announcements.length === 1;
            const images = Array.isArray(item.imageItems) ? item.imageItems.filter((entry) => entry?.url) : [];
            return (
              <article key={item.id} style={item.accentColor ? { borderColor: `${item.accentColor}55` } : undefined}>
                <button type="button" className="announcement-item" onClick={() => setExpandedId(expandedId === item.id ? "" : item.id)}>
                  <span>
                    <em style={item.accentColor ? { color: item.accentColor, background: `${item.accentColor}22` } : undefined}>{item.type || "系统更新"}</em>
                    {item.pinned ? <b>置顶</b> : null}
                    {item.isUnread ? <i>未读</i> : null}
                  </span>
                  <strong>{item.title || "系统公告"}</strong>
                  <small>{formatTime(item.publishedAt)}</small>
                  <p>{item.summary || item.content || "暂无摘要"}</p>
                </button>
                {expanded ? (
                  <div className="announcement-content-wrap">
                    {item.coverImage ? (
                      <div className="announcement-cover">
                        <img src={item.coverImage} alt={item.title || "公告图片"} />
                      </div>
                    ) : null}
                    <div className="announcement-content" dangerouslySetInnerHTML={{ __html: item.contentHtml || item.content || item.summary || "暂无详情" }} />
                    {images.length > 1 ? (
                      <div className="announcement-gallery">
                        {images.slice(item.coverImage ? 1 : 0).map((image) => (
                          <figure key={image.url}>
                            <img src={image.url} alt={image.alt || item.title || "公告图片"} />
                            {image.alt ? <figcaption>{image.alt}</figcaption> : null}
                          </figure>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {data?.qqGroup?.enabled && data?.qqGroup?.number ? (
          <section className="announcement-qq">
            <strong>{data.qqGroup.title || "FlowAPI AI玩家交流群"}</strong>
            <p>QQ群：{data.qqGroup.number}</p>
            <p>{data.qqGroup.description || "群里会同步最新福利和接入帮助。"}</p>
            <div className="announcement-tags">
              {tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <div className="announcement-qq-actions">
              <button type="button" onClick={copyQqNumber} disabled={loading}>{copied ? "QQ群号已复制" : "复制 QQ 群号"}</button>
              <Link href="/guide">查看帮助指南</Link>
            </div>
          </section>
        ) : null}

        <footer>
          <button type="button" className="btn-secondary" onClick={onOpenHistory} disabled={loading}>{requiresAck ? "查看全部公告" : "查看历史公告"}</button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={loading}>{loading ? "处理中..." : confirmLabel}</button>
        </footer>
      </section>
      <style jsx>{`
        .dashboard-announcement-layer {
          position: fixed;
          inset: 0;
          z-index: 1700;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(2, 6, 23, 0.58);
          backdrop-filter: blur(10px);
        }
        .dashboard-announcement-modal {
          position: relative;
          width: min(760px, 100%);
          max-height: min(88vh, 860px);
          overflow: auto;
          display: grid;
          gap: 14px;
          padding: 22px;
          border-radius: 18px;
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          background:
            radial-gradient(circle at 95% 0%, rgba(99, 102, 241, 0.12), transparent 35%),
            var(--dash-card-bg, rgba(15, 23, 42, 0.9));
          color: var(--dash-text, #e5e7eb);
          box-shadow: 0 28px 80px rgba(2, 6, 23, 0.45);
        }
        .announcement-close {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          background: transparent;
          color: inherit;
          font-size: 22px;
          line-height: 1;
        }
        header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        header strong {
          display: block;
          font-size: 24px;
          font-weight: 950;
          margin-bottom: 6px;
        }
        header p {
          margin: 0;
          color: var(--dash-sub, #94a3b8);
          line-height: 1.7;
        }
        .announcement-unread-pill {
          flex-shrink: 0;
          border-radius: 999px;
          border: 1px solid rgba(248, 113, 113, 0.28);
          background: rgba(239, 68, 68, 0.12);
          color: #fca5a5;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
        }
        .announcement-list {
          display: grid;
          gap: 10px;
        }
        .announcement-list article {
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          border-radius: 12px;
          overflow: hidden;
          background: color-mix(in srgb, var(--dash-card-bg, rgba(15, 23, 42, 0.9)) 92%, #6366f1 8%);
        }
        .announcement-item {
          width: 100%;
          text-align: left;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 12px;
          display: grid;
          gap: 6px;
        }
        .announcement-item span {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .announcement-item em,
        .announcement-item b,
        .announcement-item i {
          font-style: normal;
          font-size: 12px;
          font-weight: 900;
          border-radius: 999px;
          padding: 2px 8px;
        }
        .announcement-item em {
          background: rgba(99, 102, 241, 0.16);
          color: #818cf8;
        }
        .announcement-item b {
          background: rgba(16, 185, 129, 0.16);
          color: #34d399;
        }
        .announcement-item i {
          background: rgba(239, 68, 68, 0.14);
          color: #fca5a5;
        }
        .announcement-item strong {
          font-size: 16px;
          font-weight: 850;
          line-height: 1.4;
        }
        .announcement-item small {
          color: var(--dash-sub, #94a3b8);
          font-size: 12px;
        }
        .announcement-item p {
          margin: 0;
          color: var(--dash-sub, #94a3b8);
          line-height: 1.6;
        }
        .announcement-content-wrap {
          border-top: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          padding: 12px;
          display: grid;
          gap: 12px;
        }
        .announcement-cover,
        .announcement-gallery figure {
          margin: 0;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.42);
        }
        .announcement-cover img,
        .announcement-gallery img {
          width: 100%;
          display: block;
          object-fit: cover;
        }
        .announcement-content :global(p),
        .announcement-content :global(ul),
        .announcement-content :global(ol),
        .announcement-content :global(blockquote),
        .announcement-content :global(h3),
        .announcement-content :global(h4) {
          margin: 0 0 12px;
        }
        .announcement-content :global(ul),
        .announcement-content :global(ol) {
          padding-left: 20px;
        }
        .announcement-content {
          color: var(--dash-sub, #cbd5e1);
          line-height: 1.8;
          font-size: 14px;
        }
        .announcement-gallery {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
        }
        .announcement-gallery figcaption {
          padding: 8px 10px;
          color: var(--dash-sub, #94a3b8);
          font-size: 12px;
        }
        .announcement-qq {
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          border-radius: 14px;
          padding: 14px;
          background: color-mix(in srgb, var(--dash-card-bg, rgba(15, 23, 42, 0.9)) 90%, #22d3ee 10%);
          display: grid;
          gap: 8px;
        }
        .announcement-qq strong {
          font-size: 16px;
          font-weight: 900;
        }
        .announcement-qq p {
          margin: 0;
          color: var(--dash-sub, #94a3b8);
          line-height: 1.6;
        }
        .announcement-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .announcement-tags span {
          border-radius: 999px;
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          padding: 3px 10px;
          font-size: 12px;
          color: var(--dash-sub, #94a3b8);
        }
        .announcement-qq-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .announcement-qq-actions button,
        .announcement-qq-actions a {
          min-height: 36px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          background: transparent;
          color: inherit;
        }
        footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn-secondary,
        .btn-primary {
          min-height: 40px;
          padding: 0 16px;
          border-radius: 10px;
          font-weight: 850;
        }
        .btn-secondary {
          border: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          background: transparent;
          color: inherit;
        }
        .btn-primary {
          border: 1px solid rgba(59, 130, 246, 0.4);
          background: linear-gradient(90deg, #3b82f6, #22d3ee);
          color: #fff;
        }
        @media (max-width: 760px) {
          .dashboard-announcement-layer {
            padding: 0;
          }
          .dashboard-announcement-modal {
            width: 100%;
            height: 100%;
            max-height: 100%;
            border-radius: 0;
            padding: 16px;
          }
          header {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
