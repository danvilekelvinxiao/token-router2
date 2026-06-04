import { assertCustomerOwner } from "@/lib/session";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  return res.status(200).json({
    ok: true,
    members: [
      {
        id: session.customerId,
        userId: session.customerId,
        role: "owner",
        memberName: "当前账号",
        status: "active",
      },
    ],
  });
}
