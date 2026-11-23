/**
 * Splits a SQL Server script on lines that hold only `GO`, like sqlcmd does. The Node driver cannot run `GO`.
 * shortcut: a `GO` line inside a block comment or a multi-line string would split there, and `GO 5` (repeat) is
 * not supported; upgrade to a real tokenizer if a migration ever needs either.
 */
export function splitBatches(sql: string): string[] {
  const batches: string[] = [];
  let current: string[] = [];
  for (const line of sql.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*GO\s*(--.*)?$/i.test(line)) {
      batches.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  batches.push(current.join('\n'));
  return batches.map((batch) => batch.trim()).filter((batch) => batch !== '');
}
