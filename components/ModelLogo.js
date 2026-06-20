import Image from "next/image";
import { useMemo, useState } from "react";
import { getModelBrand, getModelBrandInitial, getModelBrandLabel } from "@/lib/models/brand";
import { getProvider } from "@/lib/providers";
import { getPublicModelProvider } from "@/lib/public-model-provider";

export function getModelProvider(model = "", provider = "") {
  return getModelBrand(model, provider);
}

export function getModelProviderLabel(model = "", provider = "") {
  return getPublicModelProvider({ displayName: model, provider });
}

export default function ModelLogo({ model = "", provider = "", size = 24, className = "" }) {
  const key = getModelProvider(model, provider);
  const label = getModelBrandLabel(model, provider);
  const initial = getModelBrandInitial(model, provider);
  const providerInfo = useMemo(() => getProvider(key), [key]);
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = providerInfo?.logo || "";

  return (
    <span
      aria-label={`${label} Logo`}
      className={`model-logo model-logo-${key}${className ? ` ${className}` : ""}`}
      role="img"
      style={{ "--model-logo-size": `${size}px` }}
      title={label}
    >
      {logoUrl && !imgFailed ? (
        <Image
          src={logoUrl}
          alt={label}
          width={size}
          height={size}
          draggable={false}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="model-logo-fallback">{initial}</span>
      )}
    </span>
  );
}

export function ModelNameWithLogo({ model = "", provider = "", size = 24, className = "" }) {
  return (
    <span className={`model-name-cell${className ? ` ${className}` : ""}`}>
      <ModelLogo model={model} provider={provider} size={size} />
      <span className="model-text">
        <strong className="model-name">{model || "Unknown Model"}</strong>
        <small className="model-provider">{getModelProviderLabel(model, provider)}</small>
      </span>
    </span>
  );
}
