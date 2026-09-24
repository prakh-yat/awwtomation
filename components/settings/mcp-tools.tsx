"use client";

import * as React from "react";
import type { WorkspaceRole } from "@prisma/client";
import { ChevronDown, Lock, Search, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { TONES, type Tone } from "@/components/ui/tone";
import { cn, initials } from "@/lib/utils";
import { roleLabel, roleRank } from "@/lib/workspace/permissions";

import { apiFetch, errorMessage } from "./client-api";

export type ToolKind = "read" | "write" | "destructive";
export type McpToolItem = { name: string; title: string; description: string; minRole: WorkspaceRole | null; kind: ToolKind };
export type McpToolGroupItem = { id: string; label: string; tone: Tone; tools: McpToolItem[] };
export type ToolMember = { userId: string; name: string | null; email: string; avatarUrl: string | null; role: WorkspaceRole };
export type ToolAccessSetting = { everyone: boolean; userIds: string[] };

/** tool name → what the owner set. A tool that is not here follows its default. */
type AccessState = Record<string, ToolAccessSetting>;

/** What a tool does to the workspace, in the colours statuses use: green reads, orange changes, red can't be undone. */
const KIND: Record<ToolKind, { label: string; className: string }> = {
  read: { label: "Read", className: "bg-green-soft text-green-ink" },
  write: { label: "Write", className: "bg-orange-soft text-orange-ink" },
  destructive: { label: "Destructive", className: "bg-destructive/10 text-destructive" },
};

function memberName(member: ToolMember): string {
  return member.name?.trim() || member.email;
}

/** Tool descriptions are written for the AI app; people get the first sentence, which says what it does. */
function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text);
  return match ? match[1] : text;
}

function roleAllows(member: ToolMember, tool: McpToolItem): boolean {
  return roleRank(member.role) >= roleRank(tool.minRole ?? "MEMBER");
}

/** The owner's setting, or the default: read-only tools for everyone, the rest for owners. */
function settingFor(tool: McpToolItem, access: AccessState, members: ToolMember[]): ToolAccessSetting {
  const saved = access[tool.name];
  if (saved) return saved;
  if (tool.kind === "read") return { everyone: true, userIds: [] };
  return { everyone: false, userIds: members.filter((m) => m.role === "OWNER").map((m) => m.userId) };
}

function allowedFor(tool: McpToolItem, setting: ToolAccessSetting, members: ToolMember[]): Set<string> {
  return new Set(members.filter((m) => roleAllows(m, tool) && (setting.everyone || setting.userIds.includes(m.userId))).map((m) => m.userId));
}

/** Everyone green, nobody red, some people neutral. */
function accessTint(allowed: number, total: number): string {
  if (allowed === 0) return "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15";
  if (allowed === total) return "border-transparent bg-green-soft text-green-ink hover:bg-green-soft/80";
  return "border-border bg-card text-ink hover:border-ink/40";
}

function countLabel(allowed: number, total: number): string {
  return `${allowed} of ${total} ${total === 1 ? "member" : "members"}`;
}

/**
 * Every MCP tool, grouped like the app, each group opening onto its tools
 * three to a row. The owner decides who may use each one; everyone else sees
 * how many people can.
 */
export function McpTools({
  groups,
  members,
  initialAccess,
  canManage,
  currentUserId,
}: {
  groups: McpToolGroupItem[];
  members: ToolMember[];
  initialAccess: AccessState;
  canManage: boolean;
  currentUserId: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const [access, setAccess] = React.useState<AccessState>(initialAccess);
  const [saving, setSaving] = React.useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const total = groups.reduce((sum, g) => sum + g.tools.length, 0);
  const shown = groups
    .map((group) => ({
      ...group,
      tools: q
        ? group.tools.filter((t) => t.name.includes(q) || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || group.label.toLowerCase().includes(q))
        : group.tools,
    }))
    .filter((group) => group.tools.length > 0);
  const matches = shown.reduce((sum, g) => sum + g.tools.length, 0);

  function toggleGroup(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(tool: McpToolItem, setting: ToolAccessSetting) {
    const previous = access;
    setAccess((current) => {
      const next = { ...current };
      // Opening a read-only tool to everyone is its default, so nothing is stored for it.
      if (setting.everyone && tool.kind === "read") delete next[tool.name];
      else next[tool.name] = setting;
      return next;
    });
    setSaving(tool.name);
    try {
      await apiFetch(`/api/mcp/tools/${encodeURIComponent(tool.name)}`, { method: "PUT", json: setting });
    } catch (err) {
      setAccess(previous);
      toast.error(errorMessage(err, `Couldn't change who can use ${tool.title.toLowerCase()}`));
    } finally {
      setSaving((current) => (current === tool.name ? null : current));
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter tools by name or what they do" className="pl-10" aria-label="Filter tools" />
      </div>
      {q ? (
        <p className="px-1 text-[12px] tabular-nums text-muted-foreground">
          {matches} of {total} tools
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-fog px-4 py-8 text-center text-[13px] text-muted-foreground">No tools match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((group, i) => {
            const expanded = q.length > 0 || open.has(group.id);
            return (
              <section key={group.id} className="rise overflow-hidden rounded-2xl border bg-card" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-fog/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                >
                  <span aria-hidden className={cn("h-3 w-3 shrink-0 rounded-[4px]", TONES[group.tone].dot)} />
                  <span className="text-[14px] font-semibold">{group.label}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">({group.tools.length})</span>
                  <ChevronDown aria-hidden className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
                </button>
                {expanded ? (
                  <ul className="grid gap-2 border-t bg-fog/50 p-2 sm:p-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.tools.map((tool) => {
                      const setting = settingFor(tool, access, members);
                      const allowed = allowedFor(tool, setting, members);
                      return (
                        <ToolCard
                          key={tool.name}
                          tool={tool}
                          members={members}
                          setting={setting}
                          allowed={allowed}
                          canManage={canManage}
                          viewerCan={allowed.has(currentUserId)}
                          busy={saving === tool.name}
                          onChange={(next) => save(tool, next)}
                        />
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolCard({
  tool,
  members,
  setting,
  allowed,
  canManage,
  viewerCan,
  busy,
  onChange,
}: {
  tool: McpToolItem;
  members: ToolMember[];
  setting: ToolAccessSetting;
  allowed: Set<string>;
  canManage: boolean;
  viewerCan: boolean;
  busy: boolean;
  onChange: (setting: ToolAccessSetting) => void;
}) {
  const kind = KIND[tool.kind];
  const label = countLabel(allowed.size, members.length);
  const tint = accessTint(allowed.size, members.length);

  return (
    <li className="flex min-w-0 flex-col rounded-xl border bg-card px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-5">
            <span className="truncate">{tool.title}</span>
            {!canManage && !viewerCan ? (
              <>
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">(you can&apos;t use this tool)</span>
              </>
            ) : null}
          </p>
          <p className="truncate font-mono text-[11.5px] text-muted-foreground">{tool.name}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", kind.className)}>{kind.label}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[12.5px] leading-[1.45] text-muted-foreground">{firstSentence(tool.description)}</p>
      <div className="mt-auto flex justify-end pt-3">
        {canManage ? (
          <AccessPicker tool={tool} members={members} setting={setting} allowed={allowed} label={label} tint={tint} busy={busy} onChange={onChange} />
        ) : (
          <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", tint)}>
            <Users className="h-3.5 w-3.5" aria-hidden />
            {label}
          </span>
        )}
      </div>
    </li>
  );
}

function AccessPicker({
  tool,
  members,
  setting,
  allowed,
  label,
  tint,
  busy,
  onChange,
}: {
  tool: McpToolItem;
  members: ToolMember[];
  setting: ToolAccessSetting;
  allowed: Set<string>;
  label: string;
  tint: string;
  busy: boolean;
  onChange: (setting: ToolAccessSetting) => void;
}) {
  function toggleMember(userId: string, checked: boolean) {
    const next = new Set(allowed);
    if (checked) next.add(userId);
    else next.delete(userId);
    onChange({ everyone: false, userIds: Array.from(next) });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Who can use ${tool.title}: ${label}`}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            tint,
          )}
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-[14px] font-semibold leading-5">{tool.title}</p>
          <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">{firstSentence(tool.description)}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 text-[13px] font-medium">
          <Checkbox
            checked={setting.everyone}
            disabled={busy}
            // Unticking keeps the same people but stops new members getting it; they can then be unticked one by one.
            onCheckedChange={(value) => onChange(value === true ? { everyone: true, userIds: [] } : { everyone: false, userIds: Array.from(allowed) })}
          />
          Everyone, including people who join later
        </label>
        <ul className="max-h-72 overflow-y-auto py-1">
          {members.map((member) => {
            const roleEnough = roleAllows(member, tool);
            return (
              <li key={member.userId}>
                <label className={cn("flex items-center gap-3 px-4 py-2", roleEnough ? "cursor-pointer hover:bg-fog/60" : "cursor-not-allowed opacity-55")}>
                  <Checkbox
                    checked={roleEnough && allowed.has(member.userId)}
                    disabled={!roleEnough || busy}
                    onCheckedChange={(value) => toggleMember(member.userId, value === true)}
                    aria-label={memberName(member)}
                  />
                  <Avatar className="h-7 w-7">
                    {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
                    <AvatarFallback className="text-[10px]">{initials(member.name ?? member.email, "?")}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{memberName(member)}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {roleEnough ? roleLabel(member.role) : `Needs the ${roleLabel(tool.minRole ?? "MEMBER").toLowerCase()} role`}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
