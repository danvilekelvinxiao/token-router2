import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminTeamUsageLogsPage() {
  return (
    <>
      <Head><title>团队调用日志 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/team-usage-logs">
        <TeamTokenPoolConsole initialTab="logs" />
      </AdminLayout>
    </>
  );
}
