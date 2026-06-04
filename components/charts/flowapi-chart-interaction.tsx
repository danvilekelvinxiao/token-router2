import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

export const CHART_MOTION = {
  animationDuration: 420,
  animationEasing: "ease-out",
};

export const TOOLTIP_MOTION = {
  duration: 140,
};

export function clampChartValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getNearestChartIndex({
  clientX,
  rect,
  count,
  viewWidth,
  plotLeft = 0,
  plotWidth,
}: {
  clientX: number;
  rect: DOMRect | { left: number; width: number };
  count: number;
  viewWidth?: number;
  plotLeft?: number;
  plotWidth?: number;
}) {
  if (!rect?.width || count <= 0) return -1;
  const virtualWidth = viewWidth || rect.width;
  const activePlotWidth = plotWidth || virtualWidth;
  const viewX = ((clientX - rect.left) / Math.max(1, rect.width)) * virtualWidth;
  const ratio = clampChartValue((viewX - plotLeft) / Math.max(1, activePlotWidth), 0, 1);
  return clampChartValue(Math.round(ratio * (count - 1)), 0, count - 1);
}

export function getClampedTooltipPosition({
  clientX,
  clientY,
  width = 280,
  height = 180,
  offsetX = 16,
  offsetY = -76,
}: {
  clientX: number;
  clientY: number;
  width?: number;
  height?: number;
  offsetX?: number;
  offsetY?: number;
}) {
  if (typeof window === "undefined") {
    return { x: clientX + offsetX, y: clientY + offsetY };
  }
  let x = clientX + offsetX;
  let y = clientY + offsetY;
  if (x + width > window.innerWidth - 12) x = clientX - width - offsetX;
  if (y < 12) y = clientY + 18;
  if (y + height > window.innerHeight - 12) y = window.innerHeight - height - 12;
  return {
    x: clampChartValue(x, 12, Math.max(12, window.innerWidth - width - 12)),
    y: clampChartValue(y, 12, Math.max(12, window.innerHeight - height - 12)),
  };
}

export function useRafSnappedIndex({
  containerRef,
  count,
  viewWidth,
  plotLeft = 0,
  plotWidth,
  onActivate,
  onLeave,
}: {
  containerRef: MutableRefObject<HTMLElement | SVGSVGElement | SVGRectElement | null>;
  count: number;
  viewWidth?: number;
  plotLeft?: number;
  plotWidth?: number;
  onActivate?: (index: number, event: MouseEvent | Touch) => void;
  onLeave?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ clientX: number; event: MouseEvent | Touch } | null>(null);
  const activeRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const pending = pendingRef.current;
    const node = containerRef.current;
    if (!pending || !node || count <= 0) return;
    const rect = node.getBoundingClientRect();
    const index = getNearestChartIndex({
      clientX: pending.clientX,
      rect,
      count,
      viewWidth,
      plotLeft,
      plotWidth,
    });
    if (index < 0) return;
    if (activeRef.current !== index) {
      activeRef.current = index;
      setActiveIndex(index);
    }
    onActivate?.(index, pending.event);
  }, [containerRef, count, onActivate, plotLeft, plotWidth, viewWidth]);

  const schedule = useCallback((event: MouseEvent | Touch) => {
    pendingRef.current = { clientX: event.clientX, event };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(flush);
  }, [flush]);

  const clear = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = null;
    activeRef.current = null;
    setActiveIndex(null);
    onLeave?.();
  }, [onLeave]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return {
    activeIndex,
    setActiveIndex,
    handleMouseMove: (event: { clientX: number; nativeEvent?: MouseEvent }) => schedule((event.nativeEvent || event) as MouseEvent),
    handleTouchMove: (event: { touches?: TouchList }) => {
      if (event.touches?.[0]) schedule(event.touches[0]);
    },
    handleLeave: clear,
  };
}
