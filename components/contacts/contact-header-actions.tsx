"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Inbox, MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";

import { contactsApi, errorMessage } from "./api";

export function ContactHeaderActions({
  contactId,
  displayName,
  profileUrl,
  platformLabel,
  conversationId,
}: {
  contactId: string;
  displayName: string;
  profileUrl: string | null;
  platformLabel: string;
  conversationId: string | null;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  async function remove() {
    try {
      await contactsApi.remove(contactId);
      toast.success(`Deleted ${displayName}`);
      router.push("/contacts");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete this contact"));
      throw err;
    }
  }

  return (
    <>
      {profileUrl ? (
        <Button variant="outline" size="sm" asChild>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            {platformLabel}
          </a>
        </Button>
      ) : null}
      {conversationId ? (
        <Button size="sm" asChild>
          <Link href={`/inbox?c=${encodeURIComponent(conversationId)}`}>
            <Inbox />
            Open conversation
          </Link>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
            <Trash2 />
            Delete contact
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        trigger={null}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${displayName}?`}
        description="Their conversation and notes go too. If they message you again, they come back as a new contact."
        confirmLabel="Delete contact"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
