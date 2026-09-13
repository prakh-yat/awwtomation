import Link from "next/link";
import { SquareKanban } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { stageColorClasses } from "@/lib/pipelines/colors";
import type { PipelineBreakdown } from "@/lib/services/analytics";
import { cn, formatNumber } from "@/lib/utils";

function share(count: number, total: number): string {
  if (total <= 0) return "0%";
  const value = (count / total) * 100;
  return `${value > 0 && value < 1 ? "<1" : Math.round(value)}%`;
}

/**
 * Where contacts sit today in one pipeline: a stacked bar in the stage
 * colours (a contact's stage colour is the same everywhere in the app) and a
 * labelled row per stage, so colour is never the only way to read it.
 */
export function PipelineBreakdownCard({
  pipelines,
  selectedId,
  hrefFor,
}: {
  pipelines: PipelineBreakdown[];
  selectedId: string | null;
  /** Link that keeps the page's other filters and switches the pipeline. */
  hrefFor: (pipelineId: string) => string;
}) {
  const pipeline = pipelines.find((p) => p.pipelineId === selectedId) ?? pipelines[0] ?? null;

  return (
    <Card>
      <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>
            {pipeline
              ? `Where the ${formatNumber(pipeline.total)} contact${pipeline.total === 1 ? "" : "s"} in ${pipeline.name} sit today.`
              : "Where contacts sit in your pipelines today."}
          </CardDescription>
        </div>
        {pipeline ? (
          <Link
            href={`/contacts?pipelineId=${encodeURIComponent(pipeline.pipelineId)}&view=board`}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <SquareKanban className="h-3.5 w-3.5" aria-hidden />
            Open board
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {!pipeline ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            No pipelines yet.{" "}
            <Link href="/contacts/pipelines" className="text-foreground underline underline-offset-4">
              Set one up
            </Link>
          </p>
        ) : (
          <>
            {pipelines.length > 1 ? (
              <nav aria-label="Pipelines" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 scrollbar-none">
                {pipelines.map((p) => {
                  const active = p.pipelineId === pipeline.pipelineId;
                  return (
                    <Link
                      key={p.pipelineId}
                      href={hrefFor(p.pipelineId)}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {p.name}
                    </Link>
                  );
                })}
              </nav>
            ) : null}

            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pipeline.name}: ${pipeline.stages.map((s) => `${s.stage} ${s.count}`).join(", ")}`}>
              {pipeline.total > 0
                ? pipeline.stages
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <span
                        key={s.stageId}
                        title={`${s.stage}: ${formatNumber(s.count)} (${share(s.count, pipeline.total)})`}
                        className={cn("h-full min-w-[4px]", stageColorClasses(s.color).dot)}
                        style={{ flexGrow: s.count, flexBasis: 0 }}
                      />
                    ))
                : null}
            </div>

            <ul className="mt-4 divide-y">
              {pipeline.stages.map((s) => (
                <li key={s.stageId}>
                  <Link
                    href={`/contacts?pipelineId=${encodeURIComponent(pipeline.pipelineId)}&stageId=${encodeURIComponent(s.stageId)}`}
                    className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] transition-colors hover:bg-accent/60"
                  >
                    <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", stageColorClasses(s.color).dot)} />
                    <span className="min-w-0 flex-1 truncate">{s.stage}</span>
                    <span className="font-medium tabular-nums">{formatNumber(s.count)}</span>
                    <span className="w-10 text-right tabular-nums text-muted-foreground">{share(s.count, pipeline.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
