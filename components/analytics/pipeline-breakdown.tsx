import Link from "next/link";

import { stagger } from "@/components/charts/stagger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { stageColorClasses } from "@/lib/pipelines/colors";
import type { PipelineBreakdown } from "@/lib/services/analytics";
import { cn, formatNumber } from "@/lib/utils";

import { CardLink } from "./card-link";

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
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle>Pipeline</CardTitle>
          {/* The one card not filtered by the date range, so it says so. */}
          {pipeline ? (
            <CardDescription>
              Where the {formatNumber(pipeline.total)} contact{pipeline.total === 1 ? "" : "s"} in {pipeline.name} sit today.
            </CardDescription>
          ) : null}
        </div>
        {pipeline ? <CardLink href={`/contacts?pipelineId=${encodeURIComponent(pipeline.pipelineId)}&view=board`}>Open board</CardLink> : null}
      </CardHeader>
      <CardContent>
        {!pipeline ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            No pipelines yet.{" "}
            <Link href="/contacts/pipelines" className="font-semibold text-ink underline underline-offset-4 hover:no-underline">
              Set one up
            </Link>
          </p>
        ) : (
          <>
            {pipelines.length > 1 ? (
              <nav aria-label="Pipelines" className="scrollbar-none mb-4 inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-fog p-1">
                {pipelines.map((p) => {
                  const active = p.pipelineId === pipeline.pipelineId;
                  return (
                    <Link
                      key={p.pipelineId}
                      href={hrefFor(p.pipelineId)}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-ink text-white" : "text-muted-foreground hover:bg-background hover:text-ink",
                      )}
                    >
                      {p.name}
                    </Link>
                  );
                })}
              </nav>
            ) : null}

            <div
              className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-fog"
              role="img"
              aria-label={`${pipeline.name}: ${pipeline.stages.map((s) => `${s.stage} ${s.count}`).join(", ")}`}
            >
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
              {pipeline.stages.map((s, i) => (
                <li key={s.stageId} className="rise" style={stagger(i)}>
                  <Link
                    href={`/contacts?pipelineId=${encodeURIComponent(pipeline.pipelineId)}&stageId=${encodeURIComponent(s.stageId)}`}
                    className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] outline-none transition-colors hover:bg-fog focus-visible:bg-fog"
                  >
                    <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", stageColorClasses(s.color).dot)} />
                    <span className="min-w-0 flex-1 truncate">{s.stage}</span>
                    <span className="font-semibold tabular-nums">{formatNumber(s.count)}</span>
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
