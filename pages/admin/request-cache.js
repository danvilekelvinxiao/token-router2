import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminRequestCachePage() {
  return (
    <>
      <Head><title>请求缓存配置 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/request-cache">
        <TeamTokenPoolConsole initialTab="cache" />
      </AdminLayout>
    </>
  );
}
