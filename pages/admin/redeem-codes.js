import Head from "next/head";
import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

/* ==================== Helpers ==================== */

function maskCode(code) {
  if (!code || code.length < 16) return code;
  const parts = code.split("-");
  if (parts.length >= 4) return `${parts[0]}-${parts[1]}-****-${parts[parts.length - 1]}`;
  return `${code.slice(0, 12)}****${code.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return "永不过期";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

const STATUS_MAP = {
  unused: { label: "未使用", color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  used: { label: "已使用", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
  disabled: { label: "已禁用", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  expired: { label: "已过期", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
};

const SOURCE_MAP = {
  taobao: "淘宝",
  manual: "手动发放",
  promo: "活动赠送",
  gift: "客服补偿",
};

const TYPE_LABELS = { balance: "余额", token: "Token" };

const AMOUNT_OPTIONS = [20, 50, 100, 200, 500, 1000];
const TOKEN_OPTIONS = [
  { label: "100K Token", value: 100000 },
  { label: "500K Token", value: 500000 },
  { label: "1M Token", value: 1000000 },
  { label: "5M Token", value: 5000000 },
];
const EXPIRE_OPTIONS = [
  { label: "永不过期", value: "" },
  { label: "7 天", value: "7d" },
  { label: "30 天", value: "30d" },
  { label: "90 天", value: "90d" },
  { label: "自定义日期", value: "custom" },
];

function computeExpiry(option, customDate) {
  if (!option) return null;
  if (option === "custom" && customDate) return new Date(customDate).toISOString();
  if (option === "7d") return new Date(Date.now() + 7 * 86400000).toISOString();
  if (option === "30d") return new Date(Date.now() + 30 * 86400000).toISOString();
  if (option === "90d") return new Date(Date.now() + 90 * 86400000).toISOString();
  return null;
}

/* ==================== Main Page ==================== */

export default function RedeemCodesPage() {
  const [codes, setCodes] = useState([]);
  const [records, setRecords] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("codes"); // codes | records | batches
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState("");

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [createResult, setCreateResult] = useState(null);

  // Form states
  const [form, setForm] = useState({ name: "淘宝 ¥100 充值码", type: "balance", amountCny: 100, tokenAmount: "", priceCny: 100, source: "taobao", note: "", expireOption: "", expireDate: "" });
  const [batchForm, setBatchForm] = useState({ name: "", type: "balance", amountCny: 100, tokenAmount: "", priceCny: 100, source: "taobao", quantity: 10, note: "", expireOption: "", expireDate: "" });

  async function loadData() {
    setLoading(true);
    try {
      const [codesRes, recordsRes, batchesRes] = await Promise.all([
        fetch(`/api/admin/activation-codes?${new URLSearchParams({ status: filterStatus, source: filterSource, search })}`),
        fetch("/api/admin/activation-codes?action=records"),
        fetch("/api/admin/activation-codes?action=batches"),
      ]);
      if (codesRes.ok) setCodes((await codesRes.json()).codes || []);
      if (recordsRes.ok) setRecords((await recordsRes.json()).records || []);
      if (batchesRes.ok) setBatches((await batchesRes.json()).batches || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [filterStatus, filterSource]);

  async function handleCreate() {
    if (!form.amountCny && !form.tokenAmount) return;
    const body = {
      name: form.name,
      type: form.type,
      amountCny: form.type === "balance" ? Number(form.amountCny) : 0,
      tokenAmount: form.type === "token" ? Number(form.tokenAmount) : 0,
      priceCny: Number(form.priceCny) || Number(form.amountCny),
      source: form.source,
      note: form.note,
      expiredAt: computeExpiry(form.expireOption, form.expireDate),
    };
    const res = await fetch("/api/admin/activation-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok && data.code) {
      setCreateResult(data.code);
    }
    loadData();
  }

  async function handleBatch() {
    const body = {
      name: batchForm.name || `淘宝 ¥${batchForm.amountCny} 激活码批次`,
      type: batchForm.type,
      amountCny: batchForm.type === "balance" ? Number(batchForm.amountCny) : 0,
      tokenAmount: batchForm.type === "token" ? Number(batchForm.tokenAmount) : 0,
      priceCny: Number(batchForm.priceCny) || Number(batchForm.amountCny),
      source: batchForm.source,
      quantity: Number(batchForm.quantity),
      note: batchForm.note,
      expiredAt: computeExpiry(batchForm.expireOption, batchForm.expireDate),
    };
    const res = await fetch("/api/admin/activation-codes?action=batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setCreateResult({ batch: true, codes: data.codes, count: data.codes?.length });
    }
    setShowBatch(false);
    loadData();
  }

  async function handleDisable(id) {
    if (!confirm("确认禁用该激活码？")) return;
    await fetch("/api/admin/activation-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm("确认删除该激活码？此操作不可撤销。")) return;
    await fetch("/api/admin/activation-codes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  }

  function exportCSV(items, filename) {
    const header = "code,name,type,amountCny,tokenAmount,priceCny,status,source,createdAt,expiredAt,usedAt\n";
    const rows = items.map((c) => [
      c.code, c.name, c.type, c.amountCny, c.tokenAmount, c.priceCny, c.status, c.source, c.createdAt, c.expiredAt || "", c.usedAt || ""
    ].join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Head><title>激活码管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/redeem-codes">
        <div className="redeem-admin-page">
          {/* Header */}
          <header className="redeem-admin-header">
            <div>
              <h1>激活码管理</h1>
              <p>创建、发放和管理淘宝激活码，用户可在充值页自助兑换余额或 Token 额度。</p>
            </div>
            <div className="redeem-admin-actions">
              <button type="button" className="redeem-btn primary" onClick={() => { setShowCreate(true); setCreateResult(null); }}>创建激活码</button>
              <button type="button" className="redeem-btn" onClick={() => { setShowBatch(true); setCreateResult(null); }}>批量生成</button>
              <button type="button" className="redeem-btn" onClick={() => exportCSV(codes, `激活码_${new Date().toISOString().slice(0,10)}.csv`)}>导出激活码</button>
              <button type="button" className="redeem-btn" onClick={() => setTab("records")}>查看兑换记录</button>
            </div>
          </header>

          {/* Tabs */}
          <div className="redeem-tabs">
            {[
              { key: "codes", label: "激活码列表" },
              { key: "records", label: "兑换记录" },
              { key: "batches", label: "批次管理" },
            ].map((t) => (
              <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {/* Filters */}
          {tab === "codes" && (
            <div className="redeem-filters">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">全部状态</option>
                <option value="unused">未使用</option>
                <option value="used">已使用</option>
                <option value="disabled">已禁用</option>
                <option value="expired">已过期</option>
              </select>
              <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
                <option value="all">全部来源</option>
                <option value="taobao">淘宝</option>
                <option value="promo">活动赠送</option>
                <option value="manual">手动发放</option>
                <option value="gift">客服补偿</option>
              </select>
              <input type="text" placeholder="搜索激活码..." value={search} onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadData(); }} />
              <button type="button" className="redeem-btn" onClick={loadData}>搜索</button>
            </div>
          )}

          {/* ===== Activation Codes Table ===== */}
          {tab === "codes" && (
            <div className="redeem-table-wrap">
              {loading ? <p className="redeem-empty">加载中...</p> : codes.length === 0 ? <p className="redeem-empty">暂无激活码</p> : (
                <table className="redeem-table">
                  <thead>
                    <tr>
                      <th>激活码</th>
                      <th>名称</th>
                      <th>类型</th>
                      <th>兑换额度</th>
                      <th>售价</th>
                      <th>来源</th>
                      <th>状态</th>
                      <th>使用用户</th>
                      <th>有效期</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((c) => {
                      const st = STATUS_MAP[c.status] || STATUS_MAP.unused;
                      const isExpired = c.expiredAt && new Date(c.expiredAt) < new Date() && c.status === "unused";
                      const displayStatus = isExpired ? STATUS_MAP.expired : st;
                      return (
                        <tr key={c.id}>
                          <td>
                            <code>{maskCode(c.code)}</code>
                            <button type="button" className="redeem-copy-btn" onClick={() => copyText(c.code)} title="复制完整激活码">{copied === c.code ? "已复制" : "复制"}</button>
                          </td>
                          <td>{c.name}</td>
                          <td>{TYPE_LABELS[c.type] || c.type}</td>
                          <td>{c.type === "balance" ? `¥${c.amountCny}` : `${(c.tokenAmount / 1000).toFixed(0)}K Token`}</td>
                          <td>¥{c.priceCny}</td>
                          <td>{SOURCE_MAP[c.source] || c.source}</td>
                          <td><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: displayStatus.bg, color: displayStatus.color }}>{displayStatus.label}</span></td>
                          <td>{c.usedByUserName || "-"}</td>
                          <td>{c.expiredAt ? new Date(c.expiredAt).toLocaleDateString("zh-CN") : "永不过期"}</td>
                          <td>{new Date(c.createdAt).toLocaleDateString("zh-CN")}</td>
                          <td className="redeem-row-actions">
                            {c.status === "unused" && (
                              <>
                                <button type="button" onClick={() => copyText(c.code)}>复制</button>
                                <button type="button" className="danger" onClick={() => handleDisable(c.id)}>禁用</button>
                              </>
                            )}
                            {(c.status === "disabled" || c.status === "expired" || (isExpired && c.status === "unused")) && (
                              <button type="button" className="danger" onClick={() => handleDelete(c.id)}>删除</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ===== Redemption Records ===== */}
          {tab === "records" && (
            <div className="redeem-table-wrap">
              {records.length === 0 ? <p className="redeem-empty">暂无兑换记录</p> : (
                <table className="redeem-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>用户</th>
                      <th>激活码</th>
                      <th>类型</th>
                      <th>兑换额度</th>
                      <th>来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.redeemedAt)}</td>
                        <td>{r.userName || r.userId}</td>
                        <td><code>{maskCode(r.code)}</code></td>
                        <td>{TYPE_LABELS[r.type] || r.type}</td>
                        <td>{r.type === "balance" ? `¥${r.amountCny}` : `${(r.tokenAmount / 1000).toFixed(0)}K Token`}</td>
                        <td>{SOURCE_MAP[r.source] || r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ===== Batches ===== */}
          {tab === "batches" && (
            <div className="redeem-table-wrap">
              {batches.length === 0 ? <p className="redeem-empty">暂无批次</p> : (
                <table className="redeem-table">
                  <thead>
                    <tr>
                      <th>批次名称</th>
                      <th>数量</th>
                      <th>面额</th>
                      <th>类型</th>
                      <th>来源</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id}>
                        <td>{b.name}</td>
                        <td>{b.quantity}</td>
                        <td>{b.type === "balance" ? `¥${b.amountCny}` : `${(b.tokenAmount / 1000).toFixed(0)}K Token`}</td>
                        <td>{TYPE_LABELS[b.type] || b.type}</td>
                        <td>{SOURCE_MAP[b.source] || b.source}</td>
                        <td>{formatDate(b.createdAt)}</td>
                        <td>
                          <button type="button" onClick={() => exportCSV(b.codes.map((code) => ({ code, name: b.name, type: b.type, amountCny: b.amountCny, tokenAmount: b.tokenAmount, priceCny: b.priceCny, status: "unused", source: b.source, createdAt: b.createdAt, expiredAt: b.expiredAt || "", usedAt: "" })), `批次_${b.name}_激活码.csv`)}>导出</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ===== Create Modal ===== */}
          {showCreate && (
            <div className="redeem-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
              <div className="redeem-modal">
                <header>
                  <h2>创建激活码</h2>
                  <button type="button" onClick={() => setShowCreate(false)}>×</button>
                </header>
                {createResult && !createResult.batch ? (
                  <div className="redeem-result">
                    <strong>激活码创建成功</strong>
                    <code>{createResult.code}</code>
                    <div className="redeem-result-actions">
                      <button type="button" onClick={() => copyText(createResult.code)}>{copied === createResult.code ? "已复制" : "复制激活码"}</button>
                      <button type="button" onClick={() => { setShowCreate(false); loadData(); }}>查看列表</button>
                      <button type="button" onClick={() => { setCreateResult(null); setForm({ name: "淘宝 ¥100 充值码", type: "balance", amountCny: 100, tokenAmount: "", priceCny: 100, source: "taobao", note: "", expireOption: "", expireDate: "" }); }}>继续创建</button>
                    </div>
                  </div>
                ) : (
                  <div className="redeem-modal-body">
                    <label>名称 <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                    <label>兑换类型
                      <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                        <option value="balance">余额</option>
                        <option value="token">Token</option>
                      </select>
                    </label>
                    {form.type === "balance" ? (
                      <div className="redeem-amount-grid">
                        <span>兑换金额</span>
                        <div>
                          {AMOUNT_OPTIONS.map((v) => (
                            <button key={v} type="button" className={form.amountCny === v ? "active" : ""} onClick={() => setForm({ ...form, amountCny: v })}>¥{v}</button>
                          ))}
                          <input type="number" placeholder="自定义" value={form.amountCny === 0 || !AMOUNT_OPTIONS.includes(form.amountCny) ? form.amountCny : ""} onChange={(e) => setForm({ ...form, amountCny: Number(e.target.value) || 0 })} />
                        </div>
                      </div>
                    ) : (
                      <div className="redeem-amount-grid">
                        <span>Token 额度</span>
                        <div>
                          {TOKEN_OPTIONS.map((opt) => (
                            <button key={opt.value} type="button" className={form.tokenAmount === opt.value ? "active" : ""} onClick={() => setForm({ ...form, tokenAmount: opt.value })}>{opt.label}</button>
                          ))}
                          <input type="number" placeholder="自定义" value={form.tokenAmount && !TOKEN_OPTIONS.find((o) => o.value === form.tokenAmount) ? form.tokenAmount : ""} onChange={(e) => setForm({ ...form, tokenAmount: Number(e.target.value) || 0 })} />
                        </div>
                      </div>
                    )}
                    <label>售卖价格 <input type="number" value={form.priceCny} onChange={(e) => setForm({ ...form, priceCny: Number(e.target.value) || 0 })} placeholder="¥100" /></label>
                    <label>有效期
                      <select value={form.expireOption} onChange={(e) => setForm({ ...form, expireOption: e.target.value })}>
                        {EXPIRE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </label>
                    {form.expireOption === "custom" && <label>自定义日期 <input type="date" value={form.expireDate} onChange={(e) => setForm({ ...form, expireDate: e.target.value })} /></label>}
                    <label>来源
                      <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                        <option value="taobao">淘宝</option>
                        <option value="manual">手动发放</option>
                        <option value="promo">活动赠送</option>
                        <option value="gift">客服补偿</option>
                      </select>
                    </label>
                    <label>备注 <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="淘宝订单号 / 活动名称" /></label>
                    <footer>
                      <button type="button" className="redeem-btn" onClick={() => setShowCreate(false)}>取消</button>
                      <button type="button" className="redeem-btn primary" onClick={handleCreate}>保存并生成</button>
                    </footer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== Batch Modal ===== */}
          {showBatch && (
            <div className="redeem-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowBatch(false); }}>
              <div className="redeem-modal">
                <header>
                  <h2>批量生成激活码</h2>
                  <button type="button" onClick={() => setShowBatch(false)}>×</button>
                </header>
                {createResult?.batch ? (
                  <div className="redeem-result">
                    <strong>批量生成成功</strong>
                    <p>已生成 {createResult.count} 个激活码</p>
                    <div className="redeem-result-actions">
                      <button type="button" onClick={() => exportCSV(createResult.codes.map((code) => ({ code, name: batchForm.name, type: batchForm.type, amountCny: batchForm.amountCny, tokenAmount: batchForm.tokenAmount, priceCny: batchForm.priceCny, status: "unused", source: batchForm.source, createdAt: new Date().toISOString(), expiredAt: computeExpiry(batchForm.expireOption, batchForm.expireDate) || "", usedAt: "" })), `批量激活码_${new Date().toISOString().slice(0,10)}.csv`)}>导出 CSV</button>
                      <button type="button" onClick={() => { setShowBatch(false); setCreateResult(null); loadData(); }}>查看列表</button>
                    </div>
                  </div>
                ) : (
                  <div className="redeem-modal-body">
                    <label>批次名称 <input value={batchForm.name} onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })} placeholder="淘宝 ¥100 激活码 2026-05 批次" /></label>
                    <label>生成数量 <input type="number" min={1} max={500} value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) || 0 })} /></label>
                    <label>兑换类型
                      <select value={batchForm.type} onChange={(e) => setBatchForm({ ...batchForm, type: e.target.value })}>
                        <option value="balance">余额</option>
                        <option value="token">Token</option>
                      </select>
                    </label>
                    {batchForm.type === "balance" ? (
                      <div className="redeem-amount-grid"><span>兑换金额</span><div>{AMOUNT_OPTIONS.map((v) => (<button key={v} type="button" className={batchForm.amountCny === v ? "active" : ""} onClick={() => setBatchForm({ ...batchForm, amountCny: v })}>¥{v}</button>))}<input type="number" placeholder="自定义" value={batchForm.amountCny === 0 || !AMOUNT_OPTIONS.includes(batchForm.amountCny) ? batchForm.amountCny : ""} onChange={(e) => setBatchForm({ ...batchForm, amountCny: Number(e.target.value) || 0 })} /></div></div>
                    ) : (
                      <div className="redeem-amount-grid"><span>Token 额度</span><div>{TOKEN_OPTIONS.map((opt) => (<button key={opt.value} type="button" className={batchForm.tokenAmount === opt.value ? "active" : ""} onClick={() => setBatchForm({ ...batchForm, tokenAmount: opt.value })}>{opt.label}</button>))}<input type="number" placeholder="自定义" value={batchForm.tokenAmount && !TOKEN_OPTIONS.find((o) => o.value === batchForm.tokenAmount) ? batchForm.tokenAmount : ""} onChange={(e) => setBatchForm({ ...batchForm, tokenAmount: Number(e.target.value) || 0 })} /></div></div>
                    )}
                    <label>售卖价格 <input type="number" value={batchForm.priceCny} onChange={(e) => setBatchForm({ ...batchForm, priceCny: Number(e.target.value) || 0 })} /></label>
                    <label>有效期 <select value={batchForm.expireOption} onChange={(e) => setBatchForm({ ...batchForm, expireOption: e.target.value })}>{EXPIRE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></label>
                    {batchForm.expireOption === "custom" && <label>自定义日期 <input type="date" value={batchForm.expireDate} onChange={(e) => setBatchForm({ ...batchForm, expireDate: e.target.value })} /></label>}
                    <label>来源 <select value={batchForm.source} onChange={(e) => setBatchForm({ ...batchForm, source: e.target.value })}><option value="taobao">淘宝</option><option value="manual">手动发放</option><option value="promo">活动赠送</option><option value="gift">客服补偿</option></select></label>
                    <label>备注 <input value={batchForm.note} onChange={(e) => setBatchForm({ ...batchForm, note: e.target.value })} /></label>
                    <footer>
                      <button type="button" className="redeem-btn" onClick={() => setShowBatch(false)}>取消</button>
                      <button type="button" className="redeem-btn primary" onClick={handleBatch}>批量生成</button>
                    </footer>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </>
  );
}
