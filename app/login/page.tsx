import type { Metadata } from "next";
import Link from "next/link";

import { DirectMessagePanel } from "@/components/marketing/hero-visual";
import { Logo } from "@/components/ui/logo";
import { brand } from "@/lib/brand";
import { sanitizeNextPath } from "@/lib/utils";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  // The root layout's title template appends " · Awwtomation".
  title: "Sign in",
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
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="flex min-h-screen flex-col px-6 py-5 sm:px-10">
        <div className="flex h-10 items-center">
          <Link
            href="/"
            aria-label={`${brand.name} home`}
            className="-mx-1 flex items-center rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo size={24} />
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[360px] flex-1 animate-fade-in flex-col justify-center py-16">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.022em]">Sign in to {brand.name}</h1>
          <p className="mt-2 text-[15px] leading-[1.6] text-muted-foreground">
            Use your Google account. If you’re new, the same button creates your account.
          </p>

          <div className="mt-8">
            <LoginForm next={next} error={error} />
          </div>

          <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
            By continuing you agree to our{" "}
            <Link href="/terms" className="text-foreground/80 underline underline-offset-2 hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-foreground/80 underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <p className="text-[12px] text-muted-foreground">{brand.tagline}</p>
      </div>

      <aside className="hidden border-l bg-muted/40 lg:flex lg:items-center lg:justify-center lg:px-12">
        <div className="w-full max-w-[380px]">
          <DirectMessagePanel />
          <p className="mt-8 text-[15px] leading-[1.65] text-muted-foreground">
            Once you’re in, connect an Instagram professional account or a Facebook Page through Meta’s login. Then pick a
            post, choose a keyword and write the message people get when they comment.
          </p>
        </div>
      </aside>
    </main>
  );
}
