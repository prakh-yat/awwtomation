"use client";

import * as React from "react";
import type { PlanTier } from "@prisma/client";

import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

import { Tick } from "./plans";

export type ComparisonValue = string | boolean;
export type ComparisonPlan = { tier: PlanTier; label: string };
export type ComparisonGroup = { group: string; rows: Array<{ label: string; values: ComparisonValue[] }> };

function Value({ value }: { value: ComparisonValue }) {
  if (typeof value === "string") return <>{value}</>;
  return <Tick included={value} label={value ? "Included" : "Not included"} />;
}

/**
 * What each plan includes. From md up every plan sits side by side with the
 * recommended one in yellow; on a phone you pick a plan and read its column,
 * rather than scrolling a wide table sideways.
 */
function PlanComparison({
  plans,
  groups,
  recommended,
  className,
}: {
  plans: ComparisonPlan[];
  /** `values` follow the order of `plans`. */
  groups: ComparisonGroup[];
  recommended: PlanTier;
  className?: string;
}) {
  const [selected, setSelected] = React.useState<PlanTier>(recommended);
  const index = Math.max(
    0,
    plans.findIndex((p) => p.tier === selected),
  );
  const lastGroup = groups.length - 1;

  return (
    <div className={className}>
      <div className="md:hidden">
        <div className="sticky top-20 z-10 rounded-full shadow-[0_10px_24px_-14px_rgb(15_15_15/0.35)]">
          <Segmented<PlanTier>
            aria-label="Plan"
            value={selected}
            onChange={setSelected}
            options={plans.map((p) => ({ value: p.tier, label: p.label }))}
          />
        </div>
        {groups.map((group) => (
          <div key={group.group} className="mt-8">
            <h3 className="brand-label text-[12px] text-muted-foreground">{group.group}</h3>
            <dl className="mt-3">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-6 border-t py-3.5">
                  <dt className="text-[15px] leading-snug">{row.label}</dt>
                  <dd className="shrink-0 text-right text-[15px] font-semibold tabular-nums">
                    <Value value={row.values[index]} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <table className="hidden w-full border-separate border-spacing-0 text-left md:table">
        <caption className="sr-only">What each plan includes</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[34%]">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((p) => (
              <th
                key={p.tier}
                scope="col"
                className={cn(
                  "px-3 py-4 text-center font-display text-[22px] leading-none tracking-[-0.03em] lg:text-[26px]",
                  p.tier === recommended && "rounded-t-2xl bg-yellow",
                )}
              >
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group, g) => (
          <tbody key={group.group}>
            <tr>
              <th scope="rowgroup" className="brand-label pb-3 pt-10 text-[12px] font-normal text-muted-foreground">
                {group.group}
              </th>
              {plans.map((p) => (
                <td key={p.tier} className={cn(p.tier === recommended && "bg-yellow-soft")} />
              ))}
            </tr>
            {group.rows.map((row, r) => {
              const last = g === lastGroup && r === group.rows.length - 1;
              return (
                <tr key={row.label}>
                  <th scope="row" className="border-t py-3.5 pr-6 text-[15px] font-normal leading-snug">
                    {row.label}
                  </th>
                  {row.values.map((value, i) => (
                    <td
                      key={plans[i].tier}
                      className={cn(
                        "border-t px-3 py-3.5 text-center text-[15px] tabular-nums",
                        plans[i].tier === recommended && "bg-yellow-soft font-semibold",
                        plans[i].tier === recommended && last && "rounded-b-2xl",
                      )}
                    >
                      <Value value={value} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export { PlanComparison };
