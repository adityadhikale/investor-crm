"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addFollowUp,
  deleteCompletedFollowUp,
  deleteFollowUp,
  editFollowUp,
  getFollowUps,
  markFollowUpAsDone,
  suggestFollowUp,
  type FollowUp,
} from "@/app/investors/actions";
import {
  addMeetingNote,
  deleteMeetingNote,
  generateWhatsAppSummary,
  getMeetingNotes,
  sendWhatsAppMediaReply,
  sendWhatsAppReply,
  sendWhatsAppTemplateToContact,
  transcribeVoiceNote,
  updateMeetingNote,
  type MeetingNote,
} from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Copy, ArrowLeft, Check, Loader2, Mic, Pencil, Sparkles } from "lucide-react";
import { markReadAndNotify } from "@/lib/unread-events";
import {
  WhatsAppHistory,
  type WhatsAppMessage,
} from "@/components/whatsapp-history";
import {
  ContactDetailsDialog,
  type ContactRow,
} from "@/components/contact-details-dialog";

type ContactDetailProps = {
  contact: ContactRow;
  initialNotes: MeetingNote[];
  notesError: string | null;
  initialFollowUps: FollowUp[];
  followUpsError: string | null;
  initialWhatsAppMessages?: WhatsAppMessage[];
  whatsAppMessagesError?: string | null;
  initialWhatsAppSummary?: string | null;
  initialWhatsAppSummaryGeneratedAt?: string | null;
  initialUnreadCount?: number;
};

function toISODateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatFollowUpDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function NoteHistory({
  notes,
  onEdit,
  onDelete,
}: {
  notes: MeetingNote[];
  onEdit: (note: MeetingNote) => void;
  onDelete: (note: MeetingNote) => void;
}) {
  return notes.length ? (
    <div className="space-y-4">
      {notes.map((meetingNote) => {
        const createdAt = new Date(meetingNote.created_at);
        return (
          <div
            key={meetingNote.id}
            className="flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs text-muted-foreground">
                {createdAt.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                ·{" "}
                {createdAt.toLocaleTimeString("en-IN", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </p>
              <p className="whitespace-pre-wrap text-sm">{meetingNote.note}</p>
            </div>
            <div className="shrink-0">
              <DropdownMenu>
                <DropdownMenuIconTrigger label="Meeting note actions" />
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onEdit(meetingNote)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(meetingNote)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">Record what was discussed with this contact.</p>
  );
}

export function ContactDetail({
  contact,
  initialNotes,
  notesError,
  initialFollowUps,
  followUpsError,
  initialWhatsAppMessages = [],
  whatsAppMessagesError = null,
  initialWhatsAppSummary = null,
  initialWhatsAppSummaryGeneratedAt = null,
  initialUnreadCount = 0,
}: ContactDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [summary, setSummary] = useState<string | null>(initialWhatsAppSummary);
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState<string | null>(initialWhatsAppSummaryGeneratedAt);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  async function handleRefreshSummary() {
    setIsGeneratingSummary(true);
    setSummaryError(null);
    try {
      const result = await generateWhatsAppSummary(contact.id);
      if ("error" in result && result.error) {
        setSummaryError(result.error);
        toast(result.error, "error");
      } else if ("success" in result && result.success) {
        setSummary(result.summary);
        setSummaryGeneratedAt(result.generatedAt);
        toast("WhatsApp summary updated.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate summary.";
      setSummaryError(msg);
      toast(msg, "error");
    } finally {
      setIsGeneratingSummary(false);
    }
  }

  const [isSendingReply, setIsSendingReply] = useState(false);

  async function handleSendReply(message: string) {
    setIsSendingReply(true);
    try {
      const result = await sendWhatsAppReply(contact.id, message);
      if ("error" in result && result.error) {
        return { error: result.error };
      }
      toast("Message sent.");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send message.";
      return { error: msg };
    } finally {
      setIsSendingReply(false);
    }
  }

  async function handleSendTemplate(templateId: string, params: string[]) {
    const result = await sendWhatsAppTemplateToContact(contact.id, templateId, params);
    if ("error" in result && result.error) {
      return { error: result.error };
    }
    toast("Template sent.");
    router.refresh();
  }

  const [isSendingMedia, setIsSendingMedia] = useState(false);

  async function handleSendMedia(file: File, caption: string) {
    setIsSendingMedia(true);
    try {
      const result = await sendWhatsAppMediaReply(contact.id, file, caption);
      if ("error" in result && result.error) {
        return { error: result.error };
      }
      toast("File sent.");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send file.";
      return { error: msg };
    } finally {
      setIsSendingMedia(false);
    }
  }

  const [notes, setNotes] = useState(initialNotes);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [addingMeetingNote, setAddingMeetingNote] = useState(false);
  const [meetingNote, setMeetingNote] = useState("");
  const [savingMeetingNote, setSavingMeetingNote] = useState(false);
  const [transcribingVoiceNote, setTranscribingVoiceNote] = useState(false);
  const voiceNoteInputRef = useRef<HTMLInputElement>(null);
  const [followUps, setFollowUps] = useState(initialFollowUps);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(startOfToday());
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [suggestingFollowUp, setSuggestingFollowUp] = useState(false);
  const [completingFollowUpId, setCompletingFollowUpId] = useState<string | null>(null);
  const [confirmingCompleteFollowUp, setConfirmingCompleteFollowUp] = useState<FollowUp | null>(null);

  // Follow-up edit state
  const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
  const [editFollowUpDate, setEditFollowUpDate] = useState<Date | undefined>(undefined);
  const [editFollowUpMessage, setEditFollowUpMessage] = useState("");
  const [savingEditFollowUp, setSavingEditFollowUp] = useState(false);

  // Follow-up delete state (pending)
  const [deletingFollowUp, setDeletingFollowUp] = useState<FollowUp | null>(null);
  const [deletingFollowUpLoading, setDeletingFollowUpLoading] = useState(false);

  // Follow-up delete state (completed)
  const [deletingCompletedFollowUp, setDeletingCompletedFollowUp] = useState<FollowUp | null>(null);
  const [deletingCompletedFollowUpLoading, setDeletingCompletedFollowUpLoading] = useState(false);

  // Meeting note edit state
  const [editingMeetingNote, setEditingMeetingNote] = useState<MeetingNote | null>(null);
  const [editMeetingNoteText, setEditMeetingNoteText] = useState("");
  const [savingEditMeetingNote, setSavingEditMeetingNote] = useState(false);

  // Meeting note delete state
  const [deletingMeetingNote, setDeletingMeetingNote] = useState<MeetingNote | null>(null);
  const [deletingMeetingNoteLoading, setDeletingMeetingNoteLoading] = useState(false);

  async function handleConfirmCompleteFollowUp() {
    if (!confirmingCompleteFollowUp) return;
    const followUpId = confirmingCompleteFollowUp.id;

    setCompletingFollowUpId(followUpId);
    const result = await markFollowUpAsDone(followUpId, contact.id);
    setCompletingFollowUpId(null);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setConfirmingCompleteFollowUp(null);
    toast("Follow-up completed and interaction recorded.");
    await refreshFollowUps();
    router.refresh();
  }

  function startEditFollowUp(followUp: FollowUp) {
    setEditingFollowUp(followUp);
    setEditFollowUpDate(new Date(`${followUp.due_date}T00:00:00`));
    setEditFollowUpMessage(followUp.message);
  }

  async function handleSaveEditFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFollowUp) return;

    if (!editFollowUpDate) {
      toast("Follow-up date is required.", "error");
      return;
    }

    const normalizedMessage = editFollowUpMessage.trim();
    if (!normalizedMessage) {
      toast("Follow-up message is required.", "error");
      return;
    }

    setSavingEditFollowUp(true);
    const result = await editFollowUp(
      editingFollowUp.id,
      contact.id,
      toISODateString(editFollowUpDate),
      normalizedMessage,
    );
    setSavingEditFollowUp(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setEditingFollowUp(null);
    await refreshFollowUps();
    router.refresh();
    toast("Follow-up updated.");
  }

  async function handleConfirmDeleteFollowUp() {
    if (!deletingFollowUp) return;

    setDeletingFollowUpLoading(true);
    const result = await deleteFollowUp(deletingFollowUp.id, contact.id);
    setDeletingFollowUpLoading(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setDeletingFollowUp(null);
    await refreshFollowUps();
    router.refresh();
    toast("Follow-up deleted.");
  }

  async function handleConfirmDeleteCompletedFollowUp() {
    if (!deletingCompletedFollowUp) return;

    setDeletingCompletedFollowUpLoading(true);
    const result = await deleteCompletedFollowUp(deletingCompletedFollowUp.id, contact.id);
    setDeletingCompletedFollowUpLoading(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setDeletingCompletedFollowUp(null);
    await refreshFollowUps();
    router.refresh();
    toast("Follow-up deleted.");
  }

  function startEditMeetingNote(note: MeetingNote) {
    setEditingMeetingNote(note);
    setEditMeetingNoteText(note.note);
  }

  async function handleSaveEditMeetingNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMeetingNote) return;

    const normalizedNote = editMeetingNoteText.trim();
    if (!normalizedNote) {
      toast("Meeting note is required.", "error");
      return;
    }

    setSavingEditMeetingNote(true);
    const result = await updateMeetingNote(editingMeetingNote.id, contact.id, normalizedNote);
    setSavingEditMeetingNote(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setEditingMeetingNote(null);
    await refreshNotes();
    router.refresh();
    toast("Meeting note updated.");
  }

  async function handleConfirmDeleteMeetingNote() {
    if (!deletingMeetingNote) return;

    setDeletingMeetingNoteLoading(true);
    const result = await deleteMeetingNote(deletingMeetingNote.id, contact.id);
    setDeletingMeetingNoteLoading(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setDeletingMeetingNote(null);
    await refreshNotes();
    router.refresh();
    toast("Meeting note deleted.");
  }

  async function refreshNotes() {
    setLoadingNotes(true);
    const result = await getMeetingNotes(contact.id);
    setLoadingNotes(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setNotes(result.notes ?? []);
  }

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(contact.phone);
      toast("Phone number copied");
    } catch {
      toast("Could not copy phone number", "error");
    }
  }

  async function copyEmail() {
    if (!contact.email) return;
    try {
      await navigator.clipboard.writeText(contact.email);
      toast("Email copied");
    } catch {
      toast("Could not copy email", "error");
    }
  }

  async function refreshFollowUps() {
    setLoadingFollowUps(true);
    const result = await getFollowUps(contact.id);
    setLoadingFollowUps(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setFollowUps(result.followUps ?? []);
  }

  function resetFollowUpForm() {
    setFollowUpDate(startOfToday());
    setFollowUpMessage("");
  }

  async function handleSuggestFollowUp() {
    setSuggestingFollowUp(true);
    const result = await suggestFollowUp(contact.id);
    setSuggestingFollowUp(false);

    if ("error" in result) {
      toast(result.error, "error");
      return;
    }
    if (!result.needed) {
      toast("No follow-up needed right now, based on WhatsApp history and meeting notes.");
      return;
    }

    setFollowUpDate(new Date(`${result.dueDate}T00:00:00`));
    setFollowUpMessage(result.message);
    setAddingFollowUp(true);
    toast("Follow-up suggestion ready — review and save below.");
  }

  async function handleAddFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!followUpDate) {
      toast("Follow-up date is required.", "error");
      return;
    }

    const normalizedMessage = followUpMessage.trim();
    if (!normalizedMessage) {
      toast("Follow-up message is required.", "error");
      return;
    }

    setSavingFollowUp(true);
    const result = await addFollowUp(
      contact.id,
      toISODateString(followUpDate),
      normalizedMessage,
    );
    setSavingFollowUp(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setAddingFollowUp(false);
    resetFollowUpForm();
    await refreshFollowUps();
    router.refresh();
    toast("Follow-up saved successfully");
  }

  async function handleVoiceNoteFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setTranscribingVoiceNote(true);
    const result = await transcribeVoiceNote(contact.id, file);
    setTranscribingVoiceNote(false);

    if ("error" in result) {
      toast(result.error, "error");
      return;
    }

    setMeetingNote(result.transcript);
    setAddingMeetingNote(true);
    toast("Voice note transcribed — review and save below.");
  }

  async function handleAddMeetingNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedNote = meetingNote.trim();

    if (!normalizedNote) {
      toast("Meeting note is required.", "error");
      return;
    }

    setSavingMeetingNote(true);
    const result = await addMeetingNote(contact.id, normalizedNote);
    setSavingMeetingNote(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    setMeetingNote("");
    setAddingMeetingNote(false);
    await refreshNotes();
    router.refresh();
    toast("Meeting note saved successfully");
  }

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/contacts"
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Contacts
          </Link>
          <h1 className="text-2xl font-semibold">{contact.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Contact relationship details</p>
        </div>
        <ContactDetailsDialog contact={contact} startInEditMode nativeButtonTrigger>
          <Button type="button" variant="outline" className="shrink-0">
            <Pencil className="size-4" />
            Edit Contact
          </Button>
        </ContactDetailsDialog>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="rounded-lg border bg-background p-5">
          <h2 className="text-base font-semibold">Contact</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="mt-1 font-medium">{contact.name}</p>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                <p className="mt-1 break-words">{contact.phone}</p>
              </div>
              <Button type="button" variant="outline" onClick={copyPhone} className="shrink-0">
                <Copy className="size-4" />
                Copy
              </Button>
            </div>
            {contact.email ? (
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                  <p className="mt-1 break-words">{contact.email}</p>
                </div>
                <Button type="button" variant="outline" onClick={copyEmail} className="shrink-0">
                  <Copy className="size-4" />
                  Copy
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="mt-1 text-muted-foreground">No email added</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</p>
              {contact.tags?.length ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
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
                <p className="mt-1 text-muted-foreground">No tags assigned</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
              {contact.notes?.trim() ? (
                <p className="mt-1 whitespace-pre-wrap">{contact.notes}</p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  No notes yet — e.g. company name, designation, sector
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-background p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Meeting Notes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Record and review contact conversations.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={voiceNoteInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleVoiceNoteFileChange}
                disabled={transcribingVoiceNote}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => voiceNoteInputRef.current?.click()}
                disabled={transcribingVoiceNote}
              >
                {transcribingVoiceNote ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
                {transcribingVoiceNote ? "Transcribing..." : "Upload Voice Note"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddingMeetingNote(true)}>
                Add Meeting Note
              </Button>
            </div>
          </div>
          <div className="mt-5">
            {notesError ? (
              <p className="text-sm text-destructive">{notesError}</p>
            ) : loadingNotes ? (
              <p className="text-sm text-muted-foreground">Loading meeting notes...</p>
            ) : (
              <NoteHistory
                notes={notes}
                onEdit={startEditMeetingNote}
                onDelete={setDeletingMeetingNote}
              />
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-background p-5 lg:mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Follow-ups</h2>
              <p className="mt-1 text-sm text-muted-foreground">Keep track of future contact actions.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSuggestFollowUp}
                disabled={suggestingFollowUp}
              >
                {suggestingFollowUp ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Suggest with AI
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddingFollowUp(true)}>
                Add Follow-up
              </Button>
            </div>
          </div>
          <div className="mt-5">
            {followUpsError ? (
              <p className="text-sm text-destructive">{followUpsError}</p>
            ) : loadingFollowUps ? (
              <p className="text-sm text-muted-foreground">Loading follow-ups...</p>
            ) : followUps.length ? (
              <div className="space-y-4">
                {followUps.map((followUp) => (
                  <div
                    key={followUp.id}
                    className="flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{formatFollowUpDate(followUp.due_date)}</p>
                        {followUp.is_done && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <Check className="size-3 text-green-600" />
                            Completed
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{followUp.message}</p>
                    </div>
                    <div className="shrink-0">
                      <DropdownMenu>
                        <DropdownMenuIconTrigger label="Follow-up actions" />
                        <DropdownMenuContent>
                          {!followUp.is_done ? (
                            <>
                              <DropdownMenuItem onClick={() => startEditFollowUp(followUp)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConfirmingCompleteFollowUp(followUp)}>
                                Mark as Done
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingFollowUp(followUp)}
                                className="text-destructive focus:text-destructive"
                              >
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => setDeletingCompletedFollowUp(followUp)}
                              className="text-destructive focus:text-destructive"
                            >
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No follow-ups scheduled yet.</p>
            )}
          </div>
        </section>

        <WhatsAppHistory
          messages={initialWhatsAppMessages}
          error={whatsAppMessagesError}
          summary={summary}
          summaryGeneratedAt={summaryGeneratedAt}
          onRefreshSummary={handleRefreshSummary}
          isGeneratingSummary={isGeneratingSummary}
          summaryError={summaryError}
          onSendReply={handleSendReply}
          isSendingReply={isSendingReply}
          onSendMedia={handleSendMedia}
          isSendingMedia={isSendingMedia}
          onOpened={() => void markReadAndNotify(contact.id)}
          unreadCount={initialUnreadCount}
          onSendTemplate={handleSendTemplate}
          contactName={contact.name}
          className="mb-8"
        />
      </div>

      {/* Add Meeting Note Dialog */}
      <Dialog
        open={addingMeetingNote}
        onOpenChange={(next) => {
          setAddingMeetingNote(next);
          if (!next) setMeetingNote("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Meeting Note</DialogTitle>
            <DialogDescription>Record what was discussed with this contact.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMeetingNote} className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-meeting-note" className="text-sm font-medium">Meeting note</label>
              <textarea
                id="contact-meeting-note"
                value={meetingNote}
                onChange={(event) => setMeetingNote(event.target.value)}
                placeholder="e.g. Discussed project timeline."
                rows={5}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                disabled={savingMeetingNote}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={savingMeetingNote} />}>Cancel</DialogClose>
              <Button type="submit" disabled={savingMeetingNote || !meetingNote.trim()}>
                {savingMeetingNote ? "Saving..." : "Save Meeting Note"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Meeting Note Dialog */}
      <Dialog
        open={Boolean(editingMeetingNote)}
        onOpenChange={(next) => {
          if (!next) setEditingMeetingNote(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Meeting Note</DialogTitle>
            <DialogDescription>Update the notes from this meeting. The original date and time will remain unchanged.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEditMeetingNote} className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-edit-meeting-note" className="text-sm font-medium">Meeting note</label>
              <textarea
                id="contact-edit-meeting-note"
                value={editMeetingNoteText}
                onChange={(event) => setEditMeetingNoteText(event.target.value)}
                rows={5}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                disabled={savingEditMeetingNote}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={savingEditMeetingNote} />}>Cancel</DialogClose>
              <Button type="submit" disabled={savingEditMeetingNote || !editMeetingNoteText.trim()}>
                {savingEditMeetingNote ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Meeting Note Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingMeetingNote)}
        onOpenChange={(next) => {
          if (!next) setDeletingMeetingNote(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete meeting note?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this meeting note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={deletingMeetingNoteLoading} />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingMeetingNoteLoading}
              onClick={handleConfirmDeleteMeetingNote}
            >
              {deletingMeetingNoteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Follow-up Dialog */}
      <Dialog
        open={addingFollowUp}
        onOpenChange={(next) => {
          setAddingFollowUp(next);
          if (!next) resetFollowUpForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Follow-up</DialogTitle>
            <DialogDescription>Schedule a future action for this contact.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddFollowUp} className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Follow-up date</label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" className="h-10 w-full justify-start gap-2 font-normal" />
                  }
                >
                  <CalendarIcon className="size-4" />
                  {followUpDate ? (
                    followUpDate.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  ) : (
                    <span className="text-muted-foreground">Pick a date</span>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={setFollowUpDate}
                    disabled={{ before: startOfToday() }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-follow-up-message" className="text-sm font-medium">Message</label>
              <textarea
                id="contact-follow-up-message"
                value={followUpMessage}
                onChange={(event) => setFollowUpMessage(event.target.value)}
                placeholder="e.g. Send the updated proposal."
                rows={4}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                disabled={savingFollowUp}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={savingFollowUp} />}>Cancel</DialogClose>
              <Button type="submit" disabled={savingFollowUp || !followUpDate || !followUpMessage.trim()}>
                {savingFollowUp ? "Saving..." : "Save Follow-up"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Follow-up Dialog */}
      <Dialog
        open={Boolean(editingFollowUp)}
        onOpenChange={(next) => {
          if (!next) {
            setEditingFollowUp(null);
            setEditFollowUpDate(undefined);
            setEditFollowUpMessage("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Follow-up</DialogTitle>
            <DialogDescription>Update the date or message for this follow-up.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEditFollowUp} className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Follow-up date</label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" className="h-10 w-full justify-start gap-2 font-normal" />
                  }
                >
                  <CalendarIcon className="size-4" />
                  {editFollowUpDate ? (
                    editFollowUpDate.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  ) : (
                    <span className="text-muted-foreground">Pick a date</span>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editFollowUpDate}
                    onSelect={setEditFollowUpDate}
                    disabled={{ before: startOfToday() }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="contact-edit-follow-up-message" className="text-sm font-medium">Message</label>
              <textarea
                id="contact-edit-follow-up-message"
                value={editFollowUpMessage}
                onChange={(event) => setEditFollowUpMessage(event.target.value)}
                rows={4}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                disabled={savingEditFollowUp}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={savingEditFollowUp} />}>Cancel</DialogClose>
              <Button type="submit" disabled={savingEditFollowUp || !editFollowUpDate || !editFollowUpMessage.trim()}>
                {savingEditFollowUp ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Pending Follow-up Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingFollowUp)}
        onOpenChange={(next) => {
          if (!next) setDeletingFollowUp(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Follow-up?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this follow-up? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={deletingFollowUpLoading} />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingFollowUpLoading}
              onClick={handleConfirmDeleteFollowUp}
            >
              {deletingFollowUpLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Completed Follow-up Confirmation Dialog (Strong Warning) */}
      <Dialog
        open={Boolean(deletingCompletedFollowUp)}
        onOpenChange={(next) => {
          if (!next) setDeletingCompletedFollowUp(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete completed follow-up?</DialogTitle>
            <DialogDescription className="space-y-2">
              <span>This follow-up has already been marked as completed.</span>
              <span className="block">
                Deleting it will remove the follow-up from this contact&apos;s follow-up history.
              </span>
              <span className="block">
                The completion interaction will remain in the contact&apos;s interaction history.
              </span>
              <span className="block font-medium text-foreground">
                This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={deletingCompletedFollowUpLoading} />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingCompletedFollowUpLoading}
              onClick={handleConfirmDeleteCompletedFollowUp}
            >
              {deletingCompletedFollowUpLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Done Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmingCompleteFollowUp)}
        onOpenChange={(next) => {
          if (!next) setConfirmingCompleteFollowUp(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark follow-up as completed?</DialogTitle>
            <DialogDescription>
              This will mark this follow-up as completed and add it to the contact&apos;s interaction history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={Boolean(completingFollowUpId)} />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              disabled={Boolean(completingFollowUpId)}
              onClick={handleConfirmCompleteFollowUp}
            >
              {completingFollowUpId ? "Marking..." : "Mark as Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
