"use client";

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export default function VirtualUsageLogTable({ items = [], typeLabels = {}, onOpenImage, onOpenCall }) {
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 10,
  });

  const columns = useMemo(() => ([
    { key: "time", label: "时间", width: "180px" },
    { key: "id", label: "请求 ID", width: "220px" },
    { key: "apiKey", label: "API Key", width: "180px" },
    { key: "model", label: "模型", width: "160px" },
    { key: "type", label: "类型", width: "100px" },
    { key: "group", label: "分组", width: "100px" },
    { key: "tokens", label: "消耗 Token", width: "120px" },
    { key: "cost", label: "消耗金额", width: "120px" },
    { key: "status", label: "状态", width: "100px" },
    { key: "latency", label: "耗时", width: "90px" },
    { key: "action", label: "操作", width: "80px" },
  ]), []);

  return (
    <div className="flowapi-virtual-log-shell">
      <div className="flowapi-virtual-log-head" style={{ gridTemplateColumns: columns.map((column) => column.width).join(" ") }}>
        {columns.map((column) => <div key={column.key}>{column.label}</div>)}
      </div>
      <div ref={parentRef} className="flowapi-virtual-log-body">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;
            const isImage = item.type === "image" || String(item.id || "").startsWith("img_");
            const openHref = isImage
              ? `/images/history?requestId=${encodeURIComponent(item.id)}`
              : `/dashboard?callId=${encodeURIComponent(item.id || "")}`;
            return (
              <div
                key={item.id}
                className="flowapi-virtual-log-row"
                style={{
                  gridTemplateColumns: columns.map((column) => column.width).join(" "),
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div>{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                <div className="flowapi-virtual-log-mono">{item.id}</div>
                <div>{item.apiKeyLabel ? `${item.apiKeyLabel} · ${item.apiKeyMasked}` : "-"}</div>
                <div>{item.model || "-"}</div>
                <div>{typeLabels[item.type] || item.type}</div>
                <div>{item.group || "-"}</div>
                <div className="flowapi-virtual-log-mono">{Number(item.totalTokens || 0).toFixed(1)}</div>
                <div className="flowapi-virtual-log-mono">￥{Number(item.moneyCost || 0).toFixed(2)}</div>
                <div>
                  {item.status === "成功" || item.status === "success" ? (
                    <span className="flowapi-virtual-log-pill success">{item.statusCode || 200}</span>
                  ) : (
                    <span className="flowapi-virtual-log-pill error">{item.statusCode || "err"}</span>
                  )}
                </div>
                <div>{item.latencyMs ? `${item.latencyMs} ms` : "-"}</div>
                <div>
                  <button
                    type="button"
                    className="flowapi-virtual-log-link"
                    onClick={() => {
                      if (isImage) {
                        onOpenImage?.(openHref);
                      } else {
                        onOpenCall?.(openHref);
                      }
                    }}
                  >
                    查看
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
