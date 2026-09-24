import { ON_DARK } from "@/components/billing/on-dark";
import { GridBlock } from "@/components/layout/grid-block";
import { CopyButton } from "@/components/ui/copy-button";

/** The one thing to take from this page: the URL an AI app connects to. */
export function McpServerCard({ url }: { url: string }) {
  return (
    <GridBlock tone="indigo" gridSize="48px" className="rise rounded-3xl px-6 py-6 sm:px-8 sm:py-7">
      <p className="brand-label text-white/70">MCP server URL</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 truncate rounded-2xl bg-white/10 px-4 py-3 font-mono text-[15px] text-white ring-1 ring-inset ring-white/20" title={url}>
          {url}
        </code>
        <CopyButton value={url} label="Copy" size="lg" variant="secondary" className={ON_DARK.primary} successMessage="URL copied" />
      </div>
    </GridBlock>
  );
}
