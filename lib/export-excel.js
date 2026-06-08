import ExcelJS from "exceljs";

const defaultHeaderMap = {
  metric: "指标名称",
  label: "指标名称",
  name: "名称",
  title: "标题",
  value: "当前值",
  description: "说明",
  updatedAt: "更新时间",
  time: "时间",
  createdAt: "时间",
  date: "日期",
  amount: "金额",
  cost: "成本",
  spend: "消耗金额",
  paymentMethod: "支付方式",
  orderId: "订单号",
  status: "状态",
  model: "模型",
  modelId: "Model ID",
  provider: "供应商",
  type: "类型",
  isFree: "是否免费",
  context: "上下文长度",
  scenario: "适用场景",
  price: "价格",
  inputPrice: "输入价格",
  outputPrice: "输出价格",
  apiKey: "API Key",
  source: "来源",
  requests: "请求次数",
  inputTokens: "输入 Token",
  outputTokens: "输出 Token",
  promptTokens: "输入 Token",
  completionTokens: "输出 Token",
  totalTokens: "总 Token",
  tokens: "Token",
  quota: "额度",
  quotaText: "额度",
  validDays: "有效期",
  unitPrice: "单价",
  avgLatency: "平均耗时",
  latency: "响应时间",
  successRate: "成功率",
  errorRate: "错误率",
  errorMessage: "错误原因",
  curl: "Curl 示例",
  baseUrl: "Base URL",
  note: "备注",
};

function normalizeValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return Number.isInteger(value) ? value : Number(value.toFixed(6));
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sanitizeRow(row, headerMap) {
  const output = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    if (["key", "icon", "component", "children", "color", "spark", "href"].includes(key)) return;
    output[headerMap[key] || defaultHeaderMap[key] || key] = normalizeValue(value);
  });
  return output;
}

export function maskSecret(value = "") {
  const text = String(value || "");
  if (!text) return "-";
  if (text.length <= 12) return `${text.slice(0, 4)}****`;
  return `${text.slice(0, 7)}****${text.slice(-4)}`;
}

export function makeExcelFileName(fileName) {
  const date = new Date().toISOString().slice(0, 10);
  const safe = String(fileName || "FlowAPI_导出")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "");
  return safe.endsWith(".xlsx") ? safe : `${safe}_${date}.xlsx`;
}

export async function exportToExcel({ fileName, sheets, headerMap = {} }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FlowAPI";
  workbook.created = new Date();
  const map = { ...defaultHeaderMap, ...headerMap };

  (sheets || []).forEach((sheet, index) => {
    const rows = Array.isArray(sheet.data) && sheet.data.length > 0
      ? sheet.data.map((row) => sanitizeRow(row, map))
      : [{ "说明": "暂无详细数据，完成调用后这里会展示更完整的统计信息。" }];
    const worksheet = workbook.addWorksheet(String(sheet.sheetName || `Sheet${index + 1}`).slice(0, 31));
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.min(Math.max(header.length + 6, 14), 34),
    }));
    rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle" };
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", wrapText: true };
      });
    });
  });

  if (!workbook.worksheets.length) {
    const worksheet = workbook.addWorksheet("导出数据");
    worksheet.columns = [{ header: "说明", key: "说明", width: 36 }];
    worksheet.addRow({ "说明": "暂无可导出的数据" });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = makeExcelFileName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
