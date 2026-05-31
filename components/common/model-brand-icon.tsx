import ModelLogo from "@/components/ModelLogo";

type ModelBrandIconProps = {
  model?: string;
  provider?: string;
  size?: number;
  className?: string;
};

export default function ModelBrandIcon({
  model = "",
  provider = "",
  size = 28,
  className = "",
}: ModelBrandIconProps) {
  return <ModelLogo model={model} provider={provider} size={size} className={className} />;
}
