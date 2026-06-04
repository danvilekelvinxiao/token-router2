import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminTokenPoolPage() {
  return (
    <>
      <Head><title>团队 Token 池 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/token-pool">
        <TeamTokenPoolConsole initialTab="tokens" />
      </AdminLayout>
    </>
  );
}
