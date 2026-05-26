export const dynamic = "force-dynamic";
import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

/**
 * User Insights — real data only.
 * All metrics come from backend customer/usage/order tables.
 * No mock data, no fake profiles, no hardcoded stats.
 */

const WAITING_SECTIONS = [
  { key: "overview", label: "用户概览", desc: "总用户数、付费用户、复购用户、高价值用户等核心指标。" },
  { key: "profiles", label: "用户画像", desc: "按产品偏好、使用目的、充值金额、复购行为、设备来源等维度分析。" },
  { key: "sources", label: "来源分析", desc: "按渠道、地区、邀请码统计用户来源和转化效果。" },
  { key: "funnel", label: "转化漏斗", desc: "访问 → 注册 → 创建 Key → 首次调用 → 首次充值 转化率分析。" },
  { key: "segments", label: "用户分层", desc: "按充值金额、调用频率、模型偏好将用户分为高价值/活跃/普通/流失层。" },
];

export default function UserInsightsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [sources, setSources] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [segments, setSegments] = useState(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    fetch("/api/admin/customers?limit=200")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setOverview(data.overview || null);
          setProfiles(data.customers || null);
          setSources(data.sources || null);
          setFunnel(data.funnel || null);
          setSegments(data.segments || null);
        }
      })
      .catch(() => setError("数据加载失败"))
      .finally(() => setLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const hasData = overview || profiles || sources || funnel || segments;

  return (
    <>
      <Head><title>用户画像分析 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/user-insights">
        <div className="redeem-admin-page">
          <header className="redeem-admin-header">
            <div>
              <h1>用户画像分析</h1>
              <p>基于真实用户数据，分析用户来源、行为、偏好和分层。所有数据均来自后端数据库。</p>
            </div>
          </header>

          {loading ? (
            <div className="empty-state">
              <strong>数据加载中</strong>
              <p>正在从数据库获取用户数据...</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <strong>数据加载失败</strong>
              <p>{error}</p>
            </div>
          ) : !hasData ? (
            <div className="empty-state">
              <strong>暂无足够用户数据</strong>
              <p>用户画像分析需要真实用户注册、调用和充值数据。当用户量达到一定规模后，此页面将自动展示多维度用户分析。</p>
              <p style={{ fontSize: 12, color: "var(--dash-sub)", marginTop: 8 }}>
                当前可用数据通过 <code>GET /api/admin/customers</code> 获取，后端按需扩展统计字段。
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 24 }}>
              {overview && <UserOverviewSection data={overview} />}
              {profiles && <UserProfilesSection data={profiles} />}
              {sources && <UserSourcesSection data={sources} />}
              {funnel && <UserFunnelSection data={funnel} />}
              {segments && <UserSegmentsSection data={segments} />}
            </div>
          )}

          {/* Section placeholders showing what data will be available */}
          {!hasData && !loading && (
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)", margin: "0 0 16px" }}>将展示的分析模块</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {WAITING_SECTIONS.map((section) => (
                  <div key={section.key} style={{ padding: 16, border: "1px solid var(--dash-border)", borderRadius: 14, background: "var(--dash-card-bg)" }}>
                    <strong style={{ color: "var(--dash-text)" }}>{section.label}</strong>
                    <p style={{ fontSize: 13, color: "var(--dash-sub)", margin: "4px 0 0" }}>{section.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}

function UserOverviewSection({ data }) {
  const items = Array.isArray(data) ? data : data.items || [];
  if (!items.length) return null;
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--page-heading)" }}>用户概览</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
        {items.map((item, i) => (
          <div key={i} style={{ padding: 16, border: "1px solid var(--dash-border)", borderRadius: 14, background: "var(--dash-card-bg)" }}>
            <span style={{ fontSize: 12, color: "var(--dash-sub)" }}>{item.label}</span>
            <strong style={{ display: "block", fontSize: 24, fontWeight: 900, color: "var(--dash-text)", marginTop: 4 }}>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserProfilesSection({ data }) { return null; /* TODO: implement when backend supports profile queries */ }
function UserSourcesSection({ data }) { return null; /* TODO: implement when backend supports source analytics */ }
function UserFunnelSection({ data }) { return null; /* TODO: implement when backend supports funnel data */ }
function UserSegmentsSection({ data }) { return null; /* TODO: implement when backend supports user segmentation */ }
