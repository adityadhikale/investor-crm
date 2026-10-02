"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";

import {
  deleteGroup,
  removeContactsFromGroup,
  removeContactFromGroup,
  updateGroup,
} from "@/app/groups/actions";
import { AddContactsToGroupSheet } from "@/components/add-contacts-to-group-sheet";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import type { GroupMember } from "@/lib/group-members";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MoreHorizontal, Trash2 } from "lucide-react";

export type GroupRow = {
  id: string;
  name: string;
  created_at: string;
  contact_groups: GroupMember[];
};

type GroupActions = {
  onEdit: () => void;
  onDelete: () => void;
};

export function GroupDetailsDialog({
  group,
  children,
}: {
  group: GroupRow;
  children: ReactElement | ((actions: GroupActions) => ReactElement);
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentGroup, setCurrentGroup] = useState(group);
  const [memberToRemove, setMemberToRemove] = useState<GroupMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [confirmingBulkRemoval, setConfirmingBulkRemoval] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [openMemberMenu, setOpenMemberMenu] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const memberListRef = useRef<HTMLDivElement>(null);
  const memberSelectAllRef = useRef<HTMLInputElement>(null);

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredMembers = currentGroup.contact_groups.filter((member) => {
    if (!normalizedMemberSearch) return true;
    const name = member.contact?.name.toLowerCase() ?? "";
    const phone = member.contact?.phone.toLowerCase() ?? "";
    return name.includes(normalizedMemberSearch) || phone.includes(normalizedMemberSearch);
  });
  const visibleMemberIds = filteredMembers.map((member) => member.contact_id);
  const selectedVisibleCount = visibleMemberIds.filter((id) => selectedMemberIds.has(id)).length;
  const allVisibleSelected = visibleMemberIds.length > 0 && selectedVisibleCount === visibleMemberIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    function closeMemberMenu(event: PointerEvent) {
      if (!memberListRef.current?.contains(event.target as Node)) {
        setOpenMemberMenu(null);
      }
    }

    document.addEventListener("pointerdown", closeMemberMenu);
    return () => document.removeEventListener("pointerdown", closeMemberMenu);
  }, []);

  useEffect(() => {
    if (memberSelectAllRef.current) {
      memberSelectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function close() {
    setOpen(false);
    setEditing(false);
    setConfirmingDelete(false);
    setConfirmingBulkRemoval(false);
    setOpenMemberMenu(null);
    setName(currentGroup.name);
    setError(null);
  }

  function beginEdit() {
    setError(null);
    setOpen(true);
    setEditing(true);
  }

  function requestDelete() {
    setError(null);
    setOpen(true);
    setConfirmingDelete(true);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Group name is required.");
      return;
    }

    setSaving(true);
    const formData = new FormData();
    formData.set("name", trimmedName);
    const result = await updateGroup(group.id, formData);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      toast("Failed to update group", "error");
      return;
    }

    setEditing(false);
    router.refresh();
    toast("Group updated successfully");
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteGroup(group.id);
    setDeleting(false);
    if (result.error) {
      setConfirmingDelete(false);
      toast("Failed to delete group", "error");
      return;
    }

    close();
    router.refresh();
    toast("Group deleted successfully");
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return;

    setRemovingMember(true);
    const result = await removeContactFromGroup(
      currentGroup.id,
      memberToRemove.contact_id,
    );
    setRemovingMember(false);

    if (result.error) {
      setConfirmingDelete(false);
      toast(result.error ?? "Failed to remove contact from group", "error");
      return;
    }

    setCurrentGroup((existing) => ({
      ...existing,
      contact_groups: existing.contact_groups.filter(
        (member) => member.contact_id !== memberToRemove.contact_id,
      ),
    }));
    setMemberToRemove(null);
    setConfirmingDelete(false);
    router.refresh();
    toast("Contact removed from group");
  }

  function toggleMember(contactId: string) {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function toggleVisibleMembers() {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleMemberIds.forEach((id) => next.delete(id));
      else visibleMemberIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleBulkRemove() {
    setRemovingMember(true);
    const result = await removeContactsFromGroup(currentGroup.id, [...selectedMemberIds]);
    setRemovingMember(false);

    if (result.error) {
      setConfirmingBulkRemoval(false);
      toast(result.error ?? "Failed to remove contacts from group", "error");
      return;
    }

    setCurrentGroup((existing) => ({
      ...existing,
      contact_groups: existing.contact_groups.filter(
        (member) => !selectedMemberIds.has(member.contact_id),
      ),
    }));
    setSelectedMemberIds(new Set());
    setConfirmingBulkRemoval(false);
    router.refresh();
    toast(`${result.removed} contact${result.removed === 1 ? "" : "s"} removed from group`);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (next) setOpen(true); else close(); }}>
        <SheetTrigger
          nativeButton={false}
          render={typeof children === "function" ? children({ onEdit: beginEdit, onDelete: requestDelete }) : children}
        />
        <SheetContent side="right" className="flex flex-col gap-0">
          <SheetHeader className="border-b px-4 py-3.5 sm:px-6 sm:py-5">
            <SheetTitle className="text-lg sm:text-xl">{editing ? "Edit Group" : "Group Details"}</SheetTitle>
            <SheetDescription className="text-xs sm:text-sm">{editing ? "Update this group's name." : "View the contacts in this group."}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <form onSubmit={handleSave} className="flex flex-1 flex-col">
              <div className="flex-1 space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <Label htmlFor={`edit-group-${group.id}`}>Group name</Label>
                  <Input id={`edit-group-${group.id}`} value={name} onChange={(event) => setName(event.target.value)} className="h-9 text-sm sm:h-10" />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              </div>
              <SheetFooter className="border-t bg-muted/20 px-4 py-3 sm:px-6 sm:py-4 gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => { setEditing(false); setName(group.name); setError(null); }} disabled={saving} className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">Cancel</Button>
                <Button type="submit" disabled={saving} className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">{saving ? "Saving..." : "Save Group"}</Button>
              </SheetFooter>
            </form>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
                <div className="rounded-lg border bg-background px-3.5 py-3 sm:px-4 sm:py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                    <div className="min-w-0 space-y-1 sm:space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Group name</p>
                      <p className="truncate text-base font-medium">{group.name}</p>
                    </div>
                    <Button type="button" variant="outline" onClick={beginEdit} className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm shrink-0">
                      Edit
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border bg-background px-3.5 py-3 sm:px-4 sm:py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contacts</p>
                      <p className="text-base font-medium">{currentGroup.contact_groups.length} contact{currentGroup.contact_groups.length === 1 ? "" : "s"}</p>
                      <p className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">Contacts in this group</p>
                    </div>
                    <div className="shrink-0">
                      <AddContactsToGroupSheet
                        groupId={currentGroup.id}
                        onAdded={(contactGroups) =>
                          setCurrentGroup((existing) => ({
                            ...existing,
                            contact_groups: contactGroups,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5 sm:space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Members</p>
                  <Input
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Search members..."
                    aria-label="Search members"
                    className="h-9 text-sm sm:h-10"
                  />
                  {currentGroup.contact_groups.length > 0 && (
                    <div className="flex items-center gap-2.5 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                      <input ref={memberSelectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleMembers} aria-label="Select visible members" className="size-4 cursor-pointer accent-primary" />
                      <span>Select visible members</span>
                    </div>
                  )}
                  {selectedMemberIds.size > 0 && (
                    <div className="flex items-center justify-between rounded-lg border bg-background px-3.5 py-2 sm:px-4 sm:py-2.5">
                      <p className="text-xs sm:text-sm font-medium">{selectedMemberIds.size} contact{selectedMemberIds.size === 1 ? "" : "s"} selected</p>
                      <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmingBulkRemoval(true)} disabled={removingMember} className="h-8 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm">Remove</Button>
                    </div>
                  )}
                  {currentGroup.contact_groups.length === 0 ? <p className="text-xs sm:text-sm text-muted-foreground">No contacts in this group.</p> : filteredMembers.length === 0 ? <p className="text-xs sm:text-sm text-muted-foreground">No members found.</p> : <div ref={memberListRef} className="divide-y rounded-lg border">{filteredMembers.map((member) => member.contact ? <div key={member.contact_id} className="flex min-w-0 items-center gap-3 px-3 py-2 sm:py-3"><input type="checkbox" checked={selectedMemberIds.has(member.contact_id)} onChange={() => toggleMember(member.contact_id)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} aria-label={`Select ${member.contact.name}`} className="size-4 shrink-0 cursor-pointer accent-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.contact.name}</p><p className="truncate text-xs sm:text-sm text-muted-foreground">{member.contact.phone}</p></div><div className="relative shrink-0"><Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${member.contact.name}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setOpenMemberMenu((current) => current === member.contact_id ? null : member.contact_id); }}><MoreHorizontal className="size-4" /></Button>{openMemberMenu === member.contact_id && <div className="absolute top-full right-0 z-[60] mt-1 w-max min-w-40 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-lg"><button type="button" className="flex w-full cursor-pointer items-center whitespace-nowrap rounded-md px-2.5 py-2 text-left outline-none hover:bg-muted" onPointerDown={(event) => event.stopPropagation()} onClick={() => { setOpenMemberMenu(null); setMemberToRemove(member); setConfirmingDelete(true); }}>Remove from Group</button></div>}</div></div> : null)}</div>}
                </div>
                {error && <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
              <SheetFooter className="border-t bg-muted/20 px-4 py-3 sm:px-6 sm:py-4">
                {/* Mobile: Edit Group full-width on top row, Close & Delete Group side-by-side below */}
                <div className="flex flex-col gap-2 w-full sm:hidden">
                  <Button
                    type="button"
                    onClick={beginEdit}
                    className="w-full h-9 px-3 text-xs font-medium"
                  >
                    Edit Group
                  </Button>
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <SheetClose
                      render={
                        <Button
                          variant="outline"
                          className="w-full h-9 px-3 text-xs font-medium"
                        />
                      }
                    >
                      Close
                    </SheetClose>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setConfirmingDelete(true)}
                      disabled={deleting}
                      className="w-full h-9 px-3 text-xs font-medium"
                    >
                      <Trash2 className="size-3.5" />
                      Delete Group
                    </Button>
                  </div>
                </div>

                {/* Desktop & Tablet: Delete Group on left, Close & Edit Group on right */}
                <div className="hidden sm:flex sm:items-center sm:justify-between sm:w-full">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={deleting}
                    className="h-10 px-4 text-sm font-medium"
                  >
                    <Trash2 className="size-4" />
                    Delete Group
                  </Button>
                  <div className="flex gap-2">
                    <SheetClose
                      render={
                        <Button
                          variant="outline"
                          className="h-10 px-4 text-sm font-medium"
                        />
                      }
                    >
                      Close
                    </SheetClose>
                    <Button
                      type="button"
                      onClick={beginEdit}
                      className="h-10 px-4 text-sm font-medium"
                    >
                      Edit Group
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={confirmingDelete} onOpenChange={(next) => { setConfirmingDelete(next); if (!next) setMemberToRemove(null); }}>
        <DialogContent>
          {memberToRemove ? (
            <>
              <DialogHeader><DialogTitle>Remove contact from group?</DialogTitle><DialogDescription>Remove {memberToRemove.contact?.name} from {currentGroup.name}? The contact itself will not be deleted.</DialogDescription></DialogHeader>
              <DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button type="button" variant="destructive" onClick={handleRemoveMember} disabled={removingMember}>{removingMember ? "Removing..." : "Remove"}</Button></DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>Delete {group.name}?</DialogTitle><DialogDescription>This removes the group and its contact associations. Contacts will not be deleted.</DialogDescription></DialogHeader>
              <DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete Group"}</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={confirmingBulkRemoval} onOpenChange={setConfirmingBulkRemoval}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove contacts from group?</DialogTitle>
            <DialogDescription>Remove {selectedMemberIds.size} selected contact{selectedMemberIds.size === 1 ? "" : "s"} from &quot;{currentGroup.name}&quot;? The contacts themselves will not be deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="button" variant="destructive" onClick={handleBulkRemove} disabled={removingMember}>{removingMember ? "Removing..." : "Remove from Group"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}