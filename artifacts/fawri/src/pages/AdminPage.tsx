import { AdminPageView } from '@/pages/admin/AdminPageView';
import { useAdminPageController } from '@/pages/admin/useAdminPageController';

export default function AdminPage() {
  const model = useAdminPageController();
  return <AdminPageView model={model} />;
}
