import LiveNumber from "@/components/ui/live-number";

type WalletSummaryStatProps = {
  label: string;
  value?: number | string | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  note?: string;
  tone?: "primary" | "token" | "saving" | "warning" | "default";
  onClick?: () => void;
  actionLabel?: string;
};

export default function WalletSummaryStat({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals,
  note,
  tone = "default",
  onClick,
  actionLabel = "查看详情",
}: WalletSummaryStatProps) {
  const hasNumericValue = typeof value === "number" && Number.isFinite(value);
  const display = value === null || value === undefined || value === "" ? "—" : value;
  const className = `wallet-summary-stat tone-${tone}${hasNumericValue ? " is-numeric-value" : " is-text-value"}${onClick ? " is-clickable" : ""}`;
  const content = (
    <>
      <span>{label}</span>
      <strong>
        {hasNumericValue ? (
          <LiveNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
        ) : (
          String(display)
        )}
      </strong>
      {note ? <small>{note}</small> : null}
      {onClick ? <em>{actionLabel}</em> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className={className}>{content}</article>;
}
