export type CsvData = { headers: string[]; rows: string[][] };

/** Reads CSV text (quoted values, commas and new lines inside quotes) into a header row and data rows. */
export function parseCsv(text: string): CsvData {
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
