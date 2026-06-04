import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TokenPoolMaintenanceCenter from "@/components/admin/TokenPoolMaintenanceCenter";

export default function RateLimitTestPage() {
  return (
    <>
      <Head><title>限流压力测试 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/rate-limits">
        <TokenPoolMaintenanceCenter initialTab="tests" />
      </AdminLayout>
    </>
  );
}
