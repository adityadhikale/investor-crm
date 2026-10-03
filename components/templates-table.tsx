"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteTemplate,
  type TemplateData,
} from "@/app/templates/actions";
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
import { CheckCircle2, Clock } from "lucide-react";

export interface TemplatesTableProps {
  templates: TemplateData[];
}

export function TemplatesTable({ templates }: TemplatesTableProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [templateToDelete, setTemplateToDelete] = useState<TemplateData | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!templateToDelete) return;
    setDeleting(true);
    const result = await deleteTemplate(templateToDelete.id);
    setDeleting(false);

    if (result.error) {
      toast(result.error, "error");
      setTemplateToDelete(null);
      return;
    }

    setTemplateToDelete(null);
    toast("Template deleted successfully");
    router.refresh();
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <div className="min-w-2xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b bg-background text-left text-muted-foreground">
                <th className="w-[28%] px-5 py-2.5 sm:py-3 font-medium">Name</th>
                <th className="w-[16%] px-5 py-2.5 sm:py-3 font-medium">Category</th>
                <th className="w-[30%] px-5 py-2.5 sm:py-3 font-medium">Body Preview</th>
                <th className="w-[14%] px-5 py-2.5 sm:py-3 font-medium">Status</th>
                <th className="w-[12%] px-5 py-2.5 sm:py-3 font-medium">Created</th>
                <th className="w-12 px-3 py-2.5 sm:py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.length ? (
                templates.map((template) => {
                  const isApproved = Boolean(template.approved_at);
                  return (
                    <tr
                      key={template.id}
                      onClick={() => router.push(`/templates/${template.id}`)}
                      className="border-b last:border-b-0 hover:bg-muted/20 cursor-pointer"
                    >
                      {/* Name */}
                      <td className="px-5 py-2.5 sm:py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs sm:text-sm font-medium text-foreground">
                            {template.name}
                          </span>
                          {template.meta_template_id && (
                            <span className="text-[11px] text-muted-foreground">
                              Meta ID: {template.meta_template_id}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-2.5 sm:py-4">
                        <span className="inline-flex items-center rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                          {template.category || "—"}
                        </span>
                      </td>

                      {/* Body Preview */}
                      <td className="px-5 py-2.5 sm:py-4">
                        <p className="line-clamp-2 max-w-md text-xs sm:text-sm text-muted-foreground">
                          {template.body_text}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-2.5 sm:py-4">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            <Clock className="size-3" />
                            {template.meta_template_id ? "Not approved by Meta" : "Draft"}
                          </span>
                        )}
                      </td>

                      {/* Date Created */}
                      <td className="whitespace-nowrap px-5 py-2.5 sm:py-4 text-xs sm:text-sm text-muted-foreground">
                        {new Date(template.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-3 py-2 text-right"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuIconTrigger
                            label={`Actions for template ${template.name}`}
                          />
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() => router.push(`/templates/${template.id}`)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setTemplateToDelete(template)}
                              className="text-destructive focus:text-destructive"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No templates yet. Click &quot;+ New Template&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(templateToDelete)}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete template &quot;{templateToDelete?.name}&quot;?
              This action can be undone by an administrator.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose
              render={
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              }
            />
            <Button
              variant="destructive"
              type="button"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
