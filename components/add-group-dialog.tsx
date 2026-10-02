"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addGroup,
  searchContactsForNewGroup,
  type GroupContactOption,
} from "@/app/groups/actions";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AddGroupDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<GroupContactOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const visibleIds = contacts.map((contact) => contact.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      const result = await searchContactsForNewGroup(search);
      if (cancelled) return;

      setLoading(false);
      if (result.error) {
        setLoadError(result.error);
        setContacts([]);
        setHasMore(false);
        return;
      }

      setContacts(result.contacts ?? []);
      setHasMore(Boolean(result.hasMore));
    }, search ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, search]);

  function reset() {
    setName("");
    setSearch("");
    setContacts([]);
    setHasMore(false);
    setSelectedIds(new Set());
    setLoadError(null);
    setError(null);
    setLoading(false);
  }

  function toggleContact(contactId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function toggleVisibleContacts() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Group name is required.");
      return;
    }
    if (!selectedIds.size) {
      setError("Select at least one contact. A group can't be empty.");
      return;
    }

    setError(null);
    setSubmitting(true);
    const result = await addGroup(trimmedName, [...selectedIds]);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      toast("Failed to create group", "error");
      return;
    }

    setOpen(false);
    reset();
    router.refresh();
    toast("Group created successfully");
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <SheetTrigger render={<Button className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm" />}>+ Add Group</SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0">
        <SheetHeader className="border-b px-4 py-3.5 sm:px-6 sm:py-5">
          <SheetTitle className="text-lg sm:text-xl">Add Group</SheetTitle>
          <SheetDescription className="text-xs sm:text-sm">Name the group and choose at least one contact to put in it.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:gap-4 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <Label htmlFor="group-name">Group name</Label>
              <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Family Offices" className="h-9 text-sm sm:h-10" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Label htmlFor="group-member-search">Members</Label>
              <Input
                id="group-member-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts by name or phone..."
                className="h-9 text-sm sm:h-10"
              />
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
                {loading && !contacts.length ? (
                  <p className="px-4 py-8 text-center text-xs sm:text-sm text-muted-foreground">Loading contacts...</p>
                ) : loadError ? (
                  <p className="px-4 py-8 text-center text-xs sm:text-sm text-destructive">{loadError}</p>
                ) : contacts.length ? (
                  <div className="divide-y">
                    <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/20 px-3 py-2 text-xs sm:py-2.5 sm:text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleContacts}
                        aria-label="Select visible contacts"
                        className="size-4 cursor-pointer accent-primary"
                      />
                      <span>Select visible contacts</span>
                    </label>
                    {contacts.map((contact) => (
                      <label key={contact.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 sm:py-3 hover:bg-muted/20">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleContact(contact.id)}
                          className="size-4 cursor-pointer accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{contact.name}</span>
                          <span className="mt-0.5 block text-xs sm:text-sm text-muted-foreground">{contact.phone}</span>
                        </span>
                      </label>
                    ))}
                    {hasMore && (
                      <p className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                        Showing the first 100. Search to find others.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="px-4 py-8 text-center text-xs sm:text-sm text-muted-foreground">
                    {search ? "No contacts found." : "No contacts available."}
                  </p>
                )}
              </div>
              <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"} selected
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <SheetFooter className="border-t bg-muted/20 px-4 py-3 sm:px-6 sm:py-4 gap-2 sm:flex-row sm:justify-end">
            <SheetClose render={<Button variant="outline" type="button" className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm" />}>Cancel</SheetClose>
            <Button type="submit" disabled={submitting || !selectedIds.size} className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">{submitting ? "Saving..." : "Save Group"}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
