import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TeamTokenPoolConsole from "@/components/admin/TeamTokenPoolConsole";

export default function AdminRateLimitsPage() {
  return (
    <>
      <Head><title>限流规则 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/rate-limits">
        <TeamTokenPoolConsole initialTab="limits" />
      </AdminLayout>
    </>
  );
}
