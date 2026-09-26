import Link from "next/link";
import { UserRoundX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function ContactNotFound() {
  return (
    <>
      <PageHeader title="Contacts" />
      <EmptyState
        tone="green"
        icon={UserRoundX}
        title="Contact not found"
        description="It may belong to another workspace."
        action={
          <Button asChild>
            <Link href="/contacts">Back to contacts</Link>
          </Button>
        }
      />
    </>
  );
}
