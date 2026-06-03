import Image from "next/image";

type PaymentMethodIconProps = {
  method: "alipay" | "wechat" | "usdt" | "taobao" | "crypto" | string;
  size?: number;
  className?: string;
};

const PAYMENT_LOGOS: Record<string, { src: string; alt: string }> = {
  alipay: { src: "/logos/payments/alipay.svg", alt: "Alipay" },
  wechat: { src: "/logos/payments/wechat-pay.svg", alt: "WeChat Pay" },
  usdt: { src: "/logos/payments/usdt.svg", alt: "USDT" },
  taobao: { src: "/logos/payments/taobao.svg", alt: "Taobao" },
};

export default function PaymentMethodIcon({ method, size = 42, className = "" }: PaymentMethodIconProps) {
  const key = String(method || "").toLowerCase();
  const normalized = key === "taobao_code" ? "taobao" : key === "crypto" ? "usdt" : key;
  const logo = PAYMENT_LOGOS[normalized] || PAYMENT_LOGOS.usdt;

  return (
    <span className={`payment-brand-icon payment-brand-icon-${normalized}${className ? ` ${className}` : ""}`} aria-hidden="true">
      <Image src={logo.src} alt={logo.alt} width={size} height={size} draggable={false} />
    </span>
  );
}
