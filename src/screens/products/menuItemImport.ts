export function parseDelimitedLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === '\t') && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseSpreadsheetXml(raw: string): string[][] {
  const rows = [...raw.matchAll(/<Row[\s\S]*?<\/Row>/gi)];
  return rows.map((rowMatch) => {
    const cells = [...rowMatch[0].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/gi)];
    return cells.map((cell) => cell[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim());
  }).filter((row) => row.length > 0);
}

export function parseMenuImportRows(raw: string): string[][] {
  if (raw.includes('<Workbook') && raw.includes('<Row')) {
    return parseSpreadsheetXml(raw);
  }
  return raw.split(/\r?\n/).filter((line) => line.trim()).map(parseDelimitedLine);
}
