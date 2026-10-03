import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { TemplateEditor } from "@/components/template-editor";

export const metadata: Metadata = {
  title: "New Template",
};

export default async function NewTemplatePage() {
  await requireAuth();

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <div>
          <Link
            href="/templates"
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Templates
          </Link>
          <h1 className="text-2xl font-semibold">New Template</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose a WhatsApp message template with dynamic variables.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Templates created here stay in the CRM and are sent as plain text, so they only
            reach contacts who messaged you in the last 24 hours. To reach anyone else, create
            the template in Meta&apos;s WhatsApp Manager and click &quot;Sync from Meta&quot;.
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-3xl">
        <TemplateEditor mode="create" />
      </div>
    </div>
  );
}
