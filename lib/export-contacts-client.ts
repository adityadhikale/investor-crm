/**
 * Downloads contacts as a CSV or Excel file. Pass `ids` to export just those
 * contacts (selected, or the current search and filter results); leave it out
 * to export every contact.
 */
export async function downloadContactsExport(options: {
  ids?: string[];
  format: "csv" | "xlsx";
  label?: "selected" | "filtered";
}): Promise<{ count: number } | { error: string }> {
  let response: Response;
  try {
    response = await fetch("/api/export/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
  } catch {
    return { error: "The export could not be reached. Check your connection and try again." };
  }

  if (!response.ok) {
    let message = "The export failed. Please try again.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep the generic message
    }
    return { error: message };
  }

  const filename =
    response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    `crest-contacts.${options.format}`;
  const count = Number(response.headers.get("X-Contact-Count") ?? 0);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { count };
}
