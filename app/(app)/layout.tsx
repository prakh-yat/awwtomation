import type { Metadata } from "next";

import { AppFrame } from "@/components/app-shell/app-frame";
import { getRequestPathname, ONBOARDING_PATH, requireWorkspaceContext } from "@/lib/workspace/context";

export const metadata: Metadata = {
  // Never index the product itself; only marketing pages are public.
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // /onboarding lives under (app) but must render for users with no workspace
  // yet — the guard below would redirect it to itself. Middleware already
  // guarantees a signed-in user, and the page itself is a full-screen wizard,
  // so it renders without the sidebar frame.
  const pathname = await getRequestPathname();
  if (pathname === ONBOARDING_PATH) {
    return <>{children}</>;
  }

  const ctx = await requireWorkspaceContext();

  return (
    <AppFrame
      user={{ name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarUrl }}
      workspaces={ctx.memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, plan: m.workspace.plan }))}
      activeWorkspaceId={ctx.workspace.id}
      role={ctx.role}
      isSuperAdmin={ctx.isSuperAdmin}
    >
      <div className="mx-auto w-full max-w-[1400px] animate-fade-in px-6 py-6 lg:px-8">{children}</div>
    </AppFrame>
  );
}
