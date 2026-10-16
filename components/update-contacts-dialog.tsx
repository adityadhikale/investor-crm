"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RefreshCw, Upload } from "lucide-react";

import { parseExcelFile } from "@/app/contacts/actions";
import {
  applyContactUpdate,
  previewContactUpdate,
  type ContactUpdatePreview,
  type ContactUpdateRow,
  type TagUpdateMode,
} from "@/app/contacts/bulk-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/toast-provider";
import { parseCsv, type CsvData } from "@/lib/parse-csv";
import { suggestTag, matchTag, splitTagCell } from "@/lib/tag-match";
import { TAG_OPTIONS } from "@/lib/tags";

type Field = keyof ContactUpdateRow;
type Mapping = Record<number, Field | "skip">;

const FIELDS: Array<{ value: Field; label: string }> = [
  { value: "phone", label: "Phone (finds the contact) *" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "tag", label: "Tag" },
  { value: "notes", label: "Notes" },
  { value: "dateSaved", label: "Date saved" },
];

const ALIASES: Record<string, Field> = {
  phone: "phone", phonenumber: "phone", phoneno: "phone", mobile: "phone", mobilenumber: "phone", mobileno: "phone", mobilephone: "phone", contactnumber: "phone", contactno: "phone", cell: "phone", cellphone: "phone", whatsapp: "phone", whatsappnumber: "phone",
  name: "name", fullname: "name", contactname: "name",
  email: "email", emailaddress: "email",
  company: "company", companyname: "company", organisation: "company", organization: "company",
  tag: "tag", tags: "tag",
  notes: "notes", note: "notes",
  datesaved: "dateSaved", saveddate: "dateSaved", date: "dateSaved",
};

function detectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<Field>();
  headers.forEach((header, index) => {
    const field = ALIASES[header.trim().toLowerCase().replace(/[\s_-]+/g, "")];
    if (field && !used.has(field)) {
      mapping[index] = field;
      used.add(field);
    }
  });
  return mapping;
}

/**
 * Updates existing contacts from a CSV or Excel file. Contacts are found by
 * phone number. Only the columns you map are changed, and empty cells never
 * erase what is already saved. A preview shows exactly what would change
 * before anything is saved.
 */
export function UpdateContactsDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<CsvData | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [tagMode, setTagMode] = useState<TagUpdateMode>("add");
  // What the user chose for tag text in the file that isn't an exact CRM tag: a CRM tag, or "skip".
  const [tagChoices, setTagChoices] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContactUpdatePreview | null>(null);
  const [result, setResult] = useState<{ updated: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setCsv(null);
    setFileName("");
    setMapping({});
    setTagMode("add");
    setTagChoices({});
    setError(null);
    setPreview(null);
    setResult(null);
    setReading(false);
    setChecking(false);
    setApplying(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      setError("Please choose a CSV or Excel (.xlsx, .xls) file.");
      return;
    }
    setError(null);
    setPreview(null);
    setReading(true);
    try {
      let data: CsvData;
      if (lower.endsWith(".csv")) {
        data = parseCsv(await file.text());
      } else {
        const parsed = await parseExcelFile(file);
        if ("error" in parsed) throw new Error(parsed.error);
        data = parsed;
      }
      setCsv(data);
      setFileName(file.name);
      setTagChoices({});
      setMapping(detectMapping(data.headers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be read.");
      setCsv(null);
    } finally {
      setReading(false);
    }
  }

  function changeMapping(column: number, field: Field | "skip") {
    setPreview(null);
    setMapping((current) => {
      const next = { ...current };
      for (const [index, value] of Object.entries(next)) {
        if (field !== "skip" && value === field && Number(index) !== column) next[Number(index)] = "skip";
      }
      next[column] = field;
      return next;
    });
  }

  const phoneMapped = Object.values(mapping).includes("phone");
  const otherMapped = Object.values(mapping).some((value) => value !== "skip" && value !== "phone");

  // Every different piece of tag text in the file, with how many rows use it.
  const tagColumn = Object.entries(mapping).find(([, field]) => field === "tag")?.[0];
  const tagValues = useMemo(() => {
    if (!csv || tagColumn === undefined) return [];
    const counts = new Map<string, number>();
    for (const cells of csv.rows) {
      for (const part of splitTagCell(cells[Number(tagColumn)] ?? "")) {
        counts.set(part, (counts.get(part) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([value, rows]) => ({ value, rows, match: matchTag(value), suggestion: suggestTag(value) }))
      .sort((a, b) => b.rows - a.rows);
  }, [csv, tagColumn]);

  /** The CRM tag (or "skip") that applies to a piece of tag text, or undefined if the user still has to choose. */
  function choiceFor(value: string): string | undefined {
    const matched = matchTag(value);
    if (matched) return matched;
    return tagChoices[value];
  }
  const unresolvedTags = tagValues.filter((item) => !choiceFor(item.value));

  function buildRows(): ContactUpdateRow[] {
    if (!csv) return [];
    return csv.rows.map((cells) => {
      const row: ContactUpdateRow = { phone: "" };
      for (const [index, field] of Object.entries(mapping)) {
        if (field === "skip") continue;
        const value = cells[Number(index)]?.trim() ?? "";
        if (field === "tag") {
          // Send the CRM's own tag names, using the choices made above.
          row.tag = splitTagCell(value)
            .map((part) => choiceFor(part))
            .filter((tag): tag is string => Boolean(tag) && tag !== "skip")
            .join(";");
        } else {
          row[field] = value;
        }
      }
      return row;
    });
  }

  function downloadSkipped(kind: string, lines: string[][]) {
    const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const text = [["Row #", "Phone", "Reason"], ...lines].map((line) => line.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.(csv|xlsx|xls)$/i, "") || "update"}-skipped-${kind}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleCheck() {
    setError(null);
    setChecking(true);
    const response = await previewContactUpdate(buildRows(), tagMode);
    setChecking(false);
    if ("error" in response) {
      setError(response.error);
      return;
    }
    setPreview(response.preview);
  }

  async function handleApply() {
    setError(null);
    setApplying(true);
    const response = await applyContactUpdate(buildRows(), tagMode);
    setApplying(false);
    if ("error" in response) {
      setError(response.error);
      return;
    }
    setResult({ updated: response.updated });
    toast(`${response.updated} contact${response.updated === 1 ? "" : "s"} updated`);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <RefreshCw className="size-4" />
        Update from file
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Update contacts from a file</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with a phone number column and the columns you want to change. Contacts
            are found by phone number. Only the columns you map here are updated; every other detail stays as
            it is, and empty cells never erase existing data.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">
              Done: {result.updated} contact{result.updated === 1 ? "" : "s"} updated.
            </p>
            {preview && (
              <p className="mt-1 text-muted-foreground">
                {preview.unchanged} already matched the file, {preview.notFound} phone numbers weren&apos;t found
                in the CRM, {preview.invalid} rows were skipped as invalid.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                id="update-contacts-file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={reading}>
                {reading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {csv ? "Choose a different file" : "Choose a CSV or Excel file"}
              </Button>
              {fileName && (
                <span className="ml-3 text-sm text-muted-foreground">
                  {fileName} · {csv?.rows.length ?? 0} rows
                </span>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Up to 5 MB. The first row must be the column titles.</p>
            </div>

            {csv && (
              <>
                <div>
                  <p className="text-sm font-medium">What is in each column?</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {csv.headers.map((header, index) => (
                      <div key={`${header}-${index}`} className="flex items-center gap-2 rounded-md border p-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{header}</p>
                          <p className="truncate text-xs text-muted-foreground">e.g. {csv.rows[0]?.[index] || "(empty)"}</p>
                        </div>
                        <Select
                          value={mapping[index] ?? "skip"}
                          onValueChange={(value) => {
                            if (value) changeMapping(index, value as Field | "skip");
                          }}
                        >
                          <SelectTrigger className="h-9 w-44" aria-label={`What is column ${header}?`}>
                            <SelectValue>
                              {(value: string) => FIELDS.find((f) => f.value === value)?.label ?? "Don't use"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Don&apos;t use</SelectItem>
                            {FIELDS.map((field) => (
                              <SelectItem key={field.value} value={field.value}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                {Object.values(mapping).includes("tag") && (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">When a row has a tag</p>
                    <label className="mt-2 flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="tag-mode"
                        checked={tagMode === "add"}
                        onChange={() => {
                          setTagMode("add");
                          setPreview(null);
                        }}
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="font-medium">Add it</span> to the contact&apos;s existing tags
                      </span>
                    </label>
                    <label className="mt-1.5 flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="tag-mode"
                        checked={tagMode === "replace"}
                        onChange={() => {
                          setTagMode("replace");
                          setPreview(null);
                        }}
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="font-medium">Replace</span> all of the contact&apos;s tags with it
                      </span>
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      The tag must be one of the CRM&apos;s tags. Put several in one cell separated by ; or |.
                    </p>
                  </div>
                )}

                {tagValues.length > 0 && (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">Tags in your file</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      These are the different tag texts found. Ones that match a CRM tag are linked automatically.
                      Check the rest and choose the right CRM tag, or skip them (the tag is then left unchanged).
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {tagValues.map((item) => {
                        const chosen = choiceFor(item.value);
                        return (
                          <div key={item.value} className="flex flex-wrap items-center gap-2 rounded border p-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">&quot;{item.value}&quot;</p>
                              <p className="text-xs text-muted-foreground">
                                {item.rows} row{item.rows === 1 ? "" : "s"}
                                {item.match
                                  ? " · matched automatically"
                                  : chosen
                                  ? ""
                                  : item.suggestion
                                  ? " · looks close to a CRM tag, please confirm"
                                  : " · not a CRM tag, please choose"}
                              </p>
                            </div>
                            {item.match ? (
                              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{item.match}</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                {!chosen && item.suggestion && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setPreview(null);
                                      setTagChoices((current) => ({ ...current, [item.value]: item.suggestion!.tag }));
                                    }}
                                  >
                                    Use {item.suggestion.tag}
                                  </Button>
                                )}
                                <Select
                                  value={chosen ?? ""}
                                  onValueChange={(value) => {
                                    setPreview(null);
                                    setTagChoices((current) => ({ ...current, [item.value]: value ?? "" }));
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-48" aria-label={`CRM tag for ${item.value}`}>
                                    <SelectValue placeholder="Choose a tag…">
                                      {(value: string) => (value === "skip" ? "Skip (leave tag unchanged)" : value || "Choose a tag…")}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="skip">Skip (leave tag unchanged)</SelectItem>
                                    {TAG_OPTIONS.map((tag) => (
                                      <SelectItem key={tag} value={tag}>
                                        {tag}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {unresolvedTags.length > 0 && (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        Choose a tag for {unresolvedTags.length} more value{unresolvedTags.length === 1 ? "" : "s"} to continue.
                      </p>
                    )}
                  </div>
                )}

                {!phoneMapped && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Choose which column holds the phone number. That is how contacts are found.
                  </p>
                )}
                {phoneMapped && !otherMapped && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Choose at least one column to update, such as Company or Tag.
                  </p>
                )}
              </>
            )}

            {preview && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
                <p className="font-medium">
                  {preview.willChange} of {preview.totalRows} rows will change a contact.
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>{preview.willChange} contacts will be updated</li>
                  <li>{preview.unchanged} already match the file (no change)</li>
                  <li>{preview.notFound} phone numbers aren&apos;t in the CRM (skipped)</li>
                  <li>{preview.invalid} rows are invalid (skipped)</li>
                  {preview.duplicatesInFile > 0 && <li>{preview.duplicatesInFile} phone numbers appear more than once in the file</li>}
                </ul>
                {Object.keys(preview.fieldCounts).length > 0 && (
                  <p className="text-muted-foreground">
                    Changes by field:{" "}
                    {Object.entries(preview.fieldCounts)
                      .map(([field, count]) => `${field} ${count}`)
                      .join(" · ")}
                  </p>
                )}
                {preview.samples.length > 0 && (
                  <div>
                    <p className="font-medium">Examples</p>
                    <ul className="mt-1 space-y-1.5">
                      {preview.samples.map((sample, index) => (
                        <li key={index} className="rounded border bg-background p-2">
                          <span className="font-medium">{sample.name}</span>{" "}
                          <span className="text-muted-foreground">({sample.phone})</span>
                          {sample.changes.map((change, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              {change}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(preview.invalidRows.length > 0 || preview.notFoundRows.length > 0) && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                    <p className="font-medium">
                      {preview.invalid + preview.notFound} row{preview.invalid + preview.notFound === 1 ? "" : "s"} will be skipped
                    </p>
                    <p className="mt-0.5 text-xs">
                      They won&apos;t change anything. Download the list, fix those rows in your file, and upload it again.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {preview.invalidRows.length > 0 && (
                        <Button type="button" size="sm" variant="outline" onClick={() => downloadSkipped("invalid", preview.invalidRows.map((r) => [String(r.row), r.phone, r.reason]))}>
                          <Download className="size-3.5" /> Invalid rows ({preview.invalid})
                        </Button>
                      )}
                      {preview.notFoundRows.length > 0 && (
                        <Button type="button" size="sm" variant="outline" onClick={() => downloadSkipped("not-in-crm", preview.notFoundRows.map((r) => [String(r.row), r.phone, "Phone number not found in the CRM"]))}>
                          <Download className="size-3.5" /> Not in CRM ({preview.notFound})
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {preview.invalidSamples.length > 0 && (
                  <div>
                    <p className="font-medium">Invalid rows (first {preview.invalidSamples.length})</p>
                    <ul className="mt-1 text-xs text-muted-foreground">
                      {preview.invalidSamples.map((item, index) => (
                        <li key={index}>
                          Row {item.row}: {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {preview.notFoundSamples.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Not found, for example: {preview.notFoundSamples.join(", ")}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{result ? "Close" : "Cancel"}</DialogClose>
          {!result && csv && phoneMapped && otherMapped && !preview && (
            <Button type="button" onClick={handleCheck} disabled={checking || unresolvedTags.length > 0}>
              {checking ? "Checking…" : "Check what will change"}
            </Button>
          )}
          {!result && preview && (
            <Button type="button" onClick={handleApply} disabled={applying || preview.willChange === 0}>
              {applying ? "Updating…" : `Update ${preview.willChange} contact${preview.willChange === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
