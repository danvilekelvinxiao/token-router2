import Image from "next/image";
import { useState } from "react";

type PaymentMethodIconProps = {
  method: "alipay" | "wechat" | "usdt" | "taobao" | "crypto" | string;
  size?: number;
  className?: string;
};

const PAYMENT_LOGOS: Record<string, { src: string; alt: string }> = {
  alipay: { src: "/icons/payments/alipay.svg", alt: "Alipay" },
  wechat: { src: "/icons/payments/wechat-pay.svg", alt: "WeChat Pay" },
  usdt: { src: "/icons/payments/usdt.svg", alt: "USDT" },
  taobao: { src: "/icons/payments/taobao-code.svg", alt: "Taobao" },
};

export default function PaymentMethodIcon({ method, size = 42, className = "" }: PaymentMethodIconProps) {
  const key = String(method || "").toLowerCase();
  const normalized = key === "taobao_code" ? "taobao" : key === "crypto" ? "usdt" : key;
  const logo = PAYMENT_LOGOS[normalized] || PAYMENT_LOGOS.usdt;
  const [failedSrc, setFailedSrc] = useState("");
  const failed = failedSrc === logo.src;

  return (
    <span className={`payment-brand-icon payment-brand-icon-${normalized}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {failed ? (
        <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={logo.alt}>
          <rect x="6" y="8" width="36" height="32" rx="12" fill="currentColor" opacity="0.12" />
          <path d="M14 24h20M24 14v20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="34" cy="15" r="4" fill="currentColor" opacity="0.55" />
        </svg>
      ) : (
        <Image src={logo.src} alt={logo.alt} width={size} height={size} draggable={false} onError={() => setFailedSrc(logo.src)} />
      )}
    </span>
  );
}
