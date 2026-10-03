"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/toast-provider";
import {
  createTemplate,
  updateTemplate,
  type TemplateCategory,
  type TemplateData,
} from "@/app/templates/actions";
import { FileText, Variable, CheckCircle2, Clock } from "lucide-react";

export interface TemplateEditorProps {
  mode: "create" | "edit";
  existingTemplate?: TemplateData | null;
}

const CATEGORIES: { label: string; value: TemplateCategory; description: string }[] = [
  {
    label: "Marketing",
    value: "MARKETING",
    description: "Promotional messages, announcements, offers, and welcome updates.",
  },
  {
    label: "Utility",
    value: "UTILITY",
    description: "Account updates, order status, meeting reminders, or recurring alerts.",
  },
  {
    label: "Authentication",
    value: "AUTHENTICATION",
    description: "One-time passcodes and login verification codes.",
  },
];

/**
 * Extracts all unique placeholder indices {{N}} from text, returned as ordered string numbers ["1", "2", ...].
 */
export function extractPlaceholders(text: string): string[] {
  const matches = text.matchAll(/\{\{(\d+)\}\}/g);
  const found = new Set<string>();
  for (const match of matches) {
    if (match[1]) {
      found.add(match[1]);
    }
  }
  // Sort numerically: 1, 2, 3...
  return Array.from(found).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/**
 * Validates whether placeholders in text are sequentially numbered starting from 1 with no gaps.
 */
export function validatePlaceholdersSequential(placeholders: string[]): string | null {
  if (placeholders.length === 0) return null;

  for (let i = 0; i < placeholders.length; i++) {
    const expected = String(i + 1);
    if (placeholders[i] !== expected) {
      return `Placeholders must be sequential starting at {{1}} without gaps. Found {{${placeholders[i]}}} instead of {{${expected}}}.`;
    }
  }
  return null;
}

export function TemplateEditor({ mode, existingTemplate }: TemplateEditorProps) {
  const router = useRouter();
  const { toast } = useToast();

  const isEditing = mode === "edit" && Boolean(existingTemplate);
  const isApproved = Boolean(existingTemplate?.approved_at);
  // Templates synced from Meta are view-only: Meta sends exactly what it approved.
  const isFromMeta = Boolean(existingTemplate?.meta_template_id);

  const [name, setName] = useState(() => existingTemplate?.name ?? "");
  const [category, setCategory] = useState<TemplateCategory>(() => {
    const cat = existingTemplate?.category as TemplateCategory;
    return cat === "MARKETING" || cat === "UTILITY" || cat === "AUTHENTICATION"
      ? cat
      : "MARKETING";
  });
  const [bodyText, setBodyText] = useState(() => existingTemplate?.body_text ?? "");
  const [variables, setVariables] = useState<Record<string, string>>(() => {
    return existingTemplate?.variables && typeof existingTemplate.variables === "object"
      ? { ...existingTemplate.variables }
      : {};
  });

  const [nameError, setNameError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dynamically compute detected placeholders from bodyText
  const detectedPlaceholders = useMemo(() => {
    return extractPlaceholders(bodyText);
  }, [bodyText]);

  // Handle updating variable sample values
  function handleVariableChange(key: string, value: string) {
    setVariables((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setBodyError(null);
    setFormError(null);

    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName) {
      setNameError("Template name is required.");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(trimmedName)) {
      setNameError(
        "Template name must contain only lowercase letters, numbers, and underscores (e.g. investor_update_q3)."
      );
      return;
    }

    const trimmedBody = bodyText.trim();
    if (!trimmedBody) {
      setBodyError("Body text is required.");
      return;
    }

    // Validate sequential placeholders
    const placeholderSeqError = validatePlaceholdersSequential(detectedPlaceholders);
    if (placeholderSeqError) {
      setBodyError(placeholderSeqError);
      return;
    }

    // Check for malformed braces like {{{1}}} or {{abc}}
    if (/\{\{[^0-9}]+\}\}/.test(trimmedBody)) {
      setBodyError("Variables must be numeric placeholders like {{1}}, {{2}}.");
      return;
    }

    // Keep only variables that correspond to currently detected placeholders
    const cleanedVariables: Record<string, string> = {};
    for (const ph of detectedPlaceholders) {
      cleanedVariables[ph] = (variables[ph] ?? "").trim();
    }

    setSubmitting(true);
    let result: { success?: boolean; error?: string; id?: string };

    if (isEditing && existingTemplate) {
      result = await updateTemplate(existingTemplate.id, {
        name: trimmedName,
        category,
        body_text: trimmedBody,
        variables: cleanedVariables,
      });
    } else {
      result = await createTemplate({
        name: trimmedName,
        category,
        body_text: trimmedBody,
        variables: cleanedVariables,
      });
    }

    setSubmitting(false);

    if (result.error) {
      setFormError(result.error);
      toast(result.error, "error");
      return;
    }

    toast(isEditing ? "Template updated successfully" : "Template created successfully");
    router.push("/templates");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Template Details Card */}
      <section className="rounded-lg border bg-background p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Template Information</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Define the unique name and category for this WhatsApp template.
            </p>
          </div>
          {isEditing && (
            <div>
              {isApproved ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  <Clock className="size-3" />
                  {isFromMeta ? "Not approved by Meta" : "Draft"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Template Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-name"
              placeholder="e.g. quarterly_investor_update"
              value={name}
              disabled={isFromMeta}
              onChange={(e) => {
                setName(e.target.value.toLowerCase());
                if (nameError) setNameError(null);
              }}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Lowercase letters, numbers, and underscores only.
            </p>
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-category">
              Category <span className="text-destructive">*</span>
            </Label>
            <Select
              value={category}
              disabled={isFromMeta}
              onValueChange={(val) => {
                if (val) setCategory(val as TemplateCategory);
              }}
            >
              <SelectTrigger id="template-category" className="h-9 w-full text-sm">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label} ({c.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {CATEGORIES.find((c) => c.value === category)?.description}
            </p>
          </div>
        </div>
      </section>

      {/* Body Text Card */}
      <section className="rounded-lg border bg-background p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Message Body</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Compose the template text. Use numeric tags like{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                {"{{1}}"}
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                {"{{2}}"}
              </code>{" "}
              for dynamic variables.
            </p>
          </div>
          <FileText className="size-4 text-muted-foreground" />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="template-body">
            Body Text <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="template-body"
            placeholder="Dear {{1}}, here is our quarterly update regarding {{2}}..."
            value={bodyText}
            disabled={isFromMeta}
            onChange={(e) => {
              setBodyText(e.target.value);
              if (bodyError) setBodyError(null);
            }}
            rows={6}
            className="resize-y font-sans text-sm leading-relaxed"
          />
          {bodyError && <p className="text-xs text-destructive">{bodyError}</p>}
        </div>
      </section>

      {/* Variables Card */}
      <section className="rounded-lg border bg-background p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Variable className="size-4 text-muted-foreground" />
              Variables & Sample Values
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sample values for placeholders detected in your message body.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {detectedPlaceholders.length} variable
            {detectedPlaceholders.length === 1 ? "" : "s"} detected
          </span>
        </div>

        <div className="mt-4">
          {detectedPlaceholders.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[100px_1fr] gap-3 px-1 text-xs font-medium text-muted-foreground">
                <span>Variable</span>
                <span>Sample Value (e.g. for preview)</span>
              </div>
              <div className="space-y-2">
                {detectedPlaceholders.map((ph) => (
                  <div
                    key={ph}
                    className="grid grid-cols-[100px_1fr] items-center gap-3 rounded-md border bg-muted/20 p-2 text-sm"
                  >
                    <div className="flex items-center">
                      <span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        {`{{${ph}}}`}
                      </span>
                    </div>
                    <div>
                      <Input
                        placeholder={`Sample text for {{${ph}}}`}
                        value={variables[ph] ?? ""}
                        disabled={isFromMeta}
                        onChange={(e) => handleVariableChange(ph, e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              No variable placeholders detected in body text. To add one, type{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {"{{1}}"}
              </code>{" "}
              into the message body above.
            </div>
          )}
        </div>
      </section>

      {formError && (
        <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formError}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => router.push("/templates")}
        >
          {isFromMeta ? "Back" : "Cancel"}
        </Button>
        {!isFromMeta && (
          <Button type="submit" disabled={submitting}>
            {submitting
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
              ? "Save Changes"
              : "Create Template"}
          </Button>
        )}
      </div>
    </form>
  );
}
