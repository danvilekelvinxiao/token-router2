import { useEffect, useMemo, useRef } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import { RUNTIME_ZH_EN_MAP } from "@/lib/i18n/runtime-zh-en-map";

const ATTRS = ["placeholder", "title", "aria-label"];

function hasChinese(text = "") {
  return /[\u4e00-\u9fa5]/.test(text);
}

function replaceByMap(input, entries) {
  let output = String(input || "");
  for (const [zh, en] of entries) {
    if (!output.includes(zh)) continue;
    output = output.split(zh).join(en);
  }
  return output;
}

export default function RuntimeTranslationBridge() {
  const { locale } = useLocale();
  const textNodeOriginalMapRef = useRef(new Map());
  const attrOriginalMapRef = useRef(new WeakMap());

  const entries = useMemo(
    () => Object.entries(RUNTIME_ZH_EN_MAP).sort((a, b) => b[0].length - a[0].length),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    function walkTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node.nodeValue || "";
        const parentTag = node.parentElement?.tagName?.toLowerCase() || "";
        const skip = parentTag === "script" || parentTag === "style" || parentTag === "textarea";
        if (!skip && text.trim()) {
          if (locale === "en-US") {
            if (!textNodeOriginalMapRef.current.has(node)) {
              textNodeOriginalMapRef.current.set(node, text);
            }
            const translated = replaceByMap(text, entries);
            if (translated !== text) node.nodeValue = translated;
          } else {
            const original = textNodeOriginalMapRef.current.get(node);
            if (typeof original === "string" && node.nodeValue !== original) {
              node.nodeValue = original;
            }
          }
        }
        node = walker.nextNode();
      }
    }

    function walkAttributes(root) {
      const elements = root.querySelectorAll("*");
      elements.forEach((el) => {
        if (locale === "en-US") {
          let cached = attrOriginalMapRef.current.get(el);
          if (!cached) cached = {};
          ATTRS.forEach((attr) => {
            const value = el.getAttribute(attr);
            if (!value) return;
            if (!cached[attr]) cached[attr] = value;
            const translated = replaceByMap(value, entries);
            if (translated !== value) el.setAttribute(attr, translated);
          });
          attrOriginalMapRef.current.set(el, cached);
        } else {
          const cached = attrOriginalMapRef.current.get(el);
          if (!cached) return;
          ATTRS.forEach((attr) => {
            if (typeof cached[attr] === "string") {
              el.setAttribute(attr, cached[attr]);
            }
          });
        }
      });
    }

    function runTranslate(root = document.body) {
      if (!root) return;
      if (locale === "en-US" || hasChinese(root.textContent || "")) {
        walkTextNodes(root);
        walkAttributes(root);
      } else {
        walkTextNodes(root);
        walkAttributes(root);
      }
    }

    runTranslate(document.body);
    const timer = window.setTimeout(() => runTranslate(document.body), 60);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) runTranslate(node);
            if (node.nodeType === Node.TEXT_NODE && node.parentElement) runTranslate(node.parentElement);
          });
        }
        if (mutation.type === "characterData" && mutation.target.parentElement) {
          runTranslate(mutation.target.parentElement);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [entries, locale]);

  return null;
}
