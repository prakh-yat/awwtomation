import type { Metadata } from "next";
import Link from "next/link";

import { brand } from "@/lib/brand";
import { sanitizeNextPath } from "@/lib/utils";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: `Sign in · ${brand.name}`,
  description: `Sign in to ${brand.name} with your Google account.`,
};

type SearchParams = Promise<{ next?: string | string[]; error?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = sanitizeNextPath(first(params.next), "/dashboard");
  const error = first(params.error);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-6 text-center">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            {brand.name}
          </Link>
        </div>

        <div className="rounded-lg border bg-card p-8 shadow-card">
          <div className="mb-6 space-y-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Sign in to {brand.name}</h1>
            <p className="text-sm text-muted-foreground">Use your Google account to continue. No password needed.</p>
          </div>

          <LoginForm next={next} error={error} />

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">{brand.tagline}</p>
      </div>
    </main>
  );
}
