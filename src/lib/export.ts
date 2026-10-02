/**
 * Results for download, as CSV or Excel. Both are built from the same blocks: a summary, one
 * block per slide, and the quiz leaderboard. A slide's block holds counts for choice, rating,
 * word cloud and quiz; every answer for open text; every question for Q&A, with the name its
 * asker chose to show. The leaderboard has the names the players entered.
 */
import ExcelJS from 'exceljs';
import type { sessionResults } from './live';

type Results = Awaited<ReturnType<typeof sessionResults>>;
type Cell = string | number;
export interface Block { name: string; rows: Cell[][] }

const STATUS = { pending: 'Waiting', live: 'Approved', answered: 'Answered', hidden: 'Hidden' } as const;

export function resultBlocks(r: Results): Block[] {
  const blocks: Block[] = [
    { name: 'Summary', rows: [['Session', r.session.title], ['Code', r.session.code], ['Started', r.session.createdAt], ['People', r.people]] },
  ];
  r.rows.forEach(({ slide, tally, answers, questions }, i) => {
    const rows: Cell[][] = [[`Slide ${i + 1}`, slide.title]];
    if (slide.type === 'qa') {
      rows.push(['Questions', questions.length], ['Question', 'Asked by', 'Votes', 'Status', 'Time']);
      for (const q of questions) rows.push([q.text, q.name || 'Anonymous', q.votes, STATUS[q.status], q.at]);
    } else {
      rows.push(['Answered', tally.people]);
      if (slide.type === 'choice') {
        rows.push(['Option', 'Picks']);
        for (const o of slide.options) rows.push([o.label, tally.counts[o.id] ?? 0]);
      } else if (slide.type === 'quiz') {
        rows.push(['Option', 'Picks', 'Correct']);
        for (const o of slide.options) rows.push([o.label, tally.counts[o.id] ?? 0, o.id === slide.correctId ? 'Yes' : '']);
      } else if (slide.type === 'rating') {
        rows.push(['Rating', 'Votes']);
        for (let v = 1; v <= slide.max; v++) rows.push([v, tally.counts[String(v)] ?? 0]);
      } else if (slide.type === 'wordcloud') {
        rows.push(['Word', 'Times']);
        Object.entries(tally.counts).sort((a, b) => b[1] - a[1]).forEach(([w, n]) => rows.push([w, n]));
      } else if (slide.type === 'open') {
        rows.push(['Answer', 'Time']);
        for (const a of answers) rows.push([a.answer.type === 'open' ? a.answer.text : '', a.at]);
      }
    }
    blocks.push({ name: `Slide ${i + 1}`, rows });
  });
  if (r.board.length) {
    blocks.push({ name: 'Leaderboard', rows: [['Leaderboard'], ['Rank', 'Name', 'Points'], ...r.board.map((e): Cell[] => [e.rank, e.nickname, e.total])] });
  }
  return blocks;
}

const cell = (v: unknown) => {
  const s = String(v ?? '');
  /* Quote everything; neutralise a leading = + - @ so a spreadsheet does not run it as a formula. */
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function resultsCsv(r: Results): string {
  const out: string[] = [];
  for (const b of resultBlocks(r)) out.push(...b.rows.map((row) => row.map(cell).join(',')), '');
  /* The byte-order mark makes Excel read the file as UTF-8. */
  return String.fromCharCode(0xfeff) + out.join('\r\n');
}

/** One sheet per block. Text cells are written as text, so nothing an audience typed runs as a formula. */
export async function resultsXlsx(r: Results): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  for (const b of resultBlocks(r)) {
    const sheet = book.addWorksheet(b.name);
    sheet.addRows(b.rows);
    const width = (col: number) => Math.min(60, Math.max(10, ...b.rows.map((row) => String(row[col] ?? '').length + 2)));
    sheet.columns.forEach((c, i) => { c.width = width(i); });
    sheet.getRow(1).font = { bold: true };
  }
  return book.xlsx.writeBuffer();
}
