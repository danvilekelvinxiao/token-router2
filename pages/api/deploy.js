import { handleDeployInfo } from "@/lib/deploy-info-handler";

export default function handler(req, res) {
  return handleDeployInfo(req, res);
}
