"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteContacts } from "@/app/contacts/actions";
import {
  ContactDetailsDialog,
  type ContactRow,
} from "@/components/contact-details-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { UnreadBadge } from "@/components/unread-badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Time in a chat list: clock time today, "Yesterday", or the date. */
function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) {
    return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  }
  if (date.getTime() >= startOfToday - 24 * 60 * 60 * 1000) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

export function ContactsTable({
  contacts,
  search,
  unreadCounts = {},
}: {
  contacts: ContactRow[];
  search: string;
  /** Unread WhatsApp message counts keyed by contact id. */
  unreadCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const contactIds = contacts.map((contact) => contact.id);
  const selectedVisibleCount = contactIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = contactIds.length > 0 && selectedVisibleCount === contactIds.length;
  const someSelected = selectedVisibleCount > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggleContact(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) {
        contactIds.forEach((id) => next.delete(id));
      } else {
        contactIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteContacts([...selectedIds]);
    setDeleting(false);

    if (result.error) {
      toast("Failed to delete contacts", "error");
      setConfirmingDelete(false);
      return;
    }

    setSelectedIds(new Set());
    setConfirmingDelete(false);
    toast(
      `${result.deleted} contact${result.deleted === 1 ? "" : "s"} deleted successfully`
    );
    router.refresh();
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="mb-3 flex shrink-0 items-center justify-between rounded-lg border bg-background px-4 py-2.5">
          <p className="text-sm font-medium">
            {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setConfirmingDelete(true);
            }}
            disabled={deleting}
          >
            Delete
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <div className="min-w-[760px]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b bg-background text-left text-muted-foreground">
                <th className="w-12 px-5 py-2.5 sm:py-3 font-medium">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all contacts"
                    className="size-4 cursor-pointer accent-primary"
                  />
                </th>
                <th className="w-[20%] px-5 py-2.5 sm:py-3 font-medium">Name</th>
                <th className="w-[18%] px-5 py-2.5 sm:py-3 font-medium">Phone</th>
                <th className="w-[22%] px-5 py-2.5 sm:py-3 font-medium">Email</th>
                <th className="w-[20%] px-5 py-2.5 sm:py-3 font-medium">Tags</th>
                <th className="w-[20%] px-5 py-2.5 sm:py-3 font-medium">Groups</th>
              </tr>
            </thead>

            <tbody>
              {contacts.length ? (
                contacts.map((contact) => (
                  <ContactDetailsDialog key={contact.id} contact={contact}>
                    <tr className="cursor-pointer border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-5 py-2.5 sm:py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleContact(contact.id)}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Select ${contact.name}`}
                          className="size-4 cursor-pointer accent-primary"
                        />
                      </td>
                      <td className="px-5 py-2.5 sm:py-4 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {contact.name}
                          <UnreadBadge count={unreadCounts[contact.id]} />
                        </span>
                        {contact.last_message_at && (
                          <span className="mt-0.5 flex max-w-[16rem] items-center gap-2 text-xs font-normal text-muted-foreground">
                            <span className="truncate">
                              {contact.last_message_direction === "out" ? "You: " : ""}
                              {contact.last_message_text || "Attachment"}
                            </span>
                            <span className="shrink-0 opacity-70">{formatChatTime(contact.last_message_at)}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 sm:py-4">{contact.phone}</td>
                      <td className="px-5 py-2.5 sm:py-4 text-muted-foreground">
                        {contact.email ? (
                          <span className="text-foreground">{contact.email}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-2.5 sm:py-4">
                        {contact.tags?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {contact.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 sm:py-4">
                        {contact.contact_groups?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {contact.contact_groups.map((contactGroup) => {
                              const group = Array.isArray(contactGroup.groups)
                                ? contactGroup.groups[0]
                                : contactGroup.groups;
                              return (
                                <span
                                  key={group.id}
                                  className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                                >
                                  {group.name}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  </ContactDetailsDialog>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    {search ? "No contacts found." : "No contacts yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              The selected contacts will be removed from the CRM. They&apos;re hidden
              from the CRM, but their data (notes, follow-ups and messages) stays in the database.
              There is no restore button in the app yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Contacts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
