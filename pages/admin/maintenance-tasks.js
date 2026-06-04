import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";
import TokenPoolMaintenanceCenter from "@/components/admin/TokenPoolMaintenanceCenter";

export default function MaintenanceTasksPage() {
  return (
    <>
      <Head><title>维护任务中心 - FlowAPI Admin</title></Head>
      <AdminLayout currentPath="/admin/maintenance-tasks">
        <TokenPoolMaintenanceCenter initialTab="reports" />
      </AdminLayout>
    </>
  );
}
