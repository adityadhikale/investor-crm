"use client";

import { useEffect, useState } from "react";

import { MESSAGES_CHANGED_EVENT } from "@/lib/unread-events";

/**
 * Loads a complete list from an API route once, keeps it in memory for the
 * session (so coming back is instant) and reloads it when the server sends
 * fresh page data, a message arrives, or the browser tab regains focus.
 * `cache` is a module-level holder owned by the caller.
 */
export function useAllRows<T>(
  url: string,
  field: string,
  cache: { rows: T[] | null },
  refreshKey: unknown,
): T[] | null {
  const [rows, setRows] = useState<T[] | null>(cache.rows);

  async function fetchRows(): Promise<T[] | null> {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as Record<string, unknown>;
      return Array.isArray(data[field]) ? (data[field] as T[]) : null;
    } catch {
      return null; // offline or signed out: the server-rendered page keeps working
    }
  }

  // On first show, and whenever the server sends fresh page data (after an edit or delete).
  useEffect(() => {
    let cancelled = false;
    void fetchRows().then((list) => {
      if (cancelled || !list) return;
      cache.rows = list;
      setRows(list);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, refreshKey]);

  // A new message changes the chat order, so reload when one arrives or the tab regains focus.
  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      void fetchRows().then((list) => {
        if (cancelled || !list) return;
        cache.rows = list;
        setRows(list);
      });
    };
    window.addEventListener(MESSAGES_CHANGED_EVENT, reload);
    window.addEventListener("focus", reload);
    return () => {
      cancelled = true;
      window.removeEventListener(MESSAGES_CHANGED_EVENT, reload);
      window.removeEventListener("focus", reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return rows;
}
