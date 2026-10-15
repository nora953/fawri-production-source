import { AdminPageShell } from '@/pages/admin/AdminPageShell';
import { useAdminPageController } from '@/pages/admin/useAdminPageController';

export default function AdminPage() {
  const model = useAdminPageController();
  return <AdminPageShell model={model} />;
}
