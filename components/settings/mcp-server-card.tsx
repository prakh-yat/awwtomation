"use client";

import * as React from "react";

import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Segmented } from "@/components/ui/segmented";

type AppId = "claude" | "chatgpt" | "claude-code" | "cursor";

const APPS: Array<{ value: AppId; label: string }> = [
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
];

type Guide = { steps: string[]; snippet?: { label: string; code: string } };

function guideFor(app: AppId, url: string): Guide {
  switch (app) {
    case "claude":
      return {
        steps: ["In Claude, open Settings, then Connectors.", "Choose Add custom connector, name it Awwtomation and paste the URL.", "Select Connect, sign in and pick the workspaces it can use."],
      };
    case "chatgpt":
      return {
        steps: [
          "In ChatGPT, open Settings, then Apps and Connectors, and turn on Developer mode under Advanced settings.",
          "Choose Create, paste the URL and pick OAuth.",
          "Sign in and pick the workspaces it can use.",
        ],
      };
    case "claude-code":
      return {
        steps: ["Run this in a terminal.", "Then run /mcp in Claude Code, choose awwtomation and sign in."],
        snippet: { label: "Command", code: `claude mcp add --transport http awwtomation ${url}` },
      };
    case "cursor":
      return {
        steps: ["Add this to ~/.cursor/mcp.json.", "In Cursor's MCP settings, select Connect next to awwtomation and sign in."],
        snippet: { label: "mcp.json", code: JSON.stringify({ mcpServers: { awwtomation: { url } } }, null, 2) },
      };
  }
}

/** The URL to paste into an AI app, and where each app wants it. */
export function McpServerCard({ url }: { url: string }) {
  const [app, setApp] = React.useState<AppId>("claude");
  const guide = guideFor(app, url);

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 className="brand-label text-muted-foreground">MCP server URL</h2>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-fog px-3.5 py-2.5 font-mono text-[13px] text-ink" title={url}>
            {url}
          </code>
          <CopyButton value={url} label="Copy" successMessage="URL copied" />
        </div>
        <p className="mt-2.5 text-[13px] leading-5 text-muted-foreground">
          Each app gets its own client ID and secret when you connect it, and signs in with your Awwtomation account. There is nothing else to copy.
        </p>
      </div>

      <div className="mt-5 border-t px-5 pb-6 pt-5 sm:px-6">
        <Segmented value={app} onChange={setApp} options={APPS} size="sm" aria-label="AI app" className="max-w-md" />
        <ol className="mt-4 space-y-2 text-[14px] leading-6">
          {guide.steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold tabular-nums text-white">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {guide.snippet ? (
          <div className="mt-4 overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-fog/60 px-3.5 py-1.5">
              <span className="brand-label text-muted-foreground">{guide.snippet.label}</span>
              <CopyButton value={guide.snippet.code} variant="ghost" successMessage="Copied" />
            </div>
            <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-5 text-ink">{guide.snippet.code}</pre>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
