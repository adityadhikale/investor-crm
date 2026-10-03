import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { TemplateEditor } from "@/components/template-editor";
import type { TemplateData } from "@/app/templates/actions";

export const metadata: Metadata = {
  title: "Template Details",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TemplateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { supabase } = await requireAuth();

  const { data: template, error } = await supabase
    .from("templates")
    .select("id, name, meta_template_id, variables, category, body_text, approved_at, created_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !template) {
    notFound();
  }

  const typedTemplate = template as TemplateData;
  const isApproved = Boolean(typedTemplate.approved_at);

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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{typedTemplate.name}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                isApproved
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isApproved ? "Approved" : typedTemplate.meta_template_id ? "Not approved by Meta" : "Draft"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {typedTemplate.meta_template_id
              ? "This template comes from Meta and can't be changed here. Edit it in WhatsApp Manager, then click \"Sync from Meta\" on the Templates page."
              : "Modify template content, category, and variable sample mappings."}
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-3xl">
        <TemplateEditor mode="edit" existingTemplate={typedTemplate} />
      </div>
    </div>
  );
}
