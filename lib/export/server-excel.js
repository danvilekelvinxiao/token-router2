import ExcelJS from "exceljs";

export function formatDateTime(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function maskApiKey(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 10) return `${text.slice(0, 3)}****`;
  return `${text.slice(0, 5)}****${text.slice(-4)}`;
}

export function parseDateFilters(query = {}) {
  const start = query.startDate ? new Date(`${query.startDate}T00:00:00`) : null;
  const end = query.endDate ? new Date(`${query.endDate}T23:59:59.999`) : null;
  return {
    startDate: start && !Number.isNaN(start.getTime()) ? start : null,
    endDate: end && !Number.isNaN(end.getTime()) ? end : null,
    startLabel: query.startDate || "全部",
    endLabel: query.endDate || "至今",
  };
}

export function withinDateRange(value, filters) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return false;
  if (filters.startDate && date < filters.startDate) return false;
  if (filters.endDate && date > filters.endDate) return false;
  return true;
}

function normalizeCell(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isInteger(value) ? value : Number(value.toFixed(6));
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.join("、");
  return String(value);
}

function addSheet(workbook, { name, headers, rows }) {
  const worksheet = workbook.addWorksheet(String(name || "导出数据").slice(0, 31));
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.min(Math.max(String(header).length + 8, 16), 34),
  }));
  rows.forEach((row) => {
    const output = {};
    headers.forEach((header) => {
      output[header] = normalizeCell(row[header]);
    });
    worksheet.addRow(output);
  });
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });
}

export async function sendExcel(res, { fileName, sheets }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FlowAPI";
  workbook.created = new Date();

  sheets.forEach((sheet) => addSheet(workbook, sheet));

  const buffer = await workbook.xlsx.writeBuffer();
  const encodedName = encodeURIComponent(fileName);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(Buffer.from(buffer));
}
