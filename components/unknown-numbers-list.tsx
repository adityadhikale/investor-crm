"use client";

import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { AddContactDialog } from "@/components/add-contact-dialog";
import { UNREAD_CHANGED_EVENT } from "@/lib/unread-events";
import type { UnknownConversation } from "@/lib/unknown-numbers";

function formatReceived(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${date.toLocaleTimeString(
    "en-IN",
    { hour: "numeric", minute: "2-digit", hour12: true },
  )}`;
}

/**
 * Numbers that messaged on WhatsApp but aren't saved as contacts. Saving one
 * links all its earlier messages to the new contact.
 */
export function UnknownNumbersList({ conversations }: { conversations: UnknownConversation[] }) {
  const router = useRouter();

  if (conversations.length === 0) return null;

  function handleSaved() {
    window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
    router.refresh();
  }

  return (
    <section className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <div className="border-b border-amber-500/20 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">
          Unknown numbers{" "}
          <span className="font-normal text-muted-foreground">({conversations.length})</span>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          These numbers messaged you on WhatsApp but aren&apos;t saved as contacts. Save one to
          see the full chat and reply.
        </p>
      </div>
      <ul className="divide-y divide-amber-500/15">
        {conversations.map((conversation) => {
          const preview =
            conversation.lastMessageText?.trim() ||
            (conversation.hasMedia ? "[Media message]" : "No text");
          return (
            <li
              key={conversation.phone}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {conversation.profileName ?? conversation.phone}
                  </span>
                  {conversation.profileName && (
                    <span className="text-xs text-muted-foreground">{conversation.phone}</span>
                  )}
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-white">
                    {conversation.messageCount}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{preview}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatReceived(conversation.lastMessageAt)}
                </p>
              </div>
              <AddContactDialog
                initialPhone={conversation.phone}
                initialName={conversation.profileName ?? ""}
                triggerLabel={
                  <>
                    <UserPlus className="size-4" />
                    Save contact
                  </>
                }
                triggerClassName="h-9 shrink-0 gap-1.5 px-3 text-xs sm:text-sm"
                onCreated={handleSaved}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
