import { useEffect, useState } from "react";
import DashboardAnnouncementPopup from "@/components/announcements/dashboard-announcement-popup";

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

type Props = {
  customerId?: string;
};

export default function ConsoleAnnouncementCenter({ customerId = "" }: Props) {
  const [data, setData] = useState<PopupData | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingSeen, setLoadingSeen] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let currentSessionToken = "";

    if (!customerId) {
      const timer = window.setTimeout(() => {
        setData(null);
        setOpen(false);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    fetch("/api/session/public", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((sessionJson) => {
        if (cancelled || !sessionJson?.sessionToken) return null;
        currentSessionToken = String(sessionJson.sessionToken || "");
        setSessionToken(currentSessionToken);
        return fetch("/api/announcements/dashboard-popup", {
          cache: "no-store",
          headers: { "x-flowapi-session-token": currentSessionToken },
        }).then((res) => (res.ok ? res.json() : null));
      })
      .then((json) => {
        if (cancelled || !json?.success || !json?.announcementVersion || !Array.isArray(json?.announcements) || json.announcements.length === 0) {
          return;
        }

        const popupData = json as PopupData;
        setData(popupData);
        setUnreadCount(json.shouldShow === true ? popupData.announcements.length : 0);

        const localSeenKey = `flowapi_seen_announcement_version:${customerId || "anon"}:${currentSessionToken.slice(0, 24)}:${json.announcementVersion}`;
        const localSeenVersion = window.localStorage.getItem(localSeenKey);
        if ((json.shouldShow !== true && json.shouldPopup !== true) || localSeenVersion === "seen") {
          setUnreadCount(0);
          return;
        }

        window.setTimeout(() => {
          if (!cancelled) setOpen(true);
        }, 300);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const markSeen = () => {
    if (!data?.announcementVersion) {
      setOpen(false);
      return;
    }

    const localSeenKey = `flowapi_seen_announcement_version:${customerId || "anon"}:${sessionToken ? sessionToken.slice(0, 24) : "guest"}:${data.announcementVersion}`;

    window.localStorage.setItem(localSeenKey, "seen");
    setLoadingSeen(true);
    setOpen(false);
    setUnreadCount(0);
    void fetch("/api/announcements/mark-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementVersion: data.announcementVersion, sessionToken }),
    }).catch(() => {}).finally(() => {
      setLoadingSeen(false);
    });
  };

  const latest = data?.announcements?.[0];
  if (!data?.announcementVersion || !latest) return null;

  return (
    <>
      <section
        className="flow-announcement-trigger"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-label="查看系统公告"
      >
        <span className="flow-announcement-trigger-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 10.5h2.2l4.3 2.6c.3.2.7-.1.7-.5V5.4c0-.4-.4-.7-.7-.5L5.2 7.5H3c-.6 0-1 .4-1 1v1c0 .6.4 1 1 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M12.2 6.2c.9 1 .9 4.6 0 5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M13.9 4.4c1.7 1.9 1.7 7.3 0 9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        {unreadCount > 0 ? <span className="flow-announcement-trigger-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </section>

      <DashboardAnnouncementPopup
        open={open}
        data={data}
        onClose={markSeen}
        onConfirm={markSeen}
        loading={loadingSeen}
      />

      <style jsx>{`
        .flow-announcement-trigger {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.14), rgba(14, 165, 233, 0.1)), var(--flow-card-bg, rgba(15, 23, 42, 0.72));
          color: var(--flow-card-text, inherit);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
          cursor: pointer;
          flex: 0 0 auto;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .flow-announcement-trigger:hover {
          transform: translateY(-1px);
          border-color: rgba(99, 102, 241, 0.32);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
        }
        .flow-announcement-trigger-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          color: var(--dash-text, #e5e7eb);
        }
        .flow-announcement-trigger-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 18px;
          height: 18px;
          border-radius: 999px;
          padding: 0 5px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ef4444;
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          box-shadow: 0 4px 10px rgba(239, 68, 68, 0.35);
        }
        @media (max-width: 720px) {
          .flow-announcement-trigger {
            width: 36px;
            height: 36px;
          }
        }
      `}</style>
    </>
  );
}
