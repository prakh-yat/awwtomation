import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo size={32} withWordmark={false} />
      <p className="mt-8 font-mono text-xs uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The link may be broken, or the page may have been moved or deleted.
      </p>
      <div className="mt-8 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft />
            Home
          </Link>
        </Button>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
