import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CenteredPage } from "@/components/layout/centered-page";
import { getCurrentUser } from "@/lib/auth/session";
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
    <CenteredPage
      tone="yellow"
      footer={
        <>
          Signed in as <span className="font-semibold">{user.email}</span>
          {" · "}
          {/* A plain link: `/auth/signout` is a route handler, and a prefetch would sign you out. */}
          <a href="/auth/signout" className="font-semibold underline underline-offset-4">
            Sign out
          </a>
        </>
      }
    >
      <StepIndicator current={1} />
      <h1 className="mt-7 font-display text-[32px] leading-[1.02] text-balance sm:text-[36px]">Create your organization</h1>
      <div className="mt-7">
        <OnboardingForm defaultName={defaultOrganizationName(user)} />
      </div>
    </CenteredPage>
  );
}
