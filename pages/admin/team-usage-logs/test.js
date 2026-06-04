import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TokenPoolMaintenanceCenter from "@/components/admin/TokenPoolMaintenanceCenter";

export default function TeamUsageLogTestPage() {
  return (
    <>
      <Head><title>日志完整性测试 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/team-usage-logs">
        <TokenPoolMaintenanceCenter initialTab="tests" />
      </AdminLayout>
    </>
  );
}
