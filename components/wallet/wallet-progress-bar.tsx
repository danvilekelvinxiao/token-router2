import { clampWalletProgress } from "@/lib/wallet/format-wallet";
import type { WalletStatusTone } from "@/lib/wallet/calculate-wallet-status";

type WalletProgressBarProps = {
  progressPercent?: number;
  tone?: WalletStatusTone;
};

export default function WalletProgressBar({ progressPercent = 0, tone = "healthy" }: WalletProgressBarProps) {
  const progress = clampWalletProgress(progressPercent);
  const showGlow = progress > 0 && tone !== "expired";

  return (
    <div className={`wallet-progress-track tone-${tone}`} aria-label={`钱包使用进度 ${progress.toFixed(1)}%`}>
      <div className="wallet-progress-fill" style={{ width: `${progress}%` }}>
        {showGlow ? <i className="wallet-progress-glow" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}
