import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminTokenAlertsPage() {
  return (
    <>
      <Head><title>Token 异常告警 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/token-alerts">
        <TeamTokenPoolConsole initialTab="status" />
      </AdminLayout>
    </>
  );
}
