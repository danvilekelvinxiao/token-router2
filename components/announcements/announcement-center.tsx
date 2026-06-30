/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnnouncementHistoryDrawer from "@/components/announcements/announcement-history-drawer";
import DashboardAnnouncementPopup from "@/components/announcements/dashboard-announcement-popup";

type AnnouncementCenterProps = {
  customerId?: string;
  currentPath?: string;
};

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18H5.5a1.5 1.5 0 01-1.2-2.4c1.2-1.6 1.7-3.3 1.7-5.7V9a6 6 0 1112 0v.5c0 2.3.5 4.1 1.7 5.7a1.5 1.5 0 01-1.2 2.4H15" />
      <path d="M10 20a2 2 0 004 0" />
    </svg>
  );
}

export default function AnnouncementCenter({ customerId = "", currentPath = "" }: AnnouncementCenterProps) {
  const [popupData, setPopupData] = useState<any>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const popupTimerRef = useRef<number | null>(null);
  const loginHintRef = useRef(false);

  const localSeenKey = useMemo(() => `flowapi_seen_announcement_version:${customerId || "anon"}`, [customerId]);

  const clearPopupTimer = useCallback(() => {
    if (popupTimerRef.current) {
      window.clearTimeout(popupTimerRef.current);
      popupTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loginHintRef.current = currentPath.includes("source=login") || window.location.search.includes("source=login");
  }, [currentPath]);

  const fetchAnnouncements = useCallback(async () => {
    if (!customerId) {
      setPopupData(null);
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch("/api/announcements/dashboard-popup");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) return;
      setPopupData(data);
      setUnreadCount(Number(data?.unreadCount || 0));
      const localSeenVersion = typeof window !== "undefined" ? window.localStorage.getItem(localSeenKey) : "";
      if (!data?.announcementVersion || !Array.isArray(data?.announcements) || data.announcements.length === 0) return;
      if ((data.shouldShow !== true && data.shouldPopup !== true) || localSeenVersion === data.announcementVersion) return;
      clearPopupTimer();
      popupTimerRef.current = window.setTimeout(() => {
        setPopupOpen(true);
        popupTimerRef.current = null;
        loginHintRef.current = false;
      }, loginHintRef.current ? 220 : 320);
    } catch {
      // ignore transient fetch failures
    }
  }, [clearPopupTimer, customerId, localSeenKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    clearPopupTimer();
    fetchAnnouncements();
    return () => clearPopupTimer();
  }, [clearPopupTimer, fetchAnnouncements]);

  const acknowledgeAnnouncements = useCallback(async (announcementIds: string[] = []) => {
    const version = String(popupData?.announcementVersion || "").trim();
    if (!announcementIds.length && !version) {
      setPopupOpen(false);
      return;
    }
    try {
      setLoading(true);
      if (typeof window !== "undefined" && version) {
        window.localStorage.setItem(localSeenKey, version);
      }
      const res = await fetch("/api/announcements/mark-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementIds, announcementVersion: version }),
      });
      const data = await res.json().catch(() => ({}));
      if (typeof data?.unreadCount === "number") setUnreadCount(data.unreadCount);
      setPopupOpen(false);
      setPopupData((current: any) => current ? { ...current, announcements: [] } : current);
    } catch {
      setPopupOpen(false);
    } finally {
      setLoading(false);
    }
  }, [localSeenKey, popupData]);

  if (!customerId) return null;

  return (
    <>
      <button
        type="button"
        aria-label="系统公告"
        title={unreadCount > 0 ? `系统公告（${unreadCount} 条未确认）` : "系统公告"}
        onClick={() => setDrawerOpen(true)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 8,
          border: "1px solid var(--console-account-border)",
          background: "var(--console-account-bg)",
          color: "var(--console-account-text)",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span style={{
            position: "absolute",
            top: -5,
            right: -6,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #ef4444, #f97316)",
            color: "#fff",
            fontSize: 11,
            lineHeight: "18px",
            fontWeight: 900,
            boxShadow: "0 8px 18px rgba(239, 68, 68, 0.35)",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <DashboardAnnouncementPopup
        open={popupOpen}
        data={popupData}
        onClose={() => setPopupOpen(false)}
        onConfirm={() => acknowledgeAnnouncements(Array.isArray(popupData?.announcements) ? popupData.announcements.map((item: any) => item.id).filter(Boolean) : [])}
        onOpenHistory={() => {
          setPopupOpen(false);
          setDrawerOpen(true);
        }}
        loading={loading}
      />

      <AnnouncementHistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUnreadCountChange={(count) => {
          setUnreadCount(Number(count || 0));
          if (!count) setPopupData((current: any) => current ? { ...current, unreadCount: 0 } : current);
        }}
      />
    </>
  );
}
