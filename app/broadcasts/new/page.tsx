import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuthFast } from "@/lib/auth";
import { BroadcastEditor } from "@/components/broadcast-editor";
import type {
  GroupOption,
  ContactOption,
  TemplateOption,
} from "@/app/broadcasts/actions";

export const metadata: Metadata = {
  title: "New Broadcast",
};

export default async function NewBroadcastPage() {
  const { supabase } = await requireAuthFast();

  const [groupsResult, contactsResult, templatesResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, name, phone")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("templates")
      .select("id, name, category, body_text, variables, approved_at, meta_template_id")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const groups = (groupsResult.data ?? []) as GroupOption[];
  const contacts = (contactsResult.data ?? []) as ContactOption[];
  const templates = (templatesResult.data ?? []) as TemplateOption[];

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <div>
          <Link
            href="/broadcasts"
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Broadcasts
          </Link>
          <h1 className="text-2xl font-semibold">New Broadcast</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose a broadcast message and select recipient targets.
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-4xl">
        <BroadcastEditor
          mode="create"
          groups={groups}
          contacts={contacts}
          templates={templates}
        />
      </div>
    </div>
  );
}
