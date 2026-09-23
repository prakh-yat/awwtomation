import type { Metadata } from "next";
import Link from "next/link";

import { GridBlock } from "@/components/layout/grid-block";
import { Logo } from "@/components/ui/logo";
import { PlatformMark } from "@/components/ui/platform-badge";
import { brand } from "@/lib/brand";
import { sanitizeNextPath } from "@/lib/utils";

import { LoginForm } from "./login-form";
import { SignInArt } from "./sign-in-art";

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
    <main className="flex min-h-dvh flex-col bg-background lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* The brand block: yellow on the site's grid, with the one line that says what this is. */}
      <GridBlock
        tone="yellow"
        gridSize="clamp(56px, 8vw, 120px)"
        className="relative flex flex-col overflow-hidden px-5 pb-9 pt-5 sm:px-10 sm:pb-12 lg:min-h-dvh lg:px-12 lg:pb-12 lg:pt-8"
      >
        <Link
          href="/"
          aria-label={`${brand.name} home`}
          className="-mx-1 flex items-center self-start rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo size={28} />
        </Link>

        <SignInArt className="hidden flex-1 items-center justify-center py-10 lg:flex" />

        <div className="mt-16 sm:mt-24 lg:mt-0">
          <p className="font-display text-[clamp(2.75rem,9vw,5rem)] leading-[0.85] tracking-[-0.035em] lg:text-[clamp(2.75rem,6vw,6.25rem)]">
            <span className="block">Comments in.</span>
            <span className="block">DMs out.</span>
          </p>
          <p className="mt-6 flex items-center gap-2 text-[15px] font-semibold">
            <PlatformMark platform="INSTAGRAM" size={24} aria-hidden />
            <PlatformMark platform="FACEBOOK" size={24} aria-hidden />
            <span className="ml-1">Instagram and Messenger</span>
          </p>
        </div>
      </GridBlock>

      <section className="flex flex-1 flex-col px-5 py-10 sm:px-10 lg:min-h-dvh lg:px-12">
        <div className="mx-auto flex w-full max-w-[380px] flex-1 animate-fade-in flex-col justify-center motion-reduce:animate-none">
          <h1 className="font-display text-[40px] leading-none sm:text-[48px]">Sign in</h1>
          <p className="mt-3 text-[15px] text-muted-foreground">New here? The same button creates your account.</p>

          <div className="mt-8">
            <LoginForm next={next} error={error} />
          </div>

          <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
            By continuing you agree to our{" "}
            <Link href="/terms" className="font-medium text-ink underline underline-offset-4 hover:text-ink/70">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-ink underline underline-offset-4 hover:text-ink/70">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
