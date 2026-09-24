"use client";

import * as React from "react";
import type { WorkspaceRole } from "@prisma/client";
import { Lock, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { TONES, type Tone } from "@/components/ui/tone";
import { cn, initials } from "@/lib/utils";
import { roleLabel, roleRank } from "@/lib/workspace/permissions";

import { apiFetch, errorMessage } from "./client-api";

export type McpToolItem = { name: string; title: string; description: string; minRole: WorkspaceRole | null };
export type McpToolGroupItem = { id: string; label: string; tone: Tone; tools: McpToolItem[] };
export type ToolMember = { userId: string; name: string | null; email: string; avatarUrl: string | null; role: WorkspaceRole };

/** tool name → allowed user ids, for the tools the owner has narrowed. */
type AccessState = Record<string, string[]>;

function memberName(member: ToolMember): string {
  return member.name?.trim() || member.email;
}

/** Members whose role is high enough for the tool at all; the owner picks among these. */
function eligibleFor(tool: McpToolItem, members: ToolMember[]): ToolMember[] {
  return members.filter((m) => roleRank(m.role) >= roleRank(tool.minRole ?? "MEMBER"));
}

function allowedFor(tool: McpToolItem, members: ToolMember[], access: AccessState): Set<string> {
  const eligible = eligibleFor(tool, members).map((m) => m.userId);
  const list = access[tool.name];
  return new Set(list ? eligible.filter((id) => list.includes(id)) : eligible);
}

/** Tool descriptions are written for the AI app; people get the first sentence, which says what it does. */
function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text);
  return match ? match[1] : text;
}

function countLabel(allowed: number, total: number): string {
  return `${allowed} of ${total} ${total === 1 ? "member" : "members"}`;
}

/**
 * Every MCP tool, grouped like the app, three to a row. The owner decides who
 * may use each one; everyone else sees how many people can.
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
  const [access, setAccess] = React.useState<AccessState>(initialAccess);
  const [saving, setSaving] = React.useState<string | null>(null);
  const viewer = members.find((m) => m.userId === currentUserId);

  async function save(tool: McpToolItem, userIds: string[] | null) {
    const previous = access;
    setAccess((current) => {
      const next = { ...current };
      if (userIds === null) delete next[tool.name];
      else next[tool.name] = userIds;
      return next;
    });
    setSaving(tool.name);
    try {
      await apiFetch(`/api/mcp/tools/${encodeURIComponent(tool.name)}`, { method: "PUT", json: { userIds } });
    } catch (err) {
      setAccess(previous);
      toast.error(errorMessage(err, `Couldn't change who can use ${tool.title.toLowerCase()}`));
    } finally {
      setSaving((current) => (current === tool.name ? null : current));
    }
  }

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`mcp-tools-${group.id}`}>
          <div className="mb-2.5 flex items-center gap-2">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", TONES[group.tone].dot)} />
            <h3 id={`mcp-tools-${group.id}`} className="brand-label text-muted-foreground">
              {group.label}
            </h3>
            <span className="text-[12px] tabular-nums text-muted-foreground">{group.tools.length}</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => {
              const allowed = allowedFor(tool, members, access);
              const label = countLabel(allowed.size, members.length);
              const viewerCan = viewer ? allowed.has(viewer.userId) : false;
              return (
                <li key={tool.name} className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card px-4 py-3">
                  <div className="min-w-0 flex-1" title={tool.description}>
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
                  {canManage ? (
                    <AccessPicker
                      tool={tool}
                      members={members}
                      allowed={allowed}
                      restricted={Boolean(access[tool.name])}
                      label={label}
                      busy={saving === tool.name}
                      onChange={(userIds) => save(tool, userIds)}
                    />
                  ) : (
                    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] text-muted-foreground">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AccessPicker({
  tool,
  members,
  allowed,
  restricted,
  label,
  busy,
  onChange,
}: {
  tool: McpToolItem;
  members: ToolMember[];
  allowed: Set<string>;
  restricted: boolean;
  label: string;
  busy: boolean;
  onChange: (userIds: string[] | null) => void;
}) {
  const eligible = eligibleFor(tool, members).map((m) => m.userId);

  function toggleMember(userId: string, checked: boolean) {
    const base = new Set(allowed);
    if (checked) base.add(userId);
    else base.delete(userId);
    onChange(Array.from(base));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0" aria-label={`Who can use ${tool.title}: ${label}`}>
          <Users aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-[14px] font-semibold leading-5">{tool.title}</p>
          <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">{firstSentence(tool.description)}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 text-[13px] font-medium">
          <Checkbox
            checked={!restricted}
            disabled={busy}
            // Unticking keeps the same people but stops new members getting it; they can then be unticked one by one.
            onCheckedChange={(value) => onChange(value === true ? null : eligible.filter((id) => allowed.has(id)))}
          />
          Everyone, including people who join later
        </label>
        <ul className="max-h-72 overflow-y-auto py-1">
          {members.map((member) => {
            const roleEnough = roleRank(member.role) >= roleRank(tool.minRole ?? "MEMBER");
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
