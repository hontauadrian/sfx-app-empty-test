import { redirect } from 'next/navigation';
import { ADMIN_COMPANY_INFO_ROUTE } from '@/features/admin-shell/constants';

export default function AdminPage(): never {
  redirect(ADMIN_COMPANY_INFO_ROUTE);
}
