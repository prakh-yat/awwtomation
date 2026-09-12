import { AdminNav } from "@/components/admin/admin-nav";
import { requireSuperAdmin } from "@/lib/workspace/context";

/**
 * Every /admin page guards itself with `requireSuperAdmin()`; the layout
 * repeats it so the section nav never renders for a non-admin either.
 */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireSuperAdmin();
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
