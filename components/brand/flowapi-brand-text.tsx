type FlowApiBrandTextProps = {
  text?: string;
  size?: "sm" | "md" | "lg" | "xl";
  animated?: boolean;
  className?: string;
};

export default function FlowApiBrandText({
  text = "FlowAPI",
  size = "md",
  animated = true,
  className = "",
}: FlowApiBrandTextProps) {
  return (
    <span
      className={[
        "flowapi-brand-gradient",
        `flowapi-brand-gradient-${size}`,
        animated ? "is-animated" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      {text}
    </span>
  );
}
