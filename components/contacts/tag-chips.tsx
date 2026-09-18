import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TagChipsProps {
  tags: string[];
  /** Chips beyond this collapse into a "+N" pill with a tooltip listing the rest. */
  max?: number;
  className?: string;
}

/** Compact tag list for table cells. */
function TagChips({ tags, max = 3, className }: TagChipsProps) {
  if (tags.length === 0) return <span className="text-muted-foreground">–</span>;
  const visible = tags.slice(0, max);
  const hidden = tags.slice(max);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visible.map((tag) => (
        <Badge key={tag} variant="secondary" className="max-w-[10rem] truncate">
          {tag}
        </Badge>
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="cursor-default tabular-nums">
              +{hidden.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{hidden.join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export { TagChips };
