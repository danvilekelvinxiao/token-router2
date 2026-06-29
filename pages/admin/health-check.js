import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const STATUS_STYLE = {
  normal: { label: "正常", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  abnormal: { label: "异常", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  "未配置": { label: "未配置", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  "待确认": { label: "待确认", color: "#2563eb", bg: "rgba(37,99,235,0.12)" },
};

function StatusPill({ status }) {
  const item = STATUS_STYLE[status] || STATUS_STYLE["待确认"];
  return <span style={{ color: item.color, background: item.bg, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{item.label}</span>;
}

export default function AdminHealthCheckPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/health-check");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "后台功能健康检查失败");
      setData(payload);
    } catch (err) {
      setError(String(err.message || "后台功能健康检查失败"));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      runCheck();
    });
  }, [runCheck]);

  return (
    <>
      <Head><title>后台功能健康检查 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/health-check">
        <div style={{ color: "var(--dash-text)", display: "grid", gap: 18 }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>后台功能健康检查</h1>
              <p style={{ margin: "6px 0 0", color: "var(--dash-sub)", fontSize: 13 }}>检查管理员后台关键操作是否具备真实接口、配置和基础权限。</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => runCheck()} disabled={loading} style={{ border: 0, borderRadius: 8, padding: "9px 14px", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 800, cursor: loading ? "wait" : "pointer" }}>{loading ? "检查中..." : "一键检查"}</button>
            </div>
          </header>

          {error ? <div style={{ color: "#dc2626", background: "rgba(220,38,38,0.1)", borderRadius: 10, padding: 12, fontWeight: 700 }}>{error}</div> : null}

          {data ? (
            <>
              <section style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 }}>
                {[
                  ["正常", data.summary?.normal || 0, "#16a34a"],
                  ["异常", data.summary?.abnormal || 0, "#dc2626"],
                  ["未配置", data.summary?.unconfigured || 0, "#d97706"],
                  ["待确认", data.summary?.pending || 0, "#2563eb"],
                ].map(([label, value, color]) => (
                  <article key={label} style={{ border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", borderRadius: 12, padding: 16 }}>
                    <span style={{ color: "var(--dash-sub)", fontSize: 12, fontWeight: 700 }}>{label}</span>
                    <strong style={{ display: "block", marginTop: 6, color, fontSize: 26 }}>{value}</strong>
                  </article>
                ))}
              </section>

              <section style={{ border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", borderRadius: 12, overflow: "hidden" }}>
                {(data.checks || []).map((check) => (
                  <div key={check.name} style={{ display: "grid", gridTemplateColumns: "220px 110px 1fr", gap: 12, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--dash-border)" }}>
                    <strong>{check.name}</strong>
                    <StatusPill status={check.status} />
                    <span style={{ color: "var(--dash-sub)", fontSize: 13 }}>{check.message || "-"}</span>
                  </div>
                ))}
              </section>
            </>
          ) : (
            <div style={{ padding: 30, color: "var(--dash-sub)" }}>等待检查结果...</div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
