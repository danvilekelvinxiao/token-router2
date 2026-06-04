import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TokenPoolMaintenanceCenter from "@/components/admin/TokenPoolMaintenanceCenter";

export default function TokenPoolMaintenancePage() {
  return (
    <>
      <Head><title>Token 池维护中心 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/token-pool/maintenance">
        <TokenPoolMaintenanceCenter initialTab="check" />
      </AdminLayout>
    </>
  );
}
