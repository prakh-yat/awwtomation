import Link from "next/link";
import { UserRoundX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function ContactNotFound() {
  return (
    <>
      <PageHeader backHref="/contacts" backLabel="Contacts" title="Contact not found" description="This contact doesn't exist in the current workspace, or it was deleted." />
      <EmptyState
        icon={UserRoundX}
        title="Nothing here"
        description="If you switched workspaces, the link may belong to another one."
        action={
          <Button asChild>
            <Link href="/contacts">Back to contacts</Link>
          </Button>
        }
      />
    </>
  );
}
