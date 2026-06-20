import Image from "next/image";
import { useState } from "react";
import { getProvider } from "@/lib/providers";

interface ProviderLogoProps {
  providerId?: string;
  size?: number;
  variant?: "circle" | "rounded" | "plain";
  className?: string;
}

export default function ProviderLogo({
  providerId = "unknown",
  size = 28,
  variant = "rounded",
  className = "",
}: ProviderLogoProps) {
  const provider = getProvider(providerId);
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = provider.logo;

  const fallback = (
    <span
      className="provider-logo-fallback"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: variant === "circle" ? "50%" : variant === "rounded" ? "8px" : "4px",
        background: provider.bgColor,
        color: provider.color,
        fontSize: Math.max(10, size * 0.42),
        fontWeight: 800,
        flexShrink: 0,
        lineHeight: 1,
        userSelect: "none",
      }}
      title={provider.label}
    >
      {provider.fallbackText}
    </span>
  );

  if (!logoUrl || imgFailed) return fallback;

  return (
    <Image
      src={logoUrl}
      alt={provider.label}
      width={size}
      height={size}
      className={`provider-logo ${className}`}
      style={{
        borderRadius: variant === "circle" ? "50%" : variant === "rounded" ? "8px" : "4px",
        objectFit: "contain",
        flexShrink: 0,
        background: "transparent",
      }}
      onError={() => setImgFailed(true)}
      draggable={false}
    />
  );
}

export function ProviderLogoCircle({
  providerId,
  size = 22,
}: {
  providerId?: string;
  size?: number;
}) {
  return <ProviderLogo providerId={providerId} size={size} variant="circle" />;
}

export function ProviderLogoSmall({
  providerId,
  size = 18,
}: {
  providerId?: string;
  size?: number;
}) {
  return <ProviderLogo providerId={providerId} size={size} variant="rounded" />;
}
