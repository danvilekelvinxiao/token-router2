import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminTokenPoolStatusPage() {
  return (
    <>
      <Head><title>Token 状态监控 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/token-pool">
        <TeamTokenPoolConsole initialTab="status" />
      </AdminLayout>
    </>
  );
}
