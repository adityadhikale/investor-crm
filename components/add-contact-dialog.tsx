"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateSavedPicker } from "@/components/date-saved-picker";
import { addContact } from "@/app/contacts/actions";
import { useToast } from "@/components/toast-provider";

import { TAG_OPTIONS } from "@/lib/tags";
export { TAG_OPTIONS };

function toISODateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function AddContactDialog({
  initialName = "",
  initialPhone = "",
  triggerLabel = "+ Add Contact",
  triggerClassName = "h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm",
  onCreated,
}: {
  /** Pre-fill, e.g. when saving a number that messaged on WhatsApp. */
  initialName?: string;
  initialPhone?: string;
  triggerLabel?: React.ReactNode;
  triggerClassName?: string;
  onCreated?: () => void;
} = {}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState("");

  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [selectedTag, setSelectedTag] = useState<string>("");

  const [dateSaved, setDateSaved] = useState<Date | undefined>(undefined);
  const [dateError, setDateError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  function resetForm() {
    setName(initialName);
    setPhone(initialPhone);
    setEmail("");
    setNameError(null);
    setPhoneError(null);
    setEmailError(null);
    setSelectedTag("");
    setDateSaved(undefined);
    setDateError(null);
    setNotes("");
    setError(null);
  }

  async function handleSubmit(formData: FormData) {
    setNameError(null);
    setPhoneError(null);
    setEmailError(null);
    setDateError(null);
    setError(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();

    let hasError = false;

    if (!trimmedName) {
      setNameError("Name is required.");
      hasError = true;
    }

    if (!trimmedPhone) {
      setPhoneError("Phone number is required.");
      hasError = true;
    } else if (!/^\d{7,15}$/.test(trimmedPhone)) {
      setPhoneError(
        "Enter a valid phone number (digits only, 7-15 digits)."
      );
      hasError = true;
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Please enter a valid email address.");
      hasError = true;
    }

    if (hasError) return;

    formData.set("name", trimmedName);
    formData.set("phone", trimmedPhone);
    formData.set("email", trimmedEmail ? trimmedEmail.toLowerCase() : "");
    formData.set(
      "tags",
      JSON.stringify(selectedTag ? [selectedTag] : [])
    );
    formData.set(
      "dateSaved",
      dateSaved ? toISODateString(dateSaved) : ""
    );
    formData.set("notes", notes.trim());

    setSubmitting(true);

    const result = await addContact(formData);

    setSubmitting(false);

    if (result?.error) {
      toast(result.error || "Failed to create contact", "error");
      return;
    }

    resetForm();
    setOpen(false);
    toast("Contact created successfully");
    onCreated?.();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) {
          resetForm();
        }
      }}
    >
      <SheetTrigger render={<Button className={triggerClassName} />}>
        {triggerLabel}
      </SheetTrigger>

      {/* Right-side Sheet is intentionally preserved */}
      <SheetContent side="right" className="flex flex-col gap-0">
        <SheetHeader className="border-b px-4 py-3.5 sm:px-6 sm:py-5">
          <SheetTitle className="text-lg sm:text-xl">Add Contact</SheetTitle>
          <SheetDescription className="text-sm">
            Enter the contact&apos;s details below.
          </SheetDescription>
        </SheetHeader>

        <form
          action={handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
            <div>
              <p className="text-sm font-medium">Contact details</p>
              <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1">
                Add the basic information for this contact.
              </p>
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <Label htmlFor="name">Name</Label>

              <Input
                id="name"
                name="name"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm sm:h-10"
              />

              {nameError && (
                <p className="text-sm text-destructive">{nameError}</p>
              )}
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <Label htmlFor="phone">Phone</Label>

              <Input
                id="phone"
                name="phone"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-9 text-sm sm:h-10"
              />

              {phoneError && (
                <p className="text-sm text-destructive">{phoneError}</p>
              )}
            </div>

            {/* Email (Optional) */}
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <Label htmlFor="email">Email</Label>

              <Input
                id="email"
                name="email"
                type="email"
                placeholder="e.g. john@example.com (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm sm:h-10"
              />

              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>

            {/* Tag */}
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <Label>Tag</Label>

              <Select
                value={selectedTag}
                onValueChange={(value) => setSelectedTag(value ?? "")}
              >
                <SelectTrigger className="h-9 text-sm sm:h-10 w-full">
                  <SelectValue placeholder="Select a tag" />
                </SelectTrigger>

                <SelectContent>
                  {TAG_OPTIONS.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <DateSavedPicker
              value={dateSaved}
              onChange={setDateSaved}
              error={dateError}
            />

            {/* Notes (Optional) */}
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Company: Acme Capital · Designation: CFO · Sector: Fintech"
                rows={4}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <SheetFooter className="border-t bg-muted/20 px-4 py-3 sm:px-6 sm:py-4 sm:flex-row sm:justify-end gap-2">
            <SheetClose
              render={
                <Button
                  variant="outline"
                  type="button"
                  className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
                />
              }
            >
              Cancel
            </SheetClose>

            <Button
              type="submit"
              disabled={submitting}
              className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
            >
              {submitting ? "Saving..." : "Save Contact"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}