import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This page doesn&apos;t exist, or the contact, broadcast or template was deleted.
        </p>
      </div>
      <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </div>
  );
}
