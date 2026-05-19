import { exportToExcel } from "@/lib/export-excel";
import { useState } from "react";

export default function ExportExcelButton({ fileName, sheets, children = "导出 Excel", className = "", headerMap }) {
  const [exporting, setExporting] = useState(false);
  return (
    <button
      type="button"
      className={`excel-export-btn ${className}`}
      disabled={exporting}
      onClick={async () => {
        setExporting(true);
        try {
          await exportToExcel({ fileName, sheets, headerMap });
        } finally {
          setExporting(false);
        }
      }}
    >
      {exporting ? "导出中..." : children}
    </button>
  );
}
