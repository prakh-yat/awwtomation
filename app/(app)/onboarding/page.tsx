import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoMark, Wordmark } from "@/components/ui/logo";
import { getCurrentUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import { defaultOrganizationName } from "@/lib/services/organizations";
import { getWorkspaceContext } from "@/lib/workspace/context";

import { OnboardingForm } from "./onboarding-form";
import { StepIndicator } from "./step-indicator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create your organization" };

/**
 * Shown only to signed-in users with no organization to open (declined or
 * expired invite, left their only team, or the login bootstrap failed). Anyone
 * who already has one goes straight to the dashboard.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fonboarding");

  const ctx = await getWorkspaceContext();
  if (ctx) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 space-y-4 text-center">
          <Link href="/" aria-label={brand.name} className="inline-flex items-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LogoMark size={26} />
            <Wordmark height={12} />
          </Link>
          <StepIndicator current={1} />
        </div>

        <div className="rounded-lg border bg-card p-8 shadow-card">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Create your organization</h1>
            <p className="text-sm text-muted-foreground">
              An organization holds your plan and your team, and its first workspace holds your connected accounts and
              automations. Next you&apos;ll connect an Instagram or Facebook account.
            </p>
          </div>

          <OnboardingForm defaultName={defaultOrganizationName(user)} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
          {" · "}
          <Link href="/auth/signout" className="underline underline-offset-2 hover:text-foreground">
            Sign out
          </Link>
        </p>
      </div>
    </main>
  );
}
