import LiveNumber from "@/components/ui/live-number";

type WalletSummaryStatProps = {
  label: string;
  value?: number | string | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  note?: string;
};

export default function WalletSummaryStat({ label, value, prefix = "", suffix = "", decimals, note }: WalletSummaryStatProps) {
  const hasNumericValue = typeof value === "number" && Number.isFinite(value);
  const display = value === null || value === undefined || value === "" ? "暂无数据" : value;

  return (
    <article className="wallet-summary-stat">
      <span>{label}</span>
      <strong>
        {hasNumericValue ? (
          <LiveNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
        ) : (
          String(display)
        )}
      </strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}
