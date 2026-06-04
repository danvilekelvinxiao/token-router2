import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminTeamReportsPage() {
  return (
    <>
      <Head><title>团队报表 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/team-reports">
        <TeamTokenPoolConsole initialTab="reports" />
      </AdminLayout>
    </>
  );
}
