import Head from "next/head";
import { useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const TYPES = ["系统更新", "维护通知", "模型变更", "福利活动", "重要提醒"];
const STATUSES = ["草稿", "已发布", "进行中", "已结束"];

const initialAnnouncements = [
  {
    id: "ann-dashboard-upgrade",
    title: "FlowAPI 数据面板升级",
    type: "系统更新",
    content: "数据面板已升级为 AI Token 资产分析中心，新增模型成本排行、余额预测和缓存命中率。",
    status: "已发布",
    pinned: true,
    publishedAt: "2026-05-22T09:00",
    updatedAt: "2026-05-22T09:00",
  },
  {
    id: "ann-deepseek-online",
    title: "FlowAPI DeepSeek 官方渠道已上线",
    type: "模型变更",
    content: "当前已支持 deepseek-chat 和 deepseek-reasoner。用户可在 API 管理页创建 API Key 后接入。",
    status: "已发布",
    pinned: false,
    publishedAt: "2026-05-21T16:00",
    updatedAt: "2026-05-21T16:00",
  },
];

function emptyForm() {
  return {
    id: "",
    title: "",
    type: "系统更新",
    content: "",
    status: "草稿",
    pinned: false,
    publishedAt: new Date().toISOString().slice(0, 16),
  };
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState(initialAnnouncements);
  const [form, setForm] = useState(emptyForm());

  const sortedItems = useMemo(() => (
    [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.publishedAt) - new Date(a.publishedAt))
  ), [items]);

  function saveAnnouncement(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    const next = {
      ...form,
      id: form.id || `ann-${Date.now()}`,
      title: form.title.trim(),
      content: form.content.trim(),
      updatedAt: new Date().toISOString(),
    };
    setItems((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists ? current.map((item) => (item.id === next.id ? next : item)) : [next, ...current];
    });
    setForm(emptyForm());
  }

  function editAnnouncement(item) {
    setForm({ ...item, publishedAt: String(item.publishedAt || "").slice(0, 16) });
  }

  function removeAnnouncement(id) {
    if (!window.confirm("确定删除这条公告吗？")) return;
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function togglePinned(id) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() } : item)));
  }

  return (
    <AdminLayout currentPath="/admin/announcements">
      <Head><title>系统公告管理 - FlowAPI Admin</title></Head>
      <section className="admin-page-shell">
        <div className="admin-page-head">
          <div>
            <span>Announcements</span>
            <h1>系统公告管理</h1>
            <p>管理用户端个人资料页展示的置顶公告、普通公告和历史公告。第一阶段使用本地数据结构，后续可直接接入数据库。</p>
          </div>
        </div>

        <div className="admin-announcement-layout">
          <form className="admin-card admin-announcement-form" onSubmit={saveAnnouncement}>
            <h2>{form.id ? "编辑公告" : "新增公告"}</h2>
            <label>公告标题<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：FlowAPI 数据面板升级" /></label>
            <label>公告内容<textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} rows={6} placeholder="写给普通用户看的中文说明" /></label>
            <div className="admin-form-grid">
              <label>公告类型<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>公告状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
            </div>
            <label>发布时间<input type="datetime-local" value={form.publishedAt} onChange={(event) => setForm({ ...form, publishedAt: event.target.value })} /></label>
            <label className="admin-check-row"><input type="checkbox" checked={form.pinned} onChange={(event) => setForm({ ...form, pinned: event.target.checked })} /> 设置为置顶公告</label>
            <div className="admin-form-actions">
              <button type="submit">{form.id ? "保存修改" : "新增公告"}</button>
              {form.id ? <button type="button" onClick={() => setForm(emptyForm())}>取消编辑</button> : null}
            </div>
          </form>

          <div className="admin-card admin-announcement-list">
            <h2>公告列表</h2>
            {sortedItems.map((item) => (
              <article key={item.id} className={item.pinned ? "pinned" : ""}>
                <div>
                  <span>{item.pinned ? "置顶" : item.type}</span>
                  <b>{item.status}</b>
                </div>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
                <time>{new Date(item.publishedAt).toLocaleString("zh-CN", { hour12: false })}</time>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => togglePinned(item.id)}>{item.pinned ? "取消置顶" : "设为置顶"}</button>
                  <button type="button" onClick={() => editAnnouncement(item)}>编辑</button>
                  <button type="button" className="danger" onClick={() => removeAnnouncement(item.id)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
