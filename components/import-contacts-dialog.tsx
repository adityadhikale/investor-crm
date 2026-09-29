"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  importContacts,
  parseExcelFile,
  type ImportContactRow,
  type ImportDuplicateRow,
} from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
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
import { Download, FileText, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

type ContactField = keyof ImportContactRow;
type Mapping = Record<number, ContactField | "skip">;
type CsvData = { headers: string[]; rows: string[][] };
type MappedRow = ImportContactRow & { error?: string };

const CONTACT_FIELDS: Array<{ value: ContactField; label: string; required: boolean }> = [
  { value: "name", label: "Name", required: true },
  { value: "phone", label: "Phone", required: true },
  { value: "email", label: "Email", required: true },
  { value: "tag", label: "Tag", required: false },
  { value: "dateSaved", label: "Date Saved", required: false },
  { value: "notes", label: "Notes", required: false },
];

function parseCsv(text: string): CsvData {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      value = "";
      if (row.some((cell) => cell)) rows.push(row);
      row = [];
    } else {
      value += character;
    }
  }

  if (inQuotes) throw new Error("The CSV contains an unfinished quoted value.");
  row.push(value.trim());
  if (row.some((cell) => cell)) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV file does not contain any contact rows.");

  return {
    headers: rows[0].map((header, index) => header || `Column ${index + 1}`),
    rows: rows.slice(1),
  };
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10))
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRow(row: ImportContactRow) {
  if (!row.name || !row.phone || !row.email) return "Name, phone, and email are required.";
  if (!/^\d{7,15}$/.test(row.phone)) return "Phone must contain 7-15 digits.";
  if (!EMAIL_REGEX.test(row.email)) return "Please enter a valid email address.";
  if (row.dateSaved && !isValidDate(row.dateSaved)) return "Date Saved must use YYYY-MM-DD.";
  return null;
}

function getMappedRows(csv: CsvData, mapping: Mapping): MappedRow[] {
  return csv.rows.map((cells) => {
    const row: ImportContactRow = { name: "", phone: "", email: null, tag: "", dateSaved: "", notes: "" };
    Object.entries(mapping).forEach(([index, field]) => {
      if (field !== "skip") {
        const val = cells[Number(index)]?.trim() ?? "";
        if (field === "email") {
          row[field] = val || null;
        } else {
          row[field] = val;
        }
      }
    });
    return { ...row, error: validateRow(row) ?? undefined };
  });
}

export function ImportContactsDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csv, setCsv] = useState<CsvData | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [rowFilter, setRowFilter] = useState<"all" | "invalid">("all");
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    duplicates: number;
    rejected: number;
    duplicateRows: ImportDuplicateRow[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mappedRows = csv ? getMappedRows(csv, mapping) : [];
  const validRows = mappedRows.filter((row) => !row.error);
  const invalidRows = mappedRows.length - validRows.length;
  const visibleRowIndexes = (
    rowFilter === "invalid"
      ? mappedRows.reduce<number[]>((indexes, row, index) => {
          if (row.error) indexes.push(index);
          return indexes;
        }, [])
      : mappedRows.map((_, index) => index)
  ).slice(0, 200);
  const mappedRequiredCount = CONTACT_FIELDS.filter(
    ({ value, required }) => required && Object.values(mapping).includes(value)
  ).length;
  const requiredFieldCount = CONTACT_FIELDS.filter(({ required }) => required).length;
  const canContinue =
    Boolean(csv) &&
    mappedRequiredCount === requiredFieldCount &&
    validRows.length > 0;

  function resetState() {
    setSelectedFile(null);
    setCsv(null);
    setMapping({});
    setError(null);
    setParsing(false);
    setImporting(false);
    setIsDragging(false);
    setWorkspaceOpen(false);
    setRowFilter("all");
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function detectInitialMapping(headers: string[]): Mapping {
    const detected: Mapping = {};
    const usedFields = new Set<ContactField>();

    headers.forEach((rawHeader, index) => {
      const normalized = rawHeader.trim().toLowerCase().replace(/[\s_-]+/g, "");
      let matched: ContactField | null = null;

      if (normalized === "name" || normalized === "fullname" || normalized === "contactname") {
        matched = "name";
      } else if (normalized === "phone" || normalized === "phonenumber" || normalized === "mobile") {
        matched = "phone";
      } else if (normalized === "email" || normalized === "emailaddress") {
        matched = "email";
      } else if (normalized === "tag" || normalized === "tags") {
        matched = "tag";
      } else if (normalized === "datesaved" || normalized === "date" || normalized === "saveddate") {
        matched = "dateSaved";
      } else if (normalized === "notes" || normalized === "note") {
        matched = "notes";
      }

      if (matched && !usedFields.has(matched)) {
        detected[index] = matched;
        usedFields.add(matched);
      }
    });

    return detected;
  }

  async function processFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const isCsv = lowerName.endsWith(".csv");
    const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");

    if (!isCsv && !isExcel) {
      setSelectedFile(null);
      setCsv(null);
      setError("Please select a CSV or Excel (.xlsx, .xls) file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    setCsv(null);
    setMapping({});
    setError(null);
    setParsing(true);
    try {
      const parsedCsv = isCsv
        ? parseCsv(await file.text())
        : await parseExcelOnServer(file);
      setCsv(parsedCsv);
      setMapping(detectInitialMapping(parsedCsv.headers));
      setWorkspaceOpen(true);
      setOpen(false);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "The file could not be read.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setParsing(false);
    }
  }

  async function parseExcelOnServer(file: File): Promise<CsvData> {
    const result = await parseExcelFile(file);
    if ("error" in result) throw new Error(result.error);
    return result;
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await processFile(file);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  }

  function handleMappingChange(columnIndex: number, field: ContactField | "skip") {
    setMapping((current) => {
      const next = { ...current };
      Object.entries(next).forEach(([index, value]) => {
        if (value === field && Number(index) !== columnIndex) next[Number(index)] = "skip";
      });
      next[columnIndex] = field;
      return next;
    });
  }

  function escapeCsvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  function downloadCsv(filenameSuffix: string, headerLine: string, lines: string[]) {
    const blob = new Blob([[headerLine, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const baseName = (selectedFile?.name ?? "contacts").replace(/\.(csv|xlsx|xls)$/i, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}-${filenameSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadInvalidRows() {
    if (!csv || !invalidRows) return;

    const headerLine = ["Row #", ...csv.headers, "Error"].map(escapeCsvCell).join(",");
    const lines = mappedRows.reduce<string[]>((acc, row, index) => {
      if (!row.error) return acc;
      const cells = csv.rows[index] ?? [];
      acc.push(
        [String(index + 1), ...csv.headers.map((_, columnIndex) => cells[columnIndex] ?? ""), row.error]
          .map(escapeCsvCell)
          .join(",")
      );
      return acc;
    }, []);

    downloadCsv("invalid-rows", headerLine, lines);
  }

  function downloadDuplicateRows() {
    if (!importSummary?.duplicateRows.length) return;

    const headerLine = ["Name", "Phone", "Email", "Reason"].map(escapeCsvCell).join(",");
    const lines = importSummary.duplicateRows.map((row) =>
      [row.name, row.phone, row.email ?? "", row.reason].map(escapeCsvCell).join(",")
    );

    downloadCsv("skipped-duplicates", headerLine, lines);
  }

  async function handleImport() {
    if (!canContinue) return;
    setError(null);
    setImporting(true);
    const importResult = await importContacts(JSON.stringify(validRows));
    setImporting(false);
    if ("error" in importResult) {
      toast(importResult.error, "error");
      return;
    }
    setImportSummary(importResult);
    router.refresh();
  }

  function closeWorkspace() {
    resetState();
    setOpen(false);
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && !workspaceOpen) resetState();
        }}
      >
        <SheetTrigger render={<Button variant="outline" className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm" />}>
          Import Contacts
        </SheetTrigger>
        <SheetContent side="right" className="flex flex-col gap-0">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle className="text-xl">Import Contacts</SheetTitle>
            <SheetDescription className="text-sm">Upload a CSV or Excel file to import contacts.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <div className="rounded-md bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Expected columns</p>
              <p className="mt-2">Name</p><p>Phone</p><p>Email</p><p>Tag</p><p>Date Saved (Optional)</p><p>Notes (Optional)</p>
            </div>
            <div className="space-y-2">
              <input ref={fileInputRef} id="contacts-csv" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="sr-only" />
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (isDragging) return;
                  fileInputRef.current?.click();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isDragging && "border-primary bg-primary/5"
                )}
              >
                {!selectedFile ? (
                  <>
                    <Upload className="size-8 text-muted-foreground" />
                    <span className="mt-4 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">Choose a file</span>
                    <span className="mt-2 text-sm text-muted-foreground">or drag and drop your file here</span>
                    <span className="mt-1 text-xs text-muted-foreground">CSV or Excel (.xlsx, .xls) files</span>
                  </>
                ) : (
                  <>
                    <FileText className="size-8 text-muted-foreground" />
                    <span className="mt-3 text-xs text-muted-foreground">Selected file</span>
                    <span className="mt-1 max-w-full truncate text-sm font-medium">{selectedFile.name}</span>
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click(); }}>Change file</Button>
                  </>
                )}
              </div>
              {parsing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading file...</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <SheetFooter className="border-t bg-muted/20 px-6 py-4 sm:flex-row sm:justify-end">
            <SheetClose render={<Button variant="outline" type="button" onClick={resetState} />}>Cancel</SheetClose>
            <Button type="button" disabled>Continue</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {workspaceOpen && csv && (
        <div className="fixed inset-0 z-[60] flex min-h-screen flex-col overflow-hidden bg-background">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-8 py-5">
            <div>
              <h1 className="text-2xl font-semibold">Import Contacts</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {importSummary ? "Import complete." : "Review your CSV and map columns before importing."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {importSummary ? (
                <>
                  {importSummary.duplicateRows.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={downloadDuplicateRows}>
                      <Download className="size-3.5" />
                      Download Skipped Duplicates
                    </Button>
                  )}
                  <Button onClick={closeWorkspace}>Done</Button>
                </>
              ) : (
                <>
                  {invalidRows > 0 && (
                    <>
                      <div className="flex items-center rounded-md border p-0.5">
                        <button
                          type="button"
                          onClick={() => setRowFilter("all")}
                          className={cn(
                            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                            rowFilter === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          All rows
                        </button>
                        <button
                          type="button"
                          onClick={() => setRowFilter("invalid")}
                          className={cn(
                            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                            rowFilter === "invalid" ? "bg-destructive text-white" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Invalid ({invalidRows})
                        </button>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={downloadInvalidRows}>
                        <Download className="size-3.5" />
                        Download Invalid Rows
                      </Button>
                    </>
                  )}
                  <Button variant="outline" onClick={closeWorkspace} disabled={importing}>Cancel</Button>
                  <Button onClick={handleImport} disabled={!canContinue || importing}>{importing ? "Importing..." : `Continue (${mappedRequiredCount}/${requiredFieldCount})`}</Button>
                </>
              )}
            </div>
          </header>
          {importSummary ? (
            <main className="min-h-0 flex-1 overflow-auto px-8 py-6">
              <div className="max-w-xl space-y-4">
                <div className="flex gap-2 text-center text-xs">
                  <div className="rounded-md bg-muted/40 px-4 py-3 flex-1"><p className="text-lg font-semibold">{importSummary.imported}</p><p className="text-muted-foreground">Imported</p></div>
                  <div className="rounded-md bg-muted/40 px-4 py-3 flex-1"><p className="text-lg font-semibold">{importSummary.duplicates}</p><p className="text-muted-foreground">Skipped (duplicate)</p></div>
                  <div className="rounded-md bg-muted/40 px-4 py-3 flex-1"><p className="text-lg font-semibold">{importSummary.rejected}</p><p className="text-muted-foreground">Invalid</p></div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {importSummary.imported} new contact{importSummary.imported === 1 ? "" : "s"} imported successfully.
                  {importSummary.duplicates > 0 && (
                    <>
                      {" "}{importSummary.duplicates} row{importSummary.duplicates === 1 ? "" : "s"} were skipped because that phone number already exists in the CRM or repeats elsewhere in this file — download the list below to review them.
                    </>
                  )}
                  {importSummary.rejected > 0 && (
                    <>{" "}{importSummary.rejected} row{importSummary.rejected === 1 ? "" : "s"} were invalid and not submitted.</>
                  )}
                </p>
              </div>
            </main>
          ) : (
            <>
              <main className="min-h-0 flex-1 overflow-auto px-8 py-6">
                <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="font-medium">{selectedFile?.name}</p><p className="text-sm text-muted-foreground">Choose a destination for each CSV column.</p></div>
                      <div className="flex gap-2 text-center text-xs">
                        <div className="rounded-md bg-muted/40 px-4 py-2"><p className="font-medium">{csv.rows.length}</p><p className="text-muted-foreground">Total rows</p></div>
                        <div className="rounded-md bg-muted/40 px-4 py-2"><p className="font-medium">{validRows.length}</p><p className="text-muted-foreground">Valid rows</p></div>
                        <div className="rounded-md bg-muted/40 px-4 py-2"><p className="font-medium">{invalidRows}</p><p className="text-muted-foreground">Invalid rows</p></div>
                      </div>
                    </div>
                    {invalidRows > 0 && (
                      <p className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {invalidRows} row{invalidRows === 1 ? "" : "s"} need attention before importing. Use the{" "}
                        <span className="font-medium">Invalid ({invalidRows})</span> toggle above to review them, or download them to fix and re-import.
                      </p>
                    )}
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="min-w-max border-collapse text-sm">
                        <thead className="sticky top-0 z-10 bg-muted/95 text-left"><tr className="border-b">
                          <th className="min-w-16 border-r px-4 py-3 align-top text-xs font-medium text-muted-foreground">Row #</th>
                          {csv.headers.map((header, columnIndex) => (
                            <th key={`${header}-${columnIndex}`} className="min-w-52 border-r px-4 py-3 align-top last:border-r-0">
                              <label className="block text-xs font-medium text-muted-foreground">{header}</label>
                              <select value={mapping[columnIndex] ?? "skip"} onChange={(event) => handleMappingChange(columnIndex, event.target.value as ContactField | "skip")} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                                <option value="skip">Skip</option>
                                {CONTACT_FIELDS.map((field) => {
                                  const usedByOtherColumn = Object.entries(mapping).some(([index, value]) => Number(index) !== columnIndex && value === field.value);
                                  return <option key={field.value} value={field.value} disabled={usedByOtherColumn}>{field.label}{field.required ? " *" : ""}</option>;
                                })}
                              </select>
                            </th>
                          ))}
                          <th className="min-w-64 px-4 py-3 align-top">Validation</th>
                        </tr></thead>
                        <tbody>
                          {visibleRowIndexes.map((rowIndex) => {
                            const cells = csv.rows[rowIndex];
                            const row = mappedRows[rowIndex];
                            return <tr key={rowIndex} className={`border-b last:border-b-0 ${row?.error ? "bg-destructive/5" : ""}`}>
                              <td className="border-r px-4 py-3 align-top text-muted-foreground">{rowIndex + 1}</td>
                              {csv.headers.map((header, columnIndex) => <td key={`${header}-${columnIndex}`} title={cells[columnIndex] ?? ""} className="max-w-72 border-r px-4 py-3 align-top last:border-r-0"><span className="block max-w-72 truncate">{cells[columnIndex] || "—"}</span></td>)}
                              <td className="max-w-80 px-4 py-3 align-top"><span className={row?.error ? "text-destructive" : "text-muted-foreground"}>{row?.error ?? "Ready"}</span></td>
                            </tr>;
                          })}
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      const totalInView = rowFilter === "invalid" ? invalidRows : csv.rows.length;
                      if (totalInView <= visibleRowIndexes.length) return null;
                      return (
                        <p className="text-sm text-muted-foreground">
                          Showing the first {visibleRowIndexes.length} of {totalInView}{" "}
                          {rowFilter === "invalid" ? "invalid rows" : "rows"}. All {csv.rows.length} rows will be validated and considered for import.
                        </p>
                      );
                    })()}
                </div>
              </main>
              <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/20 px-8 py-4"><Button variant="outline" onClick={closeWorkspace} disabled={importing}>Cancel</Button><Button onClick={handleImport} disabled={!canContinue || importing}>{importing ? "Importing..." : `Continue (${mappedRequiredCount}/${requiredFieldCount})`}</Button></footer>
            </>
          )}
        </div>
      )}
    </>
  );
}
