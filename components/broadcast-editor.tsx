"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAPPING_SOURCE_LABELS: Record<string, string> = {
  first_name: "First Name",
  name: "Full Name",
  phone: "Phone",
  email: "Email",
  static: "Custom Text",
};
import { TAG_OPTIONS } from "@/components/add-contact-dialog";
import {
  createBroadcastDraft,
  createScheduledBroadcast,
  updateBroadcast,
  type TargetType,
  type GroupOption,
  type ContactOption,
  type TemplateOption,
  type BroadcastData,
} from "@/app/broadcasts/actions";
import { useToast } from "@/components/toast-provider";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Clock, Search, Users, FileText, Variable, Eye, X } from "lucide-react";
import { startOfToday } from "date-fns";
import {
  extractPlaceholders,
} from "@/components/template-editor";

export type VariableMappingType = "contact_field" | "static";
export type SupportedContactField = "first_name" | "name" | "phone" | "email";

export interface ContactFieldMapping {
  type: "contact_field";
  field: SupportedContactField;
  fallback?: string;
}

export interface StaticMapping {
  type: "static";
  value: string;
}

export type VariableMapping = ContactFieldMapping | StaticMapping;
export type VariableMappings = Record<string, VariableMapping>;

export const SAMPLE_PREVIEW_CONTACT: Record<SupportedContactField, string> = {
  first_name: "Aditya",
  name: "Aditya Dhikale",
  phone: "+91 98765 43210",
  email: "aditya@crestcapital.com",
};

function createDefaultMappings(
  placeholders: string[],
  existing?: Record<string, unknown> | null
): VariableMappings {
  const mappings: VariableMappings = {};
  for (const ph of placeholders) {
    if (existing && existing[ph] && typeof existing[ph] === "object") {
      const raw = existing[ph] as Record<string, unknown>;
      if (raw.type === "static") {
        mappings[ph] = {
          type: "static",
          value: typeof raw.value === "string" ? raw.value : "",
        };
        continue;
      } else if (raw.type === "contact_field") {
        const field =
          raw.field === "name" ||
          raw.field === "phone" ||
          raw.field === "email"
            ? (raw.field as SupportedContactField)
            : "first_name";
        mappings[ph] = {
          type: "contact_field",
          field,
          fallback:
            typeof raw.fallback === "string" ? raw.fallback : "Investor",
        };
        continue;
      }
    }
    mappings[ph] = {
      type: "contact_field",
      field: "first_name",
      fallback: "Investor",
    };
  }
  return mappings;
}

function computeResolvedMessage(
  body: string,
  mappings: VariableMappings,
  placeholders: string[]
): string {
  let resolved = body;
  for (const ph of placeholders) {
    const mapping = mappings[ph];
    let val = `{{${ph}}}`;
    if (mapping) {
      if (mapping.type === "static") {
        val = mapping.value || `{{${ph}}}`;
      } else if (mapping.type === "contact_field") {
        val =
          SAMPLE_PREVIEW_CONTACT[mapping.field] ||
          mapping.fallback ||
          `{{${ph}}}`;
      }
    }
    resolved = resolved.replaceAll(`{{${ph}}}`, val);
  }
  return resolved;
}

export interface BroadcastEditorProps {
  mode: "create" | "edit";
  groups: GroupOption[];
  contacts: ContactOption[];
  templates?: TemplateOption[];
  existingBroadcast?: BroadcastData | null;
}

function getDefaultFutureTime(): {
  hour: string;
  minute: string;
  period: "AM" | "PM";
} {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  let hours = now.getHours();
  const period: "AM" | "PM" = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return {
    hour: String(hours).padStart(2, "0"),
    minute: "00",
    period,
  };
}

function combineDateAndTime(
  date: Date | undefined,
  hourStr: string,
  minuteStr: string,
  period: "AM" | "PM"
): Date | undefined {
  if (!date) return undefined;
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (isNaN(hour) || isNaN(minute)) return undefined;

  if (period === "AM") {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function formatScheduledDisplay(date: Date | undefined): string {
  if (!date) return "";
  const datePart = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function parseScheduledDateTime(dateStr: string | null | undefined): {
  date: Date;
  hour: string;
  minute: string;
  period: "AM" | "PM";
} | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  let hours = d.getHours();
  const period: "AM" | "PM" = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const minutes = d.getMinutes();
  const roundedMinutes = Math.min(55, Math.round(minutes / 5) * 5);
  const minuteStr = String(roundedMinutes).padStart(2, "0");
  const hourStr = String(hours).padStart(2, "0");

  return {
    date: d,
    hour: hourStr,
    minute: minuteStr,
    period,
  };
}

export function BroadcastEditor({
  mode,
  groups = [],
  contacts = [],
  templates = [],
  existingBroadcast,
}: BroadcastEditorProps) {
  const router = useRouter();
  const { toast } = useToast();

  const isEditing = mode === "edit" && Boolean(existingBroadcast);
  const isEditingScheduled = existingBroadcast?.status === "scheduled";
  const isSent = existingBroadcast?.status === "sent";
  const isReadOnly = isSent;

  const [messageText, setMessageText] = useState(() => {
    return existingBroadcast?.message_text ?? "";
  });

  // Template Mode State & Variable Mappings
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    return existingBroadcast?.template_id ?? "";
  });
  const [templateSourceBody, setTemplateSourceBody] = useState<string>(() => {
    if (existingBroadcast?.template_id && templates.length > 0) {
      const tmpl = templates.find((t) => t.id === existingBroadcast.template_id);
      return tmpl?.body_text ?? "";
    }
    return "";
  });
  const [templateMode, setTemplateMode] = useState<"custom" | "template">(() => {
    return existingBroadcast?.template_id ? "template" : "custom";
  });
  const [variableMappings, setVariableMappings] = useState<VariableMappings>(() => {
    if (existingBroadcast?.template_id && templates.length > 0) {
      const tmpl = templates.find((t) => t.id === existingBroadcast.template_id);
      if (tmpl) {
        const placeholders = extractPlaceholders(tmpl.body_text);
        return createDefaultMappings(
          placeholders,
          existingBroadcast.variable_mappings
        );
      }
    }
    return {};
  });


  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) ?? null;
  }, [templates, selectedTemplateId]);
  const isMetaTemplate = Boolean(selectedTemplate?.meta_template_id);

  // Detected placeholders in current template source body
  const detectedPlaceholders = useMemo(() => {
    if (!templateSourceBody) return [];
    return extractPlaceholders(templateSourceBody);
  }, [templateSourceBody]);

  function handleSelectTemplate(templateId: string) {
    if (isReadOnly) return;
    setSelectedTemplateId(templateId);
    if (messageError) setMessageError(null);

    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      setTemplateMode("template");
      setTemplateSourceBody(tmpl.body_text);

      const placeholders = extractPlaceholders(tmpl.body_text);
      const initialMappings = createDefaultMappings(placeholders);
      setVariableMappings(initialMappings);

      const initialResolved = computeResolvedMessage(
        tmpl.body_text,
        initialMappings,
        placeholders
      );
      setMessageText(initialResolved);
    } else {
      setTemplateMode("custom");
      setTemplateSourceBody("");
      setVariableMappings({});
    }
  }

  function handleMappingTypeChange(ph: string, type: VariableMappingType) {
    if (isReadOnly) return;
    const current = variableMappings[ph];
    let next: VariableMapping;
    if (type === "static") {
      next = {
        type: "static",
        value: current && current.type === "static" ? current.value : "",
      };
    } else {
      next = {
        type: "contact_field",
        field: "first_name",
        fallback:
          current && current.type === "contact_field"
            ? current.fallback ?? "Investor"
            : "Investor",
      };
    }
    const nextMappings = { ...variableMappings, [ph]: next };
    setVariableMappings(nextMappings);
    const updated = computeResolvedMessage(
      templateSourceBody,
      nextMappings,
      detectedPlaceholders
    );
    setMessageText(updated);
    if (messageError) setMessageError(null);
  }

  function handleMappingFieldChange(ph: string, field: SupportedContactField) {
    if (isReadOnly) return;
    const current = variableMappings[ph];
    const fallback =
      current && current.type === "contact_field"
        ? current.fallback
        : "Investor";
    const next: VariableMapping = {
      type: "contact_field",
      field,
      fallback,
    };
    const nextMappings = { ...variableMappings, [ph]: next };
    setVariableMappings(nextMappings);
    const updated = computeResolvedMessage(
      templateSourceBody,
      nextMappings,
      detectedPlaceholders
    );
    setMessageText(updated);
    if (messageError) setMessageError(null);
  }

  function handleMappingFallbackChange(ph: string, fallback: string) {
    if (isReadOnly) return;
    const current = variableMappings[ph];
    if (current && current.type === "contact_field") {
      const next: VariableMapping = {
        ...current,
        fallback,
      };
      const nextMappings = { ...variableMappings, [ph]: next };
      setVariableMappings(nextMappings);
      const updated = computeResolvedMessage(
        templateSourceBody,
        nextMappings,
        detectedPlaceholders
      );
      setMessageText(updated);
    }
  }

  function handleMappingStaticValueChange(ph: string, value: string) {
    if (isReadOnly) return;
    const next: VariableMapping = {
      type: "static",
      value,
    };
    const nextMappings = { ...variableMappings, [ph]: next };
    setVariableMappings(nextMappings);
    const updated = computeResolvedMessage(
      templateSourceBody,
      nextMappings,
      detectedPlaceholders
    );
    setMessageText(updated);
    if (messageError) setMessageError(null);
  }

  function handleClearTemplate() {
    setSelectedTemplateId("");
    setTemplateSourceBody("");
    setVariableMappings({});
    setTemplateMode("custom");
    if (messageError) setMessageError(null);
  }

  const [targetType, setTargetType] = useState<TargetType>(() => {
    return existingBroadcast?.target_type ?? "group";
  });
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(() => {
    return existingBroadcast?.target_type === "group"
      ? existingBroadcast.target_ids ?? []
      : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    return existingBroadcast?.target_type === "tag"
      ? existingBroadcast.target_ids ?? []
      : [];
  });
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(() => {
    return existingBroadcast?.target_type === "manual"
      ? existingBroadcast.target_ids ?? []
      : [];
  });
  const [contactSearch, setContactSearch] = useState("");

  const [scheduleMode, setScheduleMode] = useState<"now" | "later">(() => {
    return existingBroadcast?.status === "scheduled" ? "later" : "now";
  });

  const initialScheduleParsed = existingBroadcast?.scheduled_for
    ? parseScheduledDateTime(existingBroadcast.scheduled_for)
    : null;

  const [selectedScheduleDate, setSelectedScheduleDate] = useState<
    Date | undefined
  >(() => initialScheduleParsed?.date ?? undefined);

  const [selectedHour, setSelectedHour] = useState<string>(() => {
    return initialScheduleParsed?.hour ?? getDefaultFutureTime().hour;
  });
  const [selectedMinute, setSelectedMinute] = useState<string>(() => {
    return initialScheduleParsed?.minute ?? getDefaultFutureTime().minute;
  });
  const [selectedPeriod, setSelectedPeriod] = useState<"AM" | "PM">(() => {
    return initialScheduleParsed?.period ?? getDefaultFutureTime().period;
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const scheduledDate = combineDateAndTime(
    selectedScheduleDate,
    selectedHour,
    selectedMinute,
    selectedPeriod
  );

  const [messageError, setMessageError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Group mode Select All logic
  const allGroupsSelected =
    groups.length > 0 && selectedGroupIds.length === groups.length;
  const someGroupsSelected =
    selectedGroupIds.length > 0 && !allGroupsSelected;
  const selectAllGroupsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllGroupsRef.current) {
      selectAllGroupsRef.current.indeterminate = someGroupsSelected;
    }
  }, [someGroupsSelected]);

  function toggleAllGroups() {
    if (isReadOnly) return;
    if (allGroupsSelected) {
      setSelectedGroupIds([]);
    } else {
      setSelectedGroupIds(groups.map((g) => g.id));
    }
    setTargetError(null);
  }

  function handleGroupToggle(groupId: string) {
    if (isReadOnly) return;
    setSelectedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    );
    setTargetError(null);
  }

  // Tag mode Select All logic
  const allTagsSelected =
    TAG_OPTIONS.length > 0 && selectedTags.length === TAG_OPTIONS.length;
  const someTagsSelected = selectedTags.length > 0 && !allTagsSelected;
  const selectAllTagsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllTagsRef.current) {
      selectAllTagsRef.current.indeterminate = someTagsSelected;
    }
  }, [someTagsSelected]);

  function toggleAllTags() {
    if (isReadOnly) return;
    if (allTagsSelected) {
      setSelectedTags([]);
    } else {
      setSelectedTags([...TAG_OPTIONS]);
    }
    setTargetError(null);
  }

  function handleTagToggle(tag: string) {
    if (isReadOnly) return;
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
    setTargetError(null);
  }

  // Manual mode contacts filter & Select All logic
  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  });

  const visibleContactIds = filteredContacts.map((c) => c.id);
  const filteredSelectedCount = visibleContactIds.filter((id) =>
    selectedContactIds.includes(id)
  ).length;

  const allVisibleSelected =
    visibleContactIds.length > 0 &&
    filteredSelectedCount === visibleContactIds.length;
  const someVisibleSelected =
    filteredSelectedCount > 0 && !allVisibleSelected;
  const selectAllContactsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllContactsRef.current) {
      selectAllContactsRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function toggleAllVisibleContacts() {
    if (isReadOnly) return;
    if (allVisibleSelected) {
      setSelectedContactIds((prev) =>
        prev.filter((id) => !visibleContactIds.includes(id))
      );
    } else {
      setSelectedContactIds((prev) =>
        Array.from(new Set([...prev, ...visibleContactIds]))
      );
    }
    setTargetError(null);
  }

  function handleContactToggle(contactId: string) {
    if (isReadOnly) return;
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    );
    setTargetError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnly) return;

    setMessageError(null);
    setTargetError(null);
    setScheduleError(null);
    setError(null);

    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) {
      setMessageError("Message text is required.");
      return;
    }

    // If template mode is active with variables, validate that every placeholder has a valid mapping
    if (templateMode === "template" && detectedPlaceholders.length > 0) {
      for (const ph of detectedPlaceholders) {
        const mapping = variableMappings[ph];
        if (!mapping) {
          setMessageError(`Please configure variable mapping for {{${ph}}}.`);
          return;
        }
        if (mapping.type === "static") {
          if (!mapping.value || !mapping.value.trim()) {
            setMessageError(`Please enter a value for {{${ph}}} static text.`);
            return;
          }
        } else if (mapping.type === "contact_field") {
          const validFields: SupportedContactField[] = [
            "first_name",
            "name",
            "phone",
            "email",
          ];
          if (!validFields.includes(mapping.field)) {
            setMessageError(`Please select a valid contact field for {{${ph}}}.`);
            return;
          }
        }
      }
    }

    let targetIds: string[] = [];
    if (targetType === "group") {
      if (selectedGroupIds.length === 0) {
        setTargetError("Please select at least one group.");
        return;
      }
      targetIds = selectedGroupIds;
    } else if (targetType === "tag") {
      if (selectedTags.length === 0) {
        setTargetError("Please select at least one tag.");
        return;
      }
      targetIds = selectedTags;
    } else if (targetType === "manual") {
      if (selectedContactIds.length === 0) {
        setTargetError("Please select at least one contact.");
        return;
      }
      targetIds = selectedContactIds;
    }

    if ((!isEditing && scheduleMode === "later") || isEditingScheduled) {
      if (!selectedScheduleDate) {
        setScheduleError("Scheduled date and time is required.");
        return;
      }
      if (!scheduledDate || isNaN(scheduledDate.getTime())) {
        setScheduleError("Please select a valid scheduled date and time.");
        return;
      }
      if (scheduledDate.getTime() <= new Date().getTime()) {
        setScheduleError("Scheduled time must be in the future.");
        return;
      }
      if (isMetaTemplate && !selectedTemplate?.approved_at) {
        setMessageError(
          "This template is not approved by Meta yet, so it can't be scheduled. Save it as a draft instead."
        );
        return;
      }
    }

    setSubmitting(true);
    let result: { success?: boolean; error?: string };

    const templateIdPayload =
      templateMode === "template" && selectedTemplateId
        ? selectedTemplateId
        : null;
    const variableMappingsPayload =
      templateMode === "template" && selectedTemplateId
        ? variableMappings
        : {};

    if (isEditing && existingBroadcast) {
      result = await updateBroadcast(existingBroadcast.id, {
        message_text: trimmedMessage,
        target_type: targetType,
        target_ids: targetIds,
        ...(isEditingScheduled && scheduledDate
          ? { scheduled_for: scheduledDate.toISOString() }
          : {}),
        template_id: templateIdPayload,
        variable_mappings: variableMappingsPayload,
      });
    } else if (scheduleMode === "later") {
      if (!scheduledDate) {
        setScheduleError("Scheduled date and time is required.");
        setSubmitting(false);
        return;
      }
      result = await createScheduledBroadcast({
        message_text: trimmedMessage,
        target_type: targetType,
        target_ids: targetIds,
        scheduled_for: scheduledDate.toISOString(),
        template_id: templateIdPayload,
        variable_mappings: variableMappingsPayload,
      });
    } else {
      result = await createBroadcastDraft({
        message_text: trimmedMessage,
        target_type: targetType,
        target_ids: targetIds,
        template_id: templateIdPayload,
        variable_mappings: variableMappingsPayload,
      });
    }

    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      toast(result.error, "error");
      return;
    }

    toast(
      isEditingScheduled
        ? "Scheduled broadcast updated successfully"
        : isEditing
        ? "Broadcast updated successfully"
        : scheduleMode === "later"
        ? "Broadcast scheduled successfully"
        : "Broadcast draft saved successfully"
    );

    router.push("/broadcasts");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isReadOnly && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          This broadcast has already been sent and cannot be edited.
        </div>
      )}

      {/* Message Text Section */}
      <section className="rounded-lg border bg-background p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Message</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compose custom message text or populate from a pre-defined WhatsApp template.
            </p>
          </div>
          {!isReadOnly && (
            <div className="flex items-center gap-2">
              <Select
                value={selectedTemplateId || "none"}
                disabled={templates.length === 0}
                onValueChange={(value) => {
                  handleSelectTemplate(value === "none" || !value ? "" : value);
                }}
              >
                <SelectTrigger
                  className="h-8 w-[260px] max-w-xs text-xs font-medium"
                  aria-label="Use Template"
                >
                  <SelectValue
                    placeholder={
                      templates.length === 0
                        ? "No templates available"
                        : "-- Use a Template (Optional) --"
                    }
                  >
                    {/* Show the template's name, not its ID. */}
                    {(value: string | null) =>
                      templates.find((t) => t.id === value)?.name ??
                      (templates.length === 0
                        ? "No templates available"
                        : "-- Use a Template (Optional) --")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {templates.length === 0
                      ? "No templates available"
                      : "-- Use a Template (Optional) --"}
                  </SelectItem>
                  {templates.map((tmpl) => (
                    <SelectItem key={tmpl.id} value={tmpl.id}>
                      {tmpl.name} ({tmpl.category || "General"})
                      {tmpl.meta_template_id
                        ? tmpl.approved_at
                          ? " ✓ Meta approved"
                          : " (Not approved by Meta yet)"
                        : tmpl.approved_at
                        ? " ✓"
                        : " (Draft)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplateId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearTemplate}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Template info banner if selected */}
        {selectedTemplate && (
          <div className="mt-3 flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="font-medium text-foreground">
                Loaded Template: <code className="font-mono text-primary font-semibold">{selectedTemplate.name}</code>
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase font-medium text-muted-foreground">
                {selectedTemplate.category || "Template"}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {detectedPlaceholders.length} variable{detectedPlaceholders.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {!isReadOnly && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isMetaTemplate && selectedTemplate
              ? selectedTemplate.approved_at
                ? "Meta-approved template: reaches contacts even if they haven't messaged you in the last 24 hours. It is sent exactly as approved; only the variables change per contact."
                : "This template is not approved by Meta yet. You can save a draft, but it can't be sent or scheduled until Meta approves it and you sync templates again."
              : `${selectedTemplate ? "CRM template" : "Custom message"}: sent as plain text, so only contacts who messaged you in the last 24 hours receive it. Everyone else is skipped and listed after sending; use an approved Meta template to reach them.`}
          </p>
        )}

        {/* Dynamic Variable Mapping if template has placeholders */}
        {selectedTemplate && detectedPlaceholders.length > 0 && (
          <div className="mt-4 rounded-md border bg-muted/20 p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Variable className="size-3.5 text-muted-foreground" />
                <span>Variable Mappings</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Map variables to contact fields or custom text
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Configure how each placeholder will resolve for recipients. The preview below reflects these mappings against sample contact data.
            </p>

            <div className="mt-3 space-y-2.5">
              {detectedPlaceholders.map((ph) => {
                const mapping = variableMappings[ph] ?? {
                  type: "contact_field",
                  field: "first_name",
                  fallback: "Investor",
                };
                const sampleVal = selectedTemplate.variables?.[ph];

                return (
                  <div
                    key={ph}
                    className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/60 p-2.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    {/* Variable Tag & Template Sample */}
                    <div className="flex items-center gap-2 sm:w-36 shrink-0">
                      <span className="inline-flex items-center rounded bg-primary/10 px-2 py-1 font-mono text-xs font-semibold text-primary">
                        {`{{${ph}}}`}
                      </span>
                      {sampleVal && (
                        <span
                          className="text-[10px] text-muted-foreground truncate max-w-[80px]"
                          title={`Template sample: ${sampleVal}`}
                        >
                          ex: &quot;{sampleVal}&quot;
                        </span>
                      )}
                    </div>

                    {/* Source Selector: Contact Field vs Custom Text */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={
                          mapping.type === "static" ? "static" : mapping.field
                        }
                        disabled={isReadOnly}
                        onValueChange={(val) => {
                          if (!val) return;
                          if (val === "static") {
                            handleMappingTypeChange(ph, "static");
                          } else {
                            if (mapping.type !== "contact_field") {
                              handleMappingTypeChange(ph, "contact_field");
                            }
                            handleMappingFieldChange(
                              ph,
                              val as SupportedContactField
                            );
                          }
                        }}
                      >
                        <SelectTrigger
                          className="h-8 w-[140px] text-xs font-medium"
                          aria-label={`Source for variable ${ph}`}
                        >
                          <SelectValue>
                            {(value: string) => MAPPING_SOURCE_LABELS[value] ?? value}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Contact field</SelectLabel>
                            <SelectItem value="first_name">First Name</SelectItem>
                            <SelectItem value="name">Full Name</SelectItem>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Custom</SelectLabel>
                            <SelectItem value="static">Custom Text</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Input field based on type */}
                    <div className="flex-1 min-w-0">
                      {mapping.type === "static" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            Value:
                          </span>
                          <Input
                            placeholder="Enter static text..."
                            value={mapping.value ?? ""}
                            disabled={isReadOnly}
                            onChange={(e) =>
                              handleMappingStaticValueChange(ph, e.target.value)
                            }
                            className="h-8 text-xs flex-1"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            Fallback:
                          </span>
                          <Input
                            placeholder="e.g. Investor"
                            value={mapping.fallback ?? ""}
                            disabled={isReadOnly}
                            onChange={(e) =>
                              handleMappingFallbackChange(ph, e.target.value)
                            }
                            className="h-8 text-xs flex-1"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Message text field (Editable resolved message) */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="broadcast-message">Message text</Label>
            {selectedTemplate && (
              <span className="text-[11px] text-muted-foreground">
                {isMetaTemplate
                  ? "Preview only: Meta templates can't be edited here."
                  : "You can make additional custom edits directly below."}
              </span>
            )}
          </div>
          <Textarea
            id="broadcast-message"
            placeholder="Type your broadcast message here..."
            value={messageText}
            disabled={isReadOnly || isMetaTemplate}
            onChange={(e) => {
              setMessageText(e.target.value);
              if (messageError) setMessageError(null);
            }}
            rows={5}
            className="resize-y font-sans text-sm leading-relaxed"
          />
          {messageError && (
            <p className="text-sm text-destructive">{messageError}</p>
          )}
        </div>

        {/* WhatsApp-style Preview Bubble */}
        {messageText.trim() && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Eye className="size-3.5" />
                <span>Message Preview</span>
              </div>
              {selectedTemplate && detectedPlaceholders.length > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border/50">
                  Previewed with sample contact: <strong className="font-medium text-foreground">Aditya Dhikale</strong>
                </span>
              )}
            </div>
            <div className="inline-block max-w-lg rounded-xl rounded-tl-xs bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 shadow-xs text-sm leading-relaxed text-foreground whitespace-pre-wrap dark:bg-emerald-950/30">
              {messageText}
            </div>
          </div>
        )}
      </section>

      {/* Targeting Options Section */}
      <section className="rounded-lg border bg-background p-5">
        <h2 className="text-base font-semibold">Target Audience</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose whether to broadcast to a specific group, tag, or select individual contacts.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Label>Targeting mode</Label>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs sm:text-sm max-w-md">
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => {
                setTargetType("group");
                setTargetError(null);
              }}
              className={cn(
                "cursor-pointer rounded-md py-1.5 font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60",
                targetType === "group"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Group
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => {
                setTargetType("tag");
                setTargetError(null);
              }}
              className={cn(
                "cursor-pointer rounded-md py-1.5 font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60",
                targetType === "tag"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tag
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => {
                setTargetType("manual");
                setTargetError(null);
              }}
              className={cn(
                "cursor-pointer rounded-md py-1.5 font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60",
                targetType === "manual"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Manual
            </button>
          </div>

          {/* Group Mode */}
          {targetType === "group" && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                  <input
                    ref={selectAllGroupsRef}
                    type="checkbox"
                    checked={allGroupsSelected}
                    onChange={toggleAllGroups}
                    disabled={isReadOnly || groups.length === 0}
                    aria-label="Select all groups"
                    className="size-4 cursor-pointer accent-primary rounded disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span>Select All</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {selectedGroupIds.length} of {groups.length} selected
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y rounded-md border p-1">
                {groups.length > 0 ? (
                  groups.map((group) => {
                    const isSelected = selectedGroupIds.includes(group.id);
                    return (
                      <label
                        key={group.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-muted/60 select-none transition-colors",
                          isReadOnly && "cursor-default hover:bg-transparent"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isReadOnly}
                          onCheckedChange={() => handleGroupToggle(group.id)}
                        />
                        <span className="truncate text-sm font-medium">
                          {group.name}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No groups available. Please create a group first in Groups.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tag Mode */}
          {targetType === "tag" && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                  <input
                    ref={selectAllTagsRef}
                    type="checkbox"
                    checked={allTagsSelected}
                    onChange={toggleAllTags}
                    disabled={isReadOnly}
                    aria-label="Select all tags"
                    className="size-4 cursor-pointer accent-primary rounded disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span>Select All</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {selectedTags.length} of {TAG_OPTIONS.length} selected
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y rounded-md border p-1">
                {TAG_OPTIONS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <label
                      key={tag}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-muted/60 select-none transition-colors",
                        isReadOnly && "cursor-default hover:bg-transparent"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isReadOnly}
                        onCheckedChange={() => handleTagToggle(tag)}
                      />
                      <span className="text-sm font-medium">{tag}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual Mode */}
          {targetType === "manual" && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="relative max-w-md">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts by name or phone..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="h-9 pl-8 text-sm"
                />
              </div>

              <div className="flex items-center justify-between px-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                  <input
                    ref={selectAllContactsRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisibleContacts}
                    disabled={isReadOnly || visibleContactIds.length === 0}
                    aria-label="Select all matching contacts"
                    className="size-4 cursor-pointer accent-primary rounded disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span>
                    Select All
                    {contactSearch.trim() ? ` (${filteredContacts.length} matching)` : ""}
                  </span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {selectedContactIds.length} of {contacts.length} selected
                  {contactSearch.trim() && ` (${filteredSelectedCount} in search)`}
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y rounded-md border">
                {filteredContacts.length > 0 ? (
                  filteredContacts.map((contact) => {
                    const isSelected = selectedContactIds.includes(contact.id);
                    return (
                      <label
                        key={contact.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 select-none",
                          isReadOnly && "cursor-default hover:bg-transparent"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isReadOnly}
                          onCheckedChange={() => handleContactToggle(contact.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm">
                            {contact.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {contact.phone}
                          </p>
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    {contactSearch
                      ? "No matching contacts found."
                      : "No contacts available."}
                  </div>
                )}
              </div>
            </div>
          )}

          {targetError && (
            <p className="text-sm text-destructive">{targetError}</p>
          )}

          {/* Recipient & Audience Summary Card */}
          <div className="mt-2 rounded-lg border bg-muted/40 p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Users className="size-3.5 text-muted-foreground" />
                Target Audience Summary
              </span>
              <span className="font-medium text-muted-foreground">
                {targetType === "group"
                  ? `${selectedGroupIds.length} group${selectedGroupIds.length === 1 ? "" : "s"} selected`
                  : targetType === "tag"
                  ? `${selectedTags.length} tag${selectedTags.length === 1 ? "" : "s"} selected`
                  : `${selectedContactIds.length} contact${selectedContactIds.length === 1 ? "" : "s"} selected`}
              </span>
            </div>

            <p className="mt-1.5 text-muted-foreground leading-relaxed">
              {targetType === "group" && (
                selectedGroupIds.length > 0 ? (
                  `Will broadcast to contacts in: ${groups
                    .filter((g) => selectedGroupIds.includes(g.id))
                    .map((g) => g.name)
                    .join(", ")}`
                ) : (
                  "Select one or more groups from the list above."
                )
              )}
              {targetType === "tag" && (
                selectedTags.length > 0 ? (
                  `Will broadcast to contacts tagged: ${selectedTags.join(", ")}`
                ) : (
                  "Select one or more tags from the list above."
                )
              )}
              {targetType === "manual" && (
                selectedContactIds.length > 0 ? (
                  `Will broadcast directly to ${selectedContactIds.length} selected contact${selectedContactIds.length === 1 ? "" : "s"}.`
                ) : (
                  "Select one or more contacts from the list above."
                )
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Scheduling Options Section */}
      {(!isEditing || isEditingScheduled || isSent) && (
        <section className="rounded-lg border bg-background p-5">
          <h2 className="text-base font-semibold">Scheduling</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSent
              ? "This broadcast was already sent."
              : isEditingScheduled
              ? "Modify the scheduled date and time when this broadcast will automatically be sent."
              : "Choose whether to save this as an immediate draft or schedule it for future dispatch."}
          </p>

          <div className="mt-4 flex flex-col gap-3">
            {isSent ? (
              <div className="text-sm text-muted-foreground">
                Sent at:{" "}
                <span className="font-medium text-foreground">
                  {existingBroadcast?.sent_at
                    ? new Date(existingBroadcast.sent_at).toLocaleString()
                    : "Unknown"}
                </span>
              </div>
            ) : (
              <>
                {!isEditing && (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs sm:text-sm max-w-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleMode("now");
                        setScheduleError(null);
                      }}
                      className={cn(
                        "cursor-pointer rounded-md py-1.5 font-medium transition-all",
                        scheduleMode === "now"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Send Now / Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleMode("later");
                        setScheduleError(null);
                      }}
                      className={cn(
                        "cursor-pointer rounded-md py-1.5 font-medium transition-all",
                        scheduleMode === "later"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Schedule for later
                    </button>
                  </div>
                )}

                {(scheduleMode === "later" || isEditingScheduled) && (
                  <div className="flex flex-col gap-1.5 max-w-sm">
                    <Label
                      htmlFor="schedule-popover-trigger"
                      className="text-xs text-muted-foreground"
                    >
                      Date & time
                    </Label>

                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                      <PopoverTrigger
                        id="schedule-popover-trigger"
                        disabled={isReadOnly}
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 text-sm sm:h-10 w-full justify-start gap-2 font-normal"
                          />
                        }
                      >
                        <CalendarIcon className="size-4 text-muted-foreground" />
                        {scheduledDate ? (
                          <span className="truncate">
                            {formatScheduledDisplay(scheduledDate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Pick date & time</span>
                        )}
                      </PopoverTrigger>

                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedScheduleDate}
                          onSelect={(date) => {
                            setSelectedScheduleDate(date);
                            if (scheduleError) setScheduleError(null);
                          }}
                          disabled={{ before: startOfToday() }}
                        />

                        {/* Styled Time Selection Control */}
                        <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5 bg-muted/20">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Clock className="size-3.5" />
                            <span>Time</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {/* Hour Selector */}
                            <Select
                              value={selectedHour}
                              onValueChange={(val) => {
                                if (!val) return;
                                setSelectedHour(val);
                                if (scheduleError) setScheduleError(null);
                              }}
                            >
                              <SelectTrigger className="h-8 w-[62px] text-xs font-medium" aria-label="Hour">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="min-w-[62px]">
                                {Array.from({ length: 12 }, (_, i) => {
                                  const h = String(i + 1).padStart(2, "0");
                                  return (
                                    <SelectItem key={h} value={h}>
                                      {h}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>

                            <span className="text-xs font-semibold text-muted-foreground">:</span>

                            {/* Minute Selector */}
                            <Select
                              value={selectedMinute}
                              onValueChange={(val) => {
                                if (!val) return;
                                setSelectedMinute(val);
                                if (scheduleError) setScheduleError(null);
                              }}
                            >
                              <SelectTrigger className="h-8 w-[62px] text-xs font-medium" aria-label="Minute">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="min-w-[62px]">
                                {[
                                  "00",
                                  "05",
                                  "10",
                                  "15",
                                  "20",
                                  "25",
                                  "30",
                                  "35",
                                  "40",
                                  "45",
                                  "50",
                                  "55",
                                ].map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* AM/PM Toggle */}
                            <div className="flex rounded-md border border-input bg-muted/60 p-0.5 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPeriod("AM");
                                  if (scheduleError) setScheduleError(null);
                                }}
                                className={cn(
                                  "rounded px-2 py-0.5 text-xs font-medium transition-all cursor-pointer",
                                  selectedPeriod === "AM"
                                    ? "bg-background text-foreground shadow-xs font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                AM
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPeriod("PM");
                                  if (scheduleError) setScheduleError(null);
                                }}
                                className={cn(
                                  "rounded px-2 py-0.5 text-xs font-medium transition-all cursor-pointer",
                                  selectedPeriod === "PM"
                                    ? "bg-background text-foreground shadow-xs font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                PM
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Quick action bar in popover */}
                        <div className="flex items-center justify-between border-t px-3 py-2 bg-muted/10 text-xs">
                          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {scheduledDate
                              ? formatScheduledDisplay(scheduledDate)
                              : "Select a date above"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2.5 text-xs"
                            onClick={() => setCalendarOpen(false)}
                          >
                            Done
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {scheduleError && (
                      <p className="text-sm text-destructive">{scheduleError}</p>
                    )}
                    {scheduledDate && !scheduleError && (
                      scheduledDate.getTime() <= new Date().getTime() ? (
                        <p className="text-sm text-destructive">
                          Scheduled time must be in the future.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Will be scheduled for:{" "}
                          <span className="font-medium text-foreground">
                            {formatScheduledDisplay(scheduledDate)}
                          </span>
                        </p>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => router.push("/broadcasts")}
        >
          {isReadOnly ? "Back to Broadcasts" : "Cancel"}
        </Button>
        {!isReadOnly && (
          <Button type="submit" disabled={submitting}>
            {submitting
              ? scheduleMode === "later" && !isEditing
                ? "Scheduling..."
                : "Saving..."
              : isEditing
              ? "Save Changes"
              : scheduleMode === "later"
              ? "Schedule Broadcast"
              : "Save Draft"}
          </Button>
        )}
      </div>
    </form>
  );
}
