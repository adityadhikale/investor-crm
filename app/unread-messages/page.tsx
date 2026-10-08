import type { Metadata } from "next";
import { requireAuthFast } from "@/lib/auth";
import { PaginationControls } from "@/components/pagination-controls";
import {
  UnreadMessagesList,
  type UnreadConversation,
} from "@/components/unread-messages-list";
import { getPageRange, getTotalPages, parsePage } from "@/lib/pagination";
import { getUnknownConversations } from "@/lib/unknown-numbers";
import { UnknownNumbersList } from "@/components/unknown-numbers-list";

export const metadata: Metadata = {
  title: "Unread Messages",
};

type UnreadRpcRow = {
  contact_id: string;
  unread_count: number;
  last_message_at: string;
  last_message_text: string | null;
  last_media_url: string | null;
};

export default async function UnreadMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const requestedPage = parsePage((await searchParams).page);
  const { supabase } = await requireAuthFast();

  const { count, error: countError } = await supabase.rpc(
    "unread_conversations",
    {},
    { count: "exact", head: true }
  );

  if (countError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Unread Messages</h1>
        <p className="mt-2 text-destructive">
          Unable to load unread messages. If this is the first time using this page, run
          the migration <code>20260930000000_add_unread_messages.sql</code> in the
          Supabase SQL Editor.
        </p>
      </div>
    );
  }

  const totalCount = count ?? 0;
  // Clamp so a stale or hand-typed ?page=999 shows the last page instead of erroring.
  const page = Math.min(requestedPage, getTotalPages(totalCount));
  const { from, to } = getPageRange(page);

  const { data: rows, error } = await supabase
    .rpc("unread_conversations")
    .range(from, to);

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Unread Messages</h1>
        <p className="mt-2 text-destructive">Unable to load unread messages.</p>
      </div>
    );
  }

  const unreadRows = (rows ?? []) as UnreadRpcRow[];
  const contactIds = unreadRows.map((row) => row.contact_id);

  const { data: contactRows, error: contactsError } = contactIds.length
    ? await supabase.from("contacts").select("id, name, phone, tags").in("id", contactIds)
    : { data: [], error: null };

  if (contactsError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Unread Messages</h1>
        <p className="mt-2 text-destructive">Unable to load contact details.</p>
      </div>
    );
  }

  const contactsById = new Map(
    (contactRows ?? []).map((contact) => [contact.id as string, contact])
  );

  const conversations: UnreadConversation[] = unreadRows.flatMap((row) => {
    const contact = contactsById.get(row.contact_id);
    if (!contact) return [];
    return [
      {
        contactId: row.contact_id,
        name: contact.name as string,
        phone: contact.phone as string,
        tags: (contact.tags as string[] | null) ?? [],
        unreadCount: Number(row.unread_count),
        lastMessageAt: row.last_message_at,
        lastMessageText: row.last_message_text,
        hasMedia: Boolean(row.last_media_url),
      },
    ];
  });

  const unknownConversations = page === 1 ? await getUnknownConversations(supabase) : [];

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Unread Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contacts who have messaged you on WhatsApp and are still waiting for a reply.
        </p>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <UnknownNumbersList conversations={unknownConversations} />
        <UnreadMessagesList
          key={page}
          conversations={conversations}
          totalCount={totalCount}
        />
        <PaginationControls
          page={page}
          totalCount={totalCount}
          itemLabel="unread conversations"
        />
      </div>
    </div>
  );
}
