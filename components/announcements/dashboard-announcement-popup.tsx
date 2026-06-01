import { useMemo, useState } from "react";
import Link from "next/link";
import AnnouncementHistoryDrawer from "@/components/announcements/announcement-history-drawer";

type AnnouncementItem = {
  id: string;
  title?: string;
  type?: string;
  summary?: string;
  content?: string;
  pinned?: boolean;
  publishedAt?: string;
};

type PopupData = {
  announcementVersion: string;
  announcements: AnnouncementItem[];
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
  loading?: boolean;
};

function formatTime(value?: string) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function DashboardAnnouncementPopup({ open, data, onClose, onConfirm, loading = false }: PopupProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState("");

  const tags = useMemo(() => {
    const list = data?.qqGroup?.tags;
    return Array.isArray(list) ? list.slice(0, 3) : [];
  }, [data?.qqGroup?.tags]);

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
    <>
      <div className="dashboard-announcement-layer" role="presentation" onClick={loading ? undefined : onConfirm}>
        <section className="dashboard-announcement-modal" role="dialog" aria-modal="true" aria-label="FlowAPI 系统公告" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="announcement-close" onClick={onClose} disabled={loading}>×</button>
          <header>
            <strong>FlowAPI 系统公告</strong>
            <p>最新福利、模型变更和使用提醒都会在这里同步。</p>
          </header>
          <div className="announcement-list">
            {data.announcements.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <article key={item.id}>
                  <button type="button" className="announcement-item" onClick={() => setExpandedId(expanded ? "" : item.id)}>
                    <span>
                      <em>{item.type || "系统更新"}</em>
                      {item.pinned ? <b>置顶</b> : null}
                    </span>
                    <strong>{item.title || "系统公告"}</strong>
                    <small>{formatTime(item.publishedAt)}</small>
                    <p>{item.summary || item.content || "暂无摘要"}</p>
                  </button>
                  {expanded ? <div className="announcement-content">{item.content || item.summary || "暂无详情"}</div> : null}
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
            <button type="button" className="btn-secondary" onClick={() => setHistoryOpen(true)} disabled={loading}>查看历史公告</button>
            <button type="button" className="btn-primary" onClick={onConfirm} disabled={loading}>{loading ? "处理中..." : "我知道了"}</button>
          </footer>
        </section>
      </div>
      <AnnouncementHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
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
        }
        .announcement-item em,
        .announcement-item b {
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
        .announcement-content {
          border-top: 1px solid var(--dash-border, rgba(148, 163, 184, 0.28));
          padding: 12px;
          color: var(--dash-sub, #94a3b8);
          line-height: 1.7;
          white-space: pre-wrap;
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
        }
      `}</style>
    </>
  );
}
