import { useEffect, useRef } from "react";

type SafePollingCallback = () => void | Promise<void>;

type SafePollingOptions = {
  callback: SafePollingCallback;
  intervalMs: number;
  enabled?: boolean;
  pauseWhenHidden?: boolean;
  pauseWhenInputFocused?: boolean;
  runOnMount?: boolean;
};

function isTypingTarget(target: Element | null) {
  if (!target) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.hasAttribute("contenteditable");
}

export function useSafePolling({
  callback,
  intervalMs,
  enabled = true,
  pauseWhenHidden = true,
  pauseWhenInputFocused = false,
  runOnMount = false,
}: SafePollingOptions) {
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !Number.isFinite(intervalMs) || intervalMs <= 0 || typeof window === "undefined") return undefined;

    let stopped = false;

    async function tick() {
      if (stopped || runningRef.current) return;
      if (pauseWhenHidden && document.visibilityState === "hidden") return;
      if (pauseWhenInputFocused && isTypingTarget(document.activeElement)) return;

      runningRef.current = true;
      try {
        await callbackRef.current();
      } finally {
        runningRef.current = false;
      }
    }

    if (runOnMount) {
      void tick();
    }

    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, pauseWhenHidden, pauseWhenInputFocused, runOnMount]);
}
