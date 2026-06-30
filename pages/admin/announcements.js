/* eslint-disable react-hooks/set-state-in-effect */
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

const TYPES = ["系统更新", "维护通知", "模型变更", "福利活动", "重要提醒"];
const STATUSES = ["草稿", "已发布", "进行中", "已结束"];
const COLOR_PRESETS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

function emptyForm() {
  const now = new Date().toISOString().slice(0, 16);
  return {
    id: "",
    title: "",
    type: "系统更新",
    summary: "",
    contentHtml: "",
    status: "草稿",
    pinned: false,
    requireAck: true,
    showOnLogin: true,
    showInBell: true,
    accentColor: "#6366f1",
    confirmLabel: "确认收到",
    priority: 0,
    coverImage: "",
    imageItemsText: "",
    publishedAt: now,
    startAt: now,
    endAt: "",
  };
}

function toLocalDateTime(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseImageItemsText(value = "") {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((url) => ({ url, alt: "" }));
}

function buildPreviewHtml(form) {
  return form.contentHtml || "<p>右侧会实时预览你的公告内容。</p>";
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(emptyForm());
  const textareaRef = useRef(null);

  async function loadAnnouncements() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/content?type=announcements");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "加载公告失败");
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setError(err?.message || "加载公告失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const sortedItems = useMemo(() => (
    [...items].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)
      || Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  ), [items]);

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function insertSnippet(before, after = "") {
    const textarea = textareaRef.current;
    if (!textarea) {
      updateForm({ contentHtml: `${form.contentHtml}${before}${after}` });
      return;
    }
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selected = form.contentHtml.slice(start, end) || "示例内容";
    const next = `${form.contentHtml.slice(0, start)}${before}${selected}${after}${form.contentHtml.slice(end)}`;
    updateForm({ contentHtml: next });
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + before.length + selected.length + after.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function fillColorSnippet(color) {
    insertSnippet(`<p><span style="color:${color}">`, "</span></p>");
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSuccess("");
    if (!form.title.trim() || !form.contentHtml.trim()) {
      setError("请至少填写标题和公告内容");
      return;
    }

    const payload = {
      id: form.id,
      title: form.title.trim(),
      type: form.type,
      summary: form.summary.trim(),
      contentHtml: form.contentHtml.trim(),
      status: form.status,
      pinned: form.pinned,
      requireAck: form.requireAck,
      showOnLogin: form.showOnLogin,
      showInBell: form.showInBell,
      accentColor: form.accentColor,
      confirmLabel: form.confirmLabel.trim() || "确认收到",
      priority: Number(form.priority || 0),
      coverImage: form.coverImage.trim(),
      imageItems: parseImageItemsText(form.imageItemsText),
      publishedAt: form.publishedAt,
      startAt: form.startAt,
      endAt: form.endAt,
    };

    try {
      setSaving(true);
      const method = form.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/content?type=announcements", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "保存公告失败");
      setSuccess(form.id ? "公告已更新" : "公告已创建");
      setForm(emptyForm());
      await loadAnnouncements();
    } catch (err) {
      setError(err?.message || "保存公告失败");
    } finally {
      setSaving(false);
    }
  }

  function editAnnouncement(item) {
    setError("");
    setSuccess("");
    setForm({
      id: item.id || "",
      title: item.title || "",
      type: item.type || "系统更新",
      summary: item.summary || "",
      contentHtml: item.contentHtml || item.content || "",
      status: item.status || "草稿",
      pinned: Boolean(item.pinned),
      requireAck: item.requireAck !== false,
      showOnLogin: item.showOnLogin !== false,
      showInBell: item.showInBell !== false,
      accentColor: item.accentColor || "#6366f1",
      confirmLabel: item.confirmLabel || "确认收到",
      priority: Number(item.priority || 0),
      coverImage: item.coverImage || "",
      imageItemsText: Array.isArray(item.imageItems) ? item.imageItems.map((image) => image.url).join("\n") : "",
      publishedAt: toLocalDateTime(item.publishedAt),
      startAt: toLocalDateTime(item.startAt),
      endAt: toLocalDateTime(item.endAt),
    });
  }

  async function removeAnnouncement(id) {
    if (!id || !window.confirm("确定删除这条公告吗？")) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/content?type=announcements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success !== true) throw new Error(data?.error || "删除公告失败");
      setSuccess("公告已删除");
      if (form.id === id) setForm(emptyForm());
      await loadAnnouncements();
    } catch (err) {
      setError(err?.message || "删除公告失败");
    }
  }

  return (
    <AdminLayout currentPath="/admin/announcements">
      <Head><title>系统公告管理 - FlowAPI Admin</title></Head>
      <section className="admin-page-shell">
        <div className="admin-page-head">
          <div>
            <span>Announcements</span>
            <h1>系统公告管理</h1>
            <p>在不改前台整体风格的前提下，统一管理登录弹窗、顶部喇叭提醒、历史公告与富文本展示。</p>
          </div>
        </div>

        {error ? <div className="notice error">{error}</div> : null}
        {success ? <div className="notice success">{success}</div> : null}

        <div className="admin-announcement-layout">
          <form className="admin-card admin-announcement-form" onSubmit={saveAnnouncement}>
            <div className="card-head">
              <div>
                <h2>{form.id ? "编辑公告" : "新增公告"}</h2>
                <p>支持颜色、加粗、图片、登录弹窗与未读提醒配置。</p>
              </div>
              {form.id ? <button type="button" className="ghost-btn" onClick={() => setForm(emptyForm())}>取消编辑</button> : null}
            </div>

            <label>公告标题<input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} placeholder="例如：FlowAPI 数据面板升级" /></label>
            <label>公告摘要<input value={form.summary} onChange={(event) => updateForm({ summary: event.target.value })} placeholder="用于列表和喇叭提醒的短摘要，不填则自动提取" /></label>

            <div className="admin-form-grid">
              <label>公告类型<select value={form.type} onChange={(event) => updateForm({ type: event.target.value })}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>公告状态<select value={form.status} onChange={(event) => updateForm({ status: event.target.value })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>主题色<input type="color" value={form.accentColor} onChange={(event) => updateForm({ accentColor: event.target.value })} /></label>
              <label>确认按钮文案<input value={form.confirmLabel} onChange={(event) => updateForm({ confirmLabel: event.target.value })} placeholder="确认收到" /></label>
            </div>

            <div className="toolbar">
              <span>快捷格式</span>
              <button type="button" onClick={() => insertSnippet("<p><strong>", "</strong></p>")}>加粗</button>
              <button type="button" onClick={() => insertSnippet("<p>", "</p>")}>段落</button>
              <button type="button" onClick={() => insertSnippet("<ul><li>", "</li></ul>")}>列表</button>
              <button type="button" onClick={() => insertSnippet('<p><a href="https://example.com" target="_blank">', "</a></p>")}>链接</button>
              <button type="button" onClick={() => insertSnippet('<p><img src="https://example.com/banner.png" alt="公告图片" /></p>')}>插图</button>
            </div>
            <div className="color-palette">
              {COLOR_PRESETS.map((color) => (
                <button key={color} type="button" aria-label={`插入 ${color} 颜色文字`} style={{ background: color }} onClick={() => fillColorSnippet(color)} />
              ))}
            </div>

            <label>
              富文本内容（受限 HTML）
              <textarea
                ref={textareaRef}
                value={form.contentHtml}
                onChange={(event) => updateForm({ contentHtml: event.target.value })}
                rows={14}
                placeholder={'示例：<p><strong>今晚 23:30 开始维护</strong></p><p><span style="color:#f59e0b">预计 15 分钟</span></p>'}
              />
            </label>

            <div className="admin-form-grid">
              <label>封面图片 URL<input value={form.coverImage} onChange={(event) => updateForm({ coverImage: event.target.value })} placeholder="https://..." /></label>
              <label>额外图片 URL（每行一条）<textarea value={form.imageItemsText} onChange={(event) => updateForm({ imageItemsText: event.target.value })} rows={4} placeholder={"https://...\nhttps://..."} /></label>
            </div>

            <div className="admin-form-grid triple">
              <label>发布时间<input type="datetime-local" value={form.publishedAt} onChange={(event) => updateForm({ publishedAt: event.target.value })} /></label>
              <label>生效开始时间<input type="datetime-local" value={form.startAt} onChange={(event) => updateForm({ startAt: event.target.value })} /></label>
              <label>生效结束时间<input type="datetime-local" value={form.endAt} onChange={(event) => updateForm({ endAt: event.target.value })} /></label>
            </div>

            <div className="admin-form-grid triple">
              <label>优先级<input type="number" value={form.priority} onChange={(event) => updateForm({ priority: event.target.value })} placeholder="数值越大越靠前" /></label>
              <label className="admin-check-row"><input type="checkbox" checked={form.pinned} onChange={(event) => updateForm({ pinned: event.target.checked })} /> 设置为置顶公告</label>
              <label className="admin-check-row"><input type="checkbox" checked={form.requireAck} onChange={(event) => updateForm({ requireAck: event.target.checked })} /> 用户需点击确认才消除未读</label>
            </div>

            <div className="admin-form-grid triple">
              <label className="admin-check-row"><input type="checkbox" checked={form.showOnLogin} onChange={(event) => updateForm({ showOnLogin: event.target.checked })} /> 登录进入站内自动弹窗</label>
              <label className="admin-check-row"><input type="checkbox" checked={form.showInBell} onChange={(event) => updateForm({ showInBell: event.target.checked })} /> 计入右上角喇叭提醒</label>
              <div className="form-tip">推荐：登录弹窗用于重要通知，喇叭提醒用于可回看的系统消息。</div>
            </div>

            <div className="admin-form-actions">
              <button type="submit" disabled={saving}>{saving ? "保存中..." : (form.id ? "保存修改" : "新增公告")}</button>
            </div>
          </form>

          <div className="admin-side-stack">
            <div className="admin-card preview-card">
              <div className="card-head">
                <div>
                  <h2>前台预览</h2>
                  <p>预览弹窗 / 历史公告中展示的主要内容效果。</p>
                </div>
              </div>
              <article className="preview-item" style={form.accentColor ? { borderColor: `${form.accentColor}55` } : undefined}>
                <div className="preview-meta">
                  <span style={form.accentColor ? { color: form.accentColor, background: `${form.accentColor}22` } : undefined}>{form.type || "系统更新"}</span>
                  {form.pinned ? <b>置顶</b> : null}
                  {form.showInBell ? <i>喇叭提醒</i> : null}
                </div>
                <h3>{form.title || "系统公告标题"}</h3>
                <p className="preview-summary">{form.summary || "这里会显示列表摘要，未填写时前台会自动从正文提取。"}</p>
                {form.coverImage ? <img className="preview-cover" src={form.coverImage} alt="封面预览" /> : null}
                <div className="preview-html" dangerouslySetInnerHTML={{ __html: buildPreviewHtml(form) }} />
              </article>
            </div>

            <div className="admin-card admin-announcement-list">
              <div className="card-head">
                <div>
                  <h2>公告列表</h2>
                  <p>{loading ? "正在加载..." : `共 ${sortedItems.length} 条公告`}</p>
                </div>
              </div>
              <div className="list-wrap">
                {sortedItems.map((item) => (
                  <article key={item.id} className={`list-item${item.pinned ? " pinned" : ""}`}>
                    <div className="list-item-head">
                      <span style={item.accentColor ? { color: item.accentColor, background: `${item.accentColor}22` } : undefined}>{item.pinned ? "置顶公告" : (item.type || "系统更新")}</span>
                      <b>{item.status}</b>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.summary || item.content || "暂无摘要"}</p>
                    <time>{item.publishedAt ? new Date(item.publishedAt).toLocaleString("zh-CN", { hour12: false }) : "未设置发布时间"}</time>
                    <div className="list-tags">
                      {item.requireAck ? <small>需确认</small> : null}
                      {item.showOnLogin ? <small>登录弹窗</small> : null}
                      {item.showInBell ? <small>喇叭提醒</small> : null}
                      {Number(item.priority || 0) ? <small>优先级 {Number(item.priority || 0)}</small> : null}
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => editAnnouncement(item)}>编辑</button>
                      <button type="button" className="danger" onClick={() => removeAnnouncement(item.id)}>删除</button>
                    </div>
                  </article>
                ))}
                {!loading && sortedItems.length === 0 ? <p className="empty-copy">暂无公告，先创建一条吧。</p> : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <style jsx>{`
        .notice {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 700;
        }
        .notice.error {
          color: #fecaca;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(248, 113, 113, 0.25);
        }
        .notice.success {
          color: #bbf7d0;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(74, 222, 128, 0.25);
        }
        .admin-announcement-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(360px, 0.95fr);
          gap: 18px;
          align-items: start;
        }
        .admin-card {
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.7);
          padding: 18px;
          box-shadow: 0 18px 50px rgba(2, 6, 23, 0.18);
        }
        .admin-side-stack {
          display: grid;
          gap: 18px;
        }
        .card-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .card-head h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 900;
        }
        .card-head p {
          margin: 6px 0 0;
          color: rgba(148, 163, 184, 0.92);
          line-height: 1.6;
          font-size: 13px;
        }
        .ghost-btn {
          min-height: 36px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: transparent;
          color: inherit;
          font-weight: 700;
        }
        .admin-announcement-form,
        .preview-card,
        .admin-announcement-list {
          display: grid;
          gap: 14px;
        }
        label {
          display: grid;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          color: rgba(226, 232, 240, 0.95);
        }
        input,
        textarea,
        select {
          width: 100%;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.52);
          color: #e5e7eb;
          padding: 10px 12px;
          font: inherit;
        }
        textarea {
          resize: vertical;
          min-height: 96px;
        }
        .admin-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .admin-form-grid.triple {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .toolbar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .toolbar span {
          color: rgba(148, 163, 184, 0.95);
          font-size: 12px;
          font-weight: 800;
          margin-right: 4px;
        }
        .toolbar button,
        .admin-row-actions button {
          min-height: 34px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.52);
          color: inherit;
          font-weight: 700;
        }
        .color-palette {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .color-palette button {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.7);
          box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.22);
        }
        .admin-check-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.3);
        }
        .admin-check-row input {
          width: 16px;
          height: 16px;
          margin: 0;
          padding: 0;
        }
        .form-tip {
          display: flex;
          align-items: center;
          min-height: 44px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px dashed rgba(148, 163, 184, 0.18);
          color: rgba(148, 163, 184, 0.92);
          font-size: 12px;
          line-height: 1.6;
        }
        .admin-form-actions {
          display: flex;
          justify-content: flex-end;
        }
        .admin-form-actions button {
          min-height: 40px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid rgba(59, 130, 246, 0.35);
          background: linear-gradient(90deg, #3b82f6, #22d3ee);
          color: #fff;
          font-weight: 900;
        }
        .preview-item,
        .list-item {
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.52);
          padding: 14px;
        }
        .preview-meta,
        .list-item-head,
        .list-tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .preview-meta span,
        .preview-meta b,
        .preview-meta i,
        .list-item-head span,
        .list-item-head b,
        .list-tags small {
          font-style: normal;
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 900;
        }
        .preview-meta span,
        .list-item-head span {
          color: #818cf8;
          background: rgba(99, 102, 241, 0.16);
        }
        .preview-meta b,
        .list-item-head b {
          color: #34d399;
          background: rgba(16, 185, 129, 0.16);
        }
        .preview-meta i,
        .list-tags small {
          color: #94a3b8;
          background: rgba(148, 163, 184, 0.12);
        }
        .preview-item h3,
        .list-item h3 {
          margin: 12px 0 8px;
          font-size: 18px;
          font-weight: 900;
        }
        .preview-summary,
        .list-item p,
        .empty-copy {
          margin: 0;
          color: rgba(148, 163, 184, 0.92);
          line-height: 1.7;
        }
        .preview-cover {
          width: 100%;
          margin-top: 12px;
          border-radius: 14px;
          display: block;
          border: 1px solid rgba(148, 163, 184, 0.18);
        }
        .preview-html {
          margin-top: 12px;
          color: #e5e7eb;
          line-height: 1.8;
          font-size: 14px;
        }
        .preview-html :global(p),
        .preview-html :global(ul),
        .preview-html :global(ol),
        .preview-html :global(blockquote),
        .preview-html :global(h3),
        .preview-html :global(h4) {
          margin: 0 0 12px;
        }
        .preview-html :global(ul),
        .preview-html :global(ol) {
          padding-left: 20px;
        }
        .list-wrap {
          display: grid;
          gap: 12px;
        }
        .list-item time {
          display: block;
          margin-top: 10px;
          color: rgba(148, 163, 184, 0.9);
          font-size: 12px;
        }
        .admin-row-actions {
          display: flex;
          gap: 10px;
          margin-top: 12px;
        }
        .admin-row-actions .danger {
          color: #fca5a5;
          border-color: rgba(248, 113, 113, 0.28);
        }
        @media (max-width: 1180px) {
          .admin-announcement-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .admin-form-grid,
          .admin-form-grid.triple {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
