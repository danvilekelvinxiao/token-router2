import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminTeamsPage() {
  return (
    <>
      <Head><title>团队管理 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/teams">
        <TeamTokenPoolConsole initialTab="teams" />
      </AdminLayout>
    </>
  );
}
