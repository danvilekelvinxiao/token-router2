import walletSummaryHandler from "@/pages/api/user/wallet-summary";

export default function handler(req, res) {
  return walletSummaryHandler(req, res);
}
