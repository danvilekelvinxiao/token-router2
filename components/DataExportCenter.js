import { useMemo, useState } from "react";

const RANGE_OPTIONS = [
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" },
  { value: "month", label: "本月" },
];

const EXPORTS = [
  {
    key: "billing",
    title: "充值账单",
    description: "充值时间、订单号、支付方式、订单内容、支付金额、状态。",
    button: "导出充值账单",
    endpoint: "/api/user/export/billing-records",
  },
  {
    key: "usage",
    title: "使用记录",
    description: "使用时间、API Key、分组、模型、输入 Token、输出 Token、总 Token、花费、节省金额、套餐价格。",
    button: "导出使用记录",
    endpoint: "/api/user/export/usage-records",
  },
  {
    key: "model",
    title: "模型数据分析包",
    description: "使用时间、模型名、Token、花费、请求次数、成功率。",
    button: "导出模型分析包",
    endpoint: "/api/user/export/model-analysis",
  },
  {
    key: "package",
    title: "套餐与兑换记录",
    description: "兑换时间、套餐名称、激活码、有效期、到账金额、状态。",
    button: "导出套餐与兑换记录",
    endpoint: "/api/user/export/package-records",
  },
];

function getRangeDates(range) {
  const end = new Date();
  const start = new Date(end);
  if (range === "month") {
    start.setDate(1);
  } else {
    const days = range === "7d" ? 6 : 29;
    start.setDate(end.getDate() - days);
  }
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function filenameFromDisposition(disposition, fallback) {
  const encoded = String(disposition || "").match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  const plain = String(disposition || "").match(/filename="?([^";]+)"?/i)?.[1];
  return plain || fallback;
}

export default function DataExportCenter({ variant = "default" }) {
  const [range, setRange] = useState("30d");
  const [activeKey, setActiveKey] = useState("");
  const [message, setMessage] = useState("");
  const dates = useMemo(() => getRangeDates(range), [range]);

  async function downloadExport(item) {
    setActiveKey(item.key);
    setMessage("正在生成 Excel...");
    try {
      const params = new URLSearchParams({ ...dates, format: "xlsx" });
      const response = await fetch(`${item.endpoint}?${params.toString()}`);
      if (response.status === 204) {
        setMessage("暂无可导出的数据。");
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "导出失败，请稍后重试。");
      }
      const blob = await response.blob();
      const fallback = `FlowAPI_${item.title}_${dates.startDate}_${dates.endDate}.xlsx`;
      const fileName = filenameFromDisposition(response.headers.get("content-disposition"), fallback);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setMessage("Excel 已生成并开始下载。");
    } catch (error) {
      setMessage(error.message || "导出失败，请稍后重试。");
    } finally {
      setActiveKey("");
    }
  }

  return (
    <section className={`data-export-center data-export-${variant}`}>
      <div className="data-export-head">
        <div>
          <span>{variant === "logs" ? "导出记录" : "数据导出中心"}</span>
          <h2>{variant === "logs" ? "导出记录" : "导出你的 FlowAPI 对账数据"}</h2>
          <p>账单、使用记录和模型分析都按当前登录用户生成，API Key 默认脱敏。</p>
        </div>
        <label>
          <span>时间范围</span>
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="data-export-grid">
        {EXPORTS.map((item) => (
          <article key={item.key} className="data-export-card">
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
            <button type="button" onClick={() => downloadExport(item)} disabled={Boolean(activeKey)}>
              {activeKey === item.key ? "正在生成 Excel..." : item.button}
            </button>
          </article>
        ))}
      </div>
      {message ? <p className="data-export-message">{message}</p> : null}
    </section>
  );
}
