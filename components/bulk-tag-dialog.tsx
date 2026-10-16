"use client";

import { useState } from "react";

import { bulkChangeTags, type BulkTagMode } from "@/app/contacts/bulk-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/toast-provider";
import { TAG_OPTIONS } from "@/lib/tags";

const MODES: Array<{ value: BulkTagMode; label: string; explain: (tag: string, n: number) => string }> = [
  { value: "add", label: "Add this tag", explain: (tag, n) => `${n} contact${n === 1 ? "" : "s"} will get the tag "${tag}" (their other tags stay).` },
  { value: "remove", label: "Remove this tag", explain: (tag, n) => `The tag "${tag}" will be taken off ${n} contact${n === 1 ? "" : "s"} that have it (their other tags stay).` },
  { value: "replace", label: "Replace all tags with this tag", explain: (tag, n) => `All existing tags on ${n} contact${n === 1 ? "" : "s"} will be replaced with only "${tag}".` },
];

/** Changes one tag on all the selected contacts at once. */
export function BulkTagDialog({
  open,
  onOpenChange,
  ids,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<BulkTagMode>("add");
  const [tag, setTag] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = MODES.find((m) => m.value === mode)!;

  async function handleApply() {
    if (!tag) return;
    setError(null);
    setWorking(true);
    const result = await bulkChangeTags(ids, mode, tag);
    setWorking(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast(`${result.updated} contact${result.updated === 1 ? "" : "s"} updated`);
    setTag("");
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (working) return;
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change tag for {ids.length} contact{ids.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>Choose what to do and which tag. Nothing changes until you confirm.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            {MODES.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="bulk-tag-mode"
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>

          <Select value={tag} onValueChange={(value) => setTag(value ?? "")}>
            <SelectTrigger className="w-full" aria-label="Tag">
              <SelectValue placeholder="Select a tag" />
            </SelectTrigger>
            <SelectContent>
              {TAG_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {tag && (
            <p className="rounded-md border bg-muted/30 p-3 text-sm">{current.explain(tag, ids.length)}</p>
          )}
          {error && (
            <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={working} />}>Cancel</DialogClose>
          <Button type="button" onClick={handleApply} disabled={!tag || working}>
            {working ? "Updating…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
