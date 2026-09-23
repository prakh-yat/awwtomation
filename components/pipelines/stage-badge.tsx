import { stageColorClasses } from "@/lib/pipelines/colors";
import { cn } from "@/lib/utils";

/** The small coloured dot that marks a stage everywhere it appears. */
export function StageDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", stageColorClasses(color).dot, className)} />;
}

/** A stage name on its colour. */
export function StagePill({ name, color, title, className }: { name: string; color: string; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", stageColorClasses(color).pill, className)}
    >
      <StageDot color={color} />
      <span className="truncate">{name}</span>
    </span>
  );
}
