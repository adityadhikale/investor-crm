"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface LiveSearchInputProps {
  paramName?: string;
  placeholder?: string;
  className?: string;
}

export function LiveSearchInput({
  paramName = "search",
  placeholder = "Search...",
  className,
}: LiveSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(paramName) ?? "";

  const [value, setValue] = useState(urlValue);
  const lastPushedValue = useRef(urlValue);

  // Sync state if URL changes externally (e.g. back/forward navigation)
  useEffect(() => {
    if (urlValue === lastPushedValue.current) return;
    lastPushedValue.current = urlValue;
    setValue(urlValue);
  }, [urlValue]);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === lastPushedValue.current) return;

    const timeout = window.setTimeout(() => {
      lastPushedValue.current = trimmed;

      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) {
        params.set(paramName, trimmed);
      } else {
        params.delete(paramName);
      }
      params.delete("page");

      const queryString = params.toString();
      const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;

      router.replace(nextUrl, { scroll: false });
    }, value ? 150 : 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [value, pathname, paramName, router, searchParams]);

  function handleClear() {
    setValue("");
    lastPushedValue.current = "";

    const params = new URLSearchParams(searchParams.toString());
    params.delete(paramName);
    params.delete("page");

    const queryString = params.toString();
    const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;

    router.replace(nextUrl, { scroll: false });
  }

  return (
    <div className={cn("relative mt-3 max-w-md", className)}>
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 pr-9"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
