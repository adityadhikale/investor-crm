"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/toast-provider";
import { downloadContactsExport } from "@/lib/export-contacts-client";

export type ExportOption = {
  /** Shown in the menu, e.g. "Current results (120) · Excel". */
  label: string;
  format: "csv" | "xlsx";
  /** Contacts to export; leave out for every contact. */
  ids?: string[];
  fileLabel?: "selected" | "filtered";
};

/** A button that opens a menu of export choices and downloads the chosen one. */
export function ExportContactsMenu({
  options,
  buttonLabel = "Export",
  size = "default",
}: {
  options: ExportOption[];
  buttonLabel?: string;
  size?: "default" | "sm";
}) {
  const { toast } = useToast();
  const [working, setWorking] = useState(false);

  async function run(option: ExportOption) {
    if (working) return;
    setWorking(true);
    const result = await downloadContactsExport({ ids: option.ids, format: option.format, label: option.fileLabel });
    setWorking(false);
    if ("error" in result) {
      toast(result.error, "error");
      return;
    }
    toast(`Exported ${result.count.toLocaleString("en-IN")} contact${result.count === 1 ? "" : "s"}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size={size} disabled={working} />}>
        {working ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {working ? "Preparing…" : buttonLabel}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((option) => (
          <DropdownMenuItem key={option.label} onClick={() => void run(option)}>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
