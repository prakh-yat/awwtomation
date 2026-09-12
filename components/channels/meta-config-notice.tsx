import { AlertTriangle } from "lucide-react";

import type { MetaConfigured } from "./connect-buttons";

const REQUIRED: Array<{ key: keyof MetaConfigured; label: string; vars: string[] }> = [
  { key: "instagram", label: "Instagram Login", vars: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"] },
  { key: "facebook", label: "Facebook Login", vars: ["META_APP_ID", "META_APP_SECRET"] },
];

/** Shown to admins when the server is missing Meta credentials; names the exact env vars so setup is unambiguous. */
export function MetaConfigNotice({ configured }: { configured: MetaConfigured }) {
  const missing = REQUIRED.filter((r) => !configured[r.key]);
  if (missing.length === 0) return null;

  return (
    <div role="status" className="mb-6 flex gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[13px]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">Meta app not configured</p>
        <p className="text-muted-foreground">
          {missing.map((m) => m.label).join(" and ")} {missing.length === 1 ? "is" : "are"} unavailable until these environment
          variables are set on the server, then restart the app:
        </p>
        <ul className="space-y-0.5 text-muted-foreground">
          {missing.map((m) => (
            <li key={m.key}>
              <span className="text-foreground">{m.label}:</span>{" "}
              {m.vars.map((v, i) => (
                <span key={v}>
                  <code className="rounded border bg-muted px-1 py-px font-mono text-[12px] text-foreground">{v}</code>
                  {i < m.vars.length - 1 ? ", " : ""}
                </span>
              ))}
            </li>
          ))}
          <li>
            Webhooks also need{" "}
            <code className="rounded border bg-muted px-1 py-px font-mono text-[12px] text-foreground">META_WEBHOOK_VERIFY_TOKEN</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
