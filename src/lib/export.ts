/**
 * Results for download, as CSV or Excel. Both are built from the same blocks: a summary, one
 * block per poll and quiz question, each quiz's leaderboard, and the audience's questions. A
 * poll's block holds counts for choice, rating, ranking and word cloud, and every answer for
 * open text. Names appear only where a person chose to give one.
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
  let n = 0;
  let boards = 0;
  for (const item of r.items) {
    if (item.kind === 'responses') {
      /* The feedback form, one row per person: their name, then each question's answer. */
      blocks.push({ name: `${item.title} responses`, rows: [['Name', ...item.polls.map((p) => p.title), 'Time'], ...item.rows.map((row): Cell[] => [row.name, ...item.polls.map((p) => row.answers[p.id] ?? ''), row.at])] });
      continue;
    }
    if (item.kind === 'board') {
      if (!item.board.length) continue;
      boards += 1;
      blocks.push({ name: `Leaderboard ${boards}`, rows: [['Leaderboard', item.quiz], ['Rank', 'Name', 'Points'], ...item.board.map((e): Cell[] => [e.rank, e.nickname, e.total])] });
      continue;
    }
    n += 1;
    const rows: Cell[][] = [];
    if (item.kind === 'quiz-question') {
      const { question, tally } = item;
      rows.push([`Question ${n}`, question.title], ['Quiz', item.quiz], ['Answered', tally.people], ['Option', 'Picks', 'Correct']);
      for (const o of question.options) rows.push([o.label, tally.counts[o.id] ?? 0, o.id === question.correctId ? 'Yes' : '']);
    } else {
      const { poll, tally, answers } = item;
      rows.push([`Question ${n}`, poll.title]);
      if (item.group) rows.push(['Part of', item.group]);
      rows.push(['Answered', tally.people]);
      if (poll.type === 'choice') {
        rows.push(['Option', 'Picks']);
        for (const o of poll.options) rows.push([o.label, tally.counts[o.id] ?? 0]);
      } else if (poll.type === 'ranking') {
        rows.push(['Option', 'Points']);
        [...poll.options].sort((a, b) => (tally.counts[b.id] ?? 0) - (tally.counts[a.id] ?? 0)).forEach((o) => rows.push([o.label, tally.counts[o.id] ?? 0]));
      } else if (poll.type === 'rating') {
        rows.push(['Rating', 'Votes']);
        for (let v = 1; v <= poll.max; v++) rows.push([v, tally.counts[String(v)] ?? 0]);
      } else if (poll.type === 'wordcloud') {
        rows.push(['Word', 'Times']);
        Object.entries(tally.counts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).forEach(([w, c]) => rows.push([w, c]));
      } else {
        rows.push(['Answer', 'Time']);
        for (const a of answers) rows.push([a.answer.type === 'open' ? a.answer.text : '', a.at]);
      }
    }
    blocks.push({ name: `Question ${n}`, rows });
  }
  if (r.questions.length) {
    blocks.push({
      name: 'Q&A',
      rows: [['Q&A', r.questions.length], ['Question', 'Asked by', 'Votes', 'Status', 'Replies', 'Time'], ...r.questions.map((q): Cell[] => [q.text, q.name || 'Anonymous', q.votes, STATUS[q.status], q.replies.map((x) => x.text).join(' | '), q.at])],
    });
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
    /* Excel sheet names cannot hold some punctuation. */
    const sheet = book.addWorksheet(b.name.replace(/[\\/?*[\]:]/g, ' ').trim());
    sheet.addRows(b.rows);
    const width = (col: number) => Math.min(60, Math.max(10, ...b.rows.map((row) => String(row[col] ?? '').length + 2)));
    sheet.columns.forEach((c, i) => { c.width = width(i); });
    sheet.getRow(1).font = { bold: true };
  }
  return book.xlsx.writeBuffer();
}
