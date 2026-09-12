import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, filters). */
  actions?: React.ReactNode;
  /** Renders a small "Back" link above the title. */
  backHref?: string;
  backLabel?: string;
}

/**
 * Every app page starts with this: the page's only <h1> plus a one-line
 * description, as required by the architecture contract.
 */
function PageHeader({ title, description, actions, backHref, backLabel = "Back", className, ...props }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)} {...props}>
      <div className="min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export { PageHeader };
