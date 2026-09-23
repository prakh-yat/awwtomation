import Link from "next/link";
import { Layers, Plug, SearchX, SquareKanban, Users, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Nobody in the workspace yet: connect an account first, or build something that brings people in. */
export function ContactsWorkspaceEmpty({ connected }: { connected: boolean }) {
  return (
    <EmptyState
      tone="green"
      icon={Users}
      title="No contacts yet"
      description={connected ? "People show up here after they comment on or message your account." : "Connect an Instagram or Facebook account to start."}
      action={
        connected ? (
          <Button asChild>
            <Link href="/automations/templates">
              <Workflow />
              Create an automation
            </Link>
          </Button>
        ) : (
          <Button asChild variant="highlight">
            <Link href="/dashboard?accounts=1">
              <Plug />
              Connect account
            </Link>
          </Button>
        )
      }
    />
  );
}

/**
 * The list came back empty. Says which of the view's choices emptied it and
 * offers the one step that undoes it.
 */
export function ContactsListEmpty({
  stageName,
  pipelineName,
  segment,
  onShowEveryStage,
  onShowAll,
  onClear,
}: {
  /** Set when a stage is the only thing narrowing the pipeline view. */
  stageName: string | null;
  /** Set when a pipeline is open and nothing else narrows it. */
  pipelineName: string | null;
  /** An unedited saved segment with no one in it. */
  segment: boolean;
  onShowEveryStage: () => void;
  onShowAll: () => void;
  onClear: () => void;
}) {
  if (stageName) {
    return (
      <EmptyState
        compact
        tone="green"
        icon={SquareKanban}
        title={`No one at ${stageName} yet`}
        action={
          <Button variant="outline" size="sm" onClick={onShowEveryStage}>
            Show every stage
          </Button>
        }
      />
    );
  }
  if (pipelineName) {
    return (
      <EmptyState
        compact
        tone="green"
        icon={SquareKanban}
        title={`No one in ${pipelineName} yet`}
        action={
          <Button variant="outline" size="sm" onClick={onShowAll}>
            Show all contacts
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      compact
      tone="green"
      icon={segment ? Layers : SearchX}
      title={segment ? "No one in this segment yet" : "No contacts match"}
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          {segment ? "Show all contacts" : "Clear filters"}
        </Button>
      }
    />
  );
}

/** The board was opened on a pipeline that has since been deleted. */
export function BoardMissing({ next, onOpen }: { next: { name: string } | null; onOpen: () => void }) {
  return (
    <EmptyState
      compact
      tone="green"
      icon={SquareKanban}
      title="That pipeline no longer exists"
      action={
        <Button variant="outline" size="sm" onClick={onOpen}>
          {next ? `Open ${next.name}` : "Show all contacts"}
        </Button>
      }
    />
  );
}
