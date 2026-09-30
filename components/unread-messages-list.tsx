"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, MessageCircle } from "lucide-react";

import {
  markAllConversationsRead,
  markConversationRead,
} from "@/app/unread-messages/actions";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { UNREAD_CHANGED_EVENT } from "@/lib/unread-events";

export type UnreadConversation = {
  contactId: string;
  name: string;
  phone: string;
  tags: string[];
  unreadCount: number;
  lastMessageAt: string;
  lastMessageText: string | null;
  hasMedia: boolean;
};

function formatReceived(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";

  return `${date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })} · ${date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
}

export function UnreadMessagesList({
  conversations,
  totalCount,
}: {
  conversations: UnreadConversation[];
  totalCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  function notifyChanged() {
    window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
    router.refresh();
  }

  async function handleMarkRead(contactId: string) {
    setBusyId(contactId);
    const result = await markConversationRead(contactId);
    setBusyId(null);

    if ("error" in result) {
      toast(result.error ?? "Could not mark as read", "error");
      return;
    }
    notifyChanged();
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    const result = await markAllConversationsRead();
    setMarkingAll(false);

    if ("error" in result) {
      toast(result.error ?? "Could not mark as read", "error");
      return;
    }
    toast(`${result.marked} conversation${result.marked === 1 ? "" : "s"} marked as read`);
    notifyChanged();
  }

  return (
    <>
      {totalCount > 0 && (
        <div className="mb-3 flex shrink-0 items-center justify-between rounded-lg border bg-background px-4 py-2.5">
          <p className="text-sm font-medium">
            {totalCount.toLocaleString("en-IN")} unread conversation
            {totalCount === 1 ? "" : "s"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            <CheckCheck className="size-4" />
            {markingAll ? "Marking..." : "Mark all as read"}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <div className="min-w-[720px]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b bg-background text-left text-muted-foreground">
                <th className="w-[24%] px-5 py-2.5 font-medium sm:py-3">Contact</th>
                <th className="w-[38%] px-5 py-2.5 font-medium sm:py-3">Last message</th>
                <th className="w-[10%] px-5 py-2.5 font-medium sm:py-3">Unread</th>
                <th className="w-[14%] px-5 py-2.5 font-medium sm:py-3">Received</th>
                <th className="w-[14%] px-5 py-2.5 sm:py-3" />
              </tr>
            </thead>

            <tbody>
              {conversations.length ? (
                conversations.map((conversation) => (
                  <tr
                    key={conversation.contactId}
                    className="border-b last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-5 py-2.5 sm:py-4">
                      <Link
                        href={`/contacts/${conversation.contactId}`}
                        className="font-medium hover:underline"
                      >
                        {conversation.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{conversation.phone}</p>
                    </td>
                    <td className="px-5 py-2.5 sm:py-4">
                      <p className="line-clamp-2 break-words text-muted-foreground">
                        {conversation.lastMessageText?.trim() ||
                          (conversation.hasMedia ? "[Media message]" : "No text")}
                      </p>
                    </td>
                    <td className="px-5 py-2.5 sm:py-4">
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        {conversation.unreadCount}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground sm:py-4">
                      {formatReceived(conversation.lastMessageAt)}
                    </td>
                    <td className="px-5 py-2.5 sm:py-4">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkRead(conversation.contactId)}
                          disabled={busyId === conversation.contactId}
                        >
                          Mark read
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                    <MessageCircle className="mx-auto mb-2 size-6 opacity-50" />
                    You&apos;re all caught up. No unread messages.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
