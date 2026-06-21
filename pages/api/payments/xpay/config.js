import { getXPayConfigAsync, getXPayMappingGuide, isXPayConfiguredAsync } from "@/lib/payments/xpay";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const gateway = await getXPayConfigAsync();
  return res.status(200).json({
    ok: true,
    configured: await isXPayConfiguredAsync(),
    mappingGuide: getXPayMappingGuide(),
    gateway: {
      ...gateway,
      qrContent: gateway.qrContent ? gateway.qrContent : "",
      qrImage: gateway.qrImage || "",
    },
  });
}
