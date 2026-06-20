"use client";

import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import ReleaseDateEditor from "@/components/admin/ReleaseDateEditor";

const STATUS_STYLES = {
  available: { label: "可用", color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  testing: { label: "检测中", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  unavailable: { label: "暂不可用", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  coming_soon: { label: "即将开放", color: "#9ca3af", bg: "rgba(156,163,175,0.1)" },
};

export default function ModelDiagnosticsTable({
  products = [],
  testingModel = "",
  togglingModel = "",
  onHealthCheck,
  onToggle,
  onSaveReleaseDate,
  onErrorOpen,
}) {
  const columns = useMemo(() => ([
    {
      accessorKey: "publicModelId",
      header: "public_model_id",
      cell: ({ row }) => <code style={{ fontSize: 11 }}>{row.original.publicModelId}</code>,
    },
    {
      accessorKey: "actualModelId",
      header: "actual_model_id",
      cell: ({ row }) => (
        <code style={{ fontSize: 11, color: row.original.actualModelId ? "var(--dash-text)" : "#ef4444" }}>
          {row.original.actualModelId || "未设置"}
        </code>
      ),
    },
    { accessorKey: "provider", header: "供应商" },
    { accessorKey: "upstreamChannel", header: "上游渠道", cell: ({ row }) => row.original.upstreamChannel || "uniapi" },
    { accessorKey: "group", header: "分组", cell: ({ row }) => <code style={{ fontSize: 11 }}>{row.original.group}</code> },
    {
      accessorKey: "officialReleaseDate",
      header: "官方发布时间",
      cell: ({ row }) => (
        <ReleaseDateEditor
          value={row.original.officialReleaseDate || ""}
          onSave={(nextValue) => onSaveReleaseDate?.(row.original.id, nextValue)}
        />
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const st = STATUS_STYLES[row.original.status] || STATUS_STYLES.unavailable;
        return (
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
            {row.original.statusLabel || st.label}
          </span>
        );
      },
    },
    {
      accessorKey: "isAvailable",
      header: "可用",
      cell: ({ row }) => (
        <span style={{ color: row.original.isAvailable ? "#16a34a" : "#ef4444", fontWeight: 700 }}>
          {row.original.isAvailable ? "是" : "否"}
        </span>
      ),
    },
    {
      accessorKey: "canCreateKey",
      header: "可创建 Key",
      cell: ({ row }) => (
        <span style={{ color: row.original.canCreateKey !== false ? "#16a34a" : "#9ca3af", fontWeight: 700 }}>
          {row.original.canCreateKey !== false ? "是" : "否"}
        </span>
      ),
    },
    {
      accessorKey: "lastHealthCheckAt",
      header: "最后检测",
      cell: ({ row }) => (row.original.lastHealthCheckAt ? new Date(row.original.lastHealthCheckAt).toLocaleString("zh-CN") : "从未"),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              type="button"
              className="redeem-btn small"
              style={{ fontSize: 11, padding: "2px 8px" }}
              disabled={testingModel === p.id || !p.actualModelId}
              onClick={() => onHealthCheck?.(p.id, p.actualModelId)}
            >
              {testingModel === p.id ? "检测中..." : "测试"}
            </button>
            {p.lastError ? (
              <button
                type="button"
                className="redeem-btn small"
                style={{ fontSize: 11, padding: "2px 8px", background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
                onClick={() => onErrorOpen?.(p.displayName, p.lastError)}
              >
                错误
              </button>
            ) : null}
            <button
              type="button"
              className="redeem-btn small"
              style={{ fontSize: 11, padding: "2px 8px" }}
              disabled={togglingModel === p.id}
              onClick={() => onToggle?.(p.id, p.isAvailable)}
            >
              {togglingModel === p.id ? "..." : p.isAvailable ? "禁用" : "启用"}
            </button>
          </div>
        );
      },
    },
  ]), [onErrorOpen, onHealthCheck, onSaveReleaseDate, onToggle, testingModel, togglingModel]);

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="redeem-table-wrap">
      <table className="redeem-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
