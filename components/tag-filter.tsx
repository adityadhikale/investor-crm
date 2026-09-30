"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TAG_OPTIONS } from "@/components/add-contact-dialog";
import { cn } from "@/lib/utils";

export interface TagFilterProps {
  tagOptions?: string[];
  className?: string;
}

export function TagFilter({
  tagOptions = TAG_OPTIONS,
  className,
}: TagFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tagsParam = searchParams.get("tags") ?? "";
  const selectedTags = tagsParam
    ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  function updateUrl(newTags: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (newTags.length > 0) {
      params.set("tags", newTags.join(","));
    } else {
      params.delete("tags");
    }
    params.delete("page");

    const queryString = params.toString();
    const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  function handleToggleTag(tag: string) {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];

    updateUrl(next);
  }

  function handleClear() {
    updateUrl([]);
  }

  const buttonLabel =
    selectedTags.length === 0
      ? "Filter by tag"
      : selectedTags.length === 1
      ? selectedTags[0]
      : `${selectedTags.length} tags`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-10 justify-between gap-2 px-3 text-sm font-normal",
              selectedTags.length > 0 && "border-primary/50 bg-primary/5 font-medium",
              className
            )}
          />
        }
      >
        <div className="flex items-center gap-2">
          <Tag className="size-3.5 text-muted-foreground" />
          <span className={cn(selectedTags.length === 0 && "text-muted-foreground")}>
            {buttonLabel}
          </span>
        </div>
        <ChevronDown className="size-3.5 text-muted-foreground opacity-60" />
      </PopoverTrigger>

      <PopoverContent className="w-52 p-2" align="start">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between border-b pb-1.5 px-2">
            <span className="text-xs font-medium text-muted-foreground">
              Filter by Tag
            </span>
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-col gap-0.5 pt-1">
            {tagOptions.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <label
                  key={tag}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 select-none transition-colors"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleToggleTag(tag)}
                  />
                  <span className="text-sm">{tag}</span>
                </label>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
