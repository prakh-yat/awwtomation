"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-[18px] w-[18px] shrink-0 rounded-[6px] border border-[hsl(0_0%_78%)] bg-background transition-colors hover:border-ink/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white data-[state=indeterminate]:border-ink data-[state=indeterminate]:bg-ink data-[state=indeterminate]:text-white",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex animate-pop items-center justify-center text-current")}>
      {props.checked === "indeterminate" ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Check className="h-3 w-3" strokeWidth={3} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
