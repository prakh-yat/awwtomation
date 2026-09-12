import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FeatureCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description, className, ...props }: FeatureCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col rounded-lg border bg-card p-6 shadow-card transition-colors hover:border-foreground/30",
        className,
      )}
      {...props}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-background text-foreground">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export { FeatureCard };
