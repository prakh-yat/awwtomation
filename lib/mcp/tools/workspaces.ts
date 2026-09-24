/**
 * Workspaces, the organization and the team: the Settings pages
 * (General, Workspaces, Team) as tools.
 */
import { z } from "zod";

import { effectivePlan } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { addWorkspaceToGrant } from "@/lib/services/mcp-access";
import {
  emailSchema,
  invitationUrl,
  inviteMember,
  listInvitations,
  listMembers,
  organizationNameSchema,
  removeMember,
  renameOrganization,
  revokeInvitation,
  updateMemberRole,
  workspaceRoleSchema,
} from "@/lib/services/organizations";
import { createWorkspace, deleteWorkspace, updateWorkspace, updateWorkspaceSchema, workspaceNameSchema } from "@/lib/services/workspaces";
import { ApiError } from "@/lib/workspace/api";
import { roleAtLeast } from "@/lib/workspace/permissions";

import { accountTool, compact, workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTROY = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

export const workspaceTools = [
  accountTool({
    name: "list_workspaces",
    title: "List workspaces",
    description:
      "The workspaces this app can use, with their organization, plan, timezone, your role and connected accounts. Start here: pass a workspace's id as workspaceId to the other tools when there is more than one.",
    annotations: READ,
    input: {},
    run: async (_args, principal) => {
      const ids = principal.reachable.map((r) => r.workspace.id);
      const channels = ids.length
        ? await prisma.channel.findMany({
            where: { workspaceId: { in: ids } },
            select: { id: true, workspaceId: true, platform: true, username: true, name: true, status: true },
            orderBy: { createdAt: "asc" },
          })
        : [];
      return {
        signedInAs: { name: principal.user.name, email: principal.user.email },
        workspaces: principal.reachable.map((r) => ({
          workspaceId: r.workspace.id,
          name: r.workspace.name,
          timezone: r.workspace.timezone,
          role: r.role,
          organization: { id: r.organization.id, name: r.organization.name, plan: effectivePlan(r.organization) },
          accounts: channels
            .filter((c) => c.workspaceId === r.workspace.id)
            .map((c) => ({ channelId: c.id, platform: c.platform, username: c.username, name: c.name, status: c.status })),
        })),
        note:
          principal.reachable.length === 0
            ? "This app can't reach any workspace. Disconnect it in Awwtomation under Settings, MCP, then connect it again and pick a workspace."
            : undefined,
      };
    },
  }),

  workspaceTool({
    name: "update_workspace",
    title: "Update workspace settings",
    description: "Rename the workspace or change its timezone (used for analytics days and delivery log dates). Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: {
      name: z.string().optional().describe("New workspace name."),
      timezone: z.string().optional().describe("IANA timezone, such as Asia/Kathmandu or America/New_York."),
    },
    run: async (args, ctx) => {
      const data = updateWorkspaceSchema.parse(compact({ name: args.name, timezone: args.timezone }));
      if (Object.keys(data).length === 0) throw new ApiError(422, "Nothing to update: pass name or timezone.", "VALIDATION");
      const workspace = await updateWorkspace(ctx.workspace.id, data, ctx.user.id);
      return { workspace: { id: workspace.id, name: workspace.name, timezone: workspace.timezone } };
    },
  }),

  workspaceTool({
    name: "create_workspace",
    title: "Create a workspace",
    description:
      "Add a workspace (a brand or client) to the same organization as workspaceId. It shares the organization's plan and team. This app can use the new workspace right away. Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: { name: z.string().describe("Name of the new workspace.") },
    run: async (args, ctx, principal) => {
      const workspace = await createWorkspace(ctx.organization.id, ctx.user.id, workspaceNameSchema.parse(args.name));
      const grant = principal.reachable.find((r) => r.workspace.id === ctx.workspace.id);
      if (grant) await addWorkspaceToGrant(grant.grantId, workspace.id);
      return { workspace: { workspaceId: workspace.id, name: workspace.name, timezone: workspace.timezone, organizationId: workspace.organizationId } };
    },
  }),

  workspaceTool({
    name: "delete_workspace",
    title: "Delete a workspace",
    description:
      "Permanently delete the workspace in workspaceId with its accounts, automations, contacts, conversations and broadcasts. Owners only, and never an organization's last workspace. Confirm with the person first.",
    minRole: "OWNER",
    annotations: DESTROY,
    input: { confirmName: z.string().describe("The workspace's exact name, as a safeguard.") },
    run: async (args, ctx) => {
      if (args.confirmName.trim() !== ctx.workspace.name) {
        throw new ApiError(422, `confirmName must be the workspace's exact name: ${ctx.workspace.name}`, "CONFIRMATION_MISMATCH");
      }
      await deleteWorkspace(ctx.workspace.id, ctx.user.id);
      return { ok: true, deleted: { workspaceId: ctx.workspace.id, name: ctx.workspace.name } };
    },
  }),

  workspaceTool({
    name: "rename_organization",
    title: "Rename the organization",
    description: "Rename the organization that workspaceId belongs to (the billable account holding the plan and team). Admins and owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: { name: z.string().describe("New organization name.") },
    run: async (args, ctx) => {
      const organization = await renameOrganization(ctx.organization.id, ctx.user.id, organizationNameSchema.parse(args.name));
      return { organization: { id: organization.id, name: organization.name } };
    },
  }),

  workspaceTool({
    name: "list_team",
    title: "List the team",
    description:
      "Members of the organization (roles apply to every workspace in it) and pending invitations. Member userIds are what contacts' ownerId and conversations' assignedToId take.",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => {
      const isAdmin = roleAtLeast(ctx.role, "ADMIN");
      const [members, invitations] = await Promise.all([
        listMembers(ctx.organization.id),
        listInvitations(ctx.organization.id, { status: "PENDING", includeLinks: isAdmin }),
      ]);
      return {
        yourRole: ctx.role,
        members: members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, joinedAt: m.createdAt })),
        invitations: invitations.map((i) => ({ invitationId: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, expired: i.expired, inviteUrl: i.inviteUrl })),
      };
    },
  }),

  workspaceTool({
    name: "invite_member",
    title: "Invite a teammate",
    description:
      "Create an invite link for an email address. Nothing is emailed: give the returned inviteUrl to the person. Uses a team seat on the plan. Admins and owners; only owners can invite owners.",
    minRole: "ADMIN",
    annotations: WRITE,
    input: {
      email: z.string().describe("The person's email address. They must sign in with it to accept."),
      role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional().describe("Defaults to MEMBER."),
    },
    run: async (args, ctx) => {
      const email = emailSchema.parse(args.email);
      const role = workspaceRoleSchema.parse(args.role ?? "MEMBER");
      const invitation = await inviteMember(ctx.organization.id, ctx.user.id, email, role);
      return {
        invitation: { invitationId: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt },
        inviteUrl: invitationUrl(invitation.token),
      };
    },
  }),

  workspaceTool({
    name: "revoke_invitation",
    title: "Revoke an invitation",
    description: "Cancel a pending invitation so its link stops working. Admins and owners.",
    minRole: "ADMIN",
    annotations: DESTROY,
    input: { invitationId: z.string().describe("From list_team.") },
    run: async (args, ctx) => {
      const invitation = await prisma.invitation.findUnique({ where: { id: args.invitationId }, select: { organizationId: true } });
      if (!invitation || invitation.organizationId !== ctx.organization.id) throw new ApiError(404, "Invitation not found", "NOT_FOUND");
      await revokeInvitation(ctx.organization.id, args.invitationId, ctx.user.id);
      return { ok: true };
    },
  }),

  workspaceTool({
    name: "update_member_role",
    title: "Change a teammate's role",
    description: "Set a member's role: OWNER, ADMIN or MEMBER. Owners only; the last owner can't be demoted.",
    minRole: "OWNER",
    annotations: WRITE,
    input: {
      userId: z.string().describe("From list_team."),
      role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
    },
    run: async (args, ctx) => {
      const member = await updateMemberRole(ctx.organization.id, ctx.user.id, args.userId, args.role);
      return { member: { userId: member.userId, name: member.user.name, email: member.user.email, role: member.role } };
    },
  }),

  workspaceTool({
    name: "remove_member",
    title: "Remove a teammate",
    description:
      "Remove someone from the organization, or leave it yourself by passing your own userId. Admins can remove members, owners can remove anyone; the last owner stays. Confirm with the person first.",
    annotations: DESTROY,
    input: { userId: z.string().describe("From list_team.") },
    run: async (args, ctx) => {
      await removeMember(ctx.organization.id, ctx.user.id, args.userId);
      return { ok: true, left: args.userId === ctx.user.id };
    },
  }),
];
