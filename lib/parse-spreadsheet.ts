/**
 * Parses an uploaded Excel workbook (.xlsx / .xls) into the same
 * { headers, rows } shape the CSV importer already works with, so the
 * column-mapping and validation UI can treat both formats identically.
 * Server-only: exceljs is not bundled for the client.
 */
import ExcelJS from "exceljs";

export type ParsedSpreadsheet = {
  headers: string[];
  rows: string[][];
};

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }
    if (typeof obj.text === "string") return obj.text.trim();
    if ("result" in obj) return cellValueToString(obj.result as ExcelJS.CellValue);
    return "";
  }

  return String(value).trim();
}

/**
 * Reads the first worksheet of an Excel file buffer and returns its header
 * row plus data rows, skipping fully blank rows. Throws on unreadable files
 * or files without at least a header and one data row.
 */
export async function parseExcelBuffer(
  buffer: Buffer
): Promise<ParsedSpreadsheet> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error(
      "The Excel file could not be read. Please make sure it's a valid .xlsx file."
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("The Excel file does not contain any sheets.");
  }

  const allRows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    const cells: string[] = [];
    for (let col = 1; col < values.length; col += 1) {
      cells.push(cellValueToString(values[col]));
    }
    allRows.push(cells);
  });

  const nonEmptyRows = allRows.filter((row) =>
    row.some((cell) => cell.trim() !== "")
  );

  if (nonEmptyRows.length < 2) {
    throw new Error("The Excel file does not contain any contact rows.");
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  const headers = headerRow.map(
    (header, index) => header || `Column ${index + 1}`
  );

  return { headers, rows: dataRows };
}
