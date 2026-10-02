/**
 * Results as CSV: one block per slide. Counts for choice, rating and word cloud; every answer
 * for open text; every question for Q&A, with the name its asker chose to show; and the quiz
 * leaderboard with the names the players entered.
 */
import type { sessionResults } from './live';

type Results = Awaited<ReturnType<typeof sessionResults>>;

const cell = (v: unknown) => {
  const s = String(v ?? '');
  /* Quote everything; neutralise a leading = + - @ so a spreadsheet does not run it as a formula. */
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const line = (...cells: unknown[]) => cells.map(cell).join(',');
const STATUS = { pending: 'Waiting', live: 'Approved', answered: 'Answered', hidden: 'Hidden' } as const;

export function resultsCsv(r: Results): string {
  const out: string[] = [line('Session', r.session.title), line('Code', r.session.code), line('Started', r.session.createdAt), line('People', r.people), ''];
  r.rows.forEach(({ slide, tally, answers, questions }, i) => {
    out.push(line(`Slide ${i + 1}`, slide.title));
    if (slide.type === 'qa') {
      out.push(line('Questions', questions.length), line('Question', 'Asked by', 'Votes', 'Status', 'Time'));
      for (const q of questions) out.push(line(q.text, q.name || 'Anonymous', q.votes, STATUS[q.status], q.at));
      out.push('');
      return;
    }
    out.push(line('Answered', tally.people));
    if (slide.type === 'choice') {
      out.push(line('Option', 'Picks'));
      for (const o of slide.options) out.push(line(o.label, tally.counts[o.id] ?? 0));
    } else if (slide.type === 'quiz') {
      out.push(line('Option', 'Picks', 'Correct'));
      for (const o of slide.options) out.push(line(o.label, tally.counts[o.id] ?? 0, o.id === slide.correctId ? 'Yes' : ''));
    } else if (slide.type === 'rating') {
      out.push(line('Rating', 'Votes'));
      for (let v = 1; v <= slide.max; v++) out.push(line(v, tally.counts[String(v)] ?? 0));
    } else if (slide.type === 'wordcloud') {
      out.push(line('Word', 'Times'));
      Object.entries(tally.counts).sort((a, b) => b[1] - a[1]).forEach(([w, n]) => out.push(line(w, n)));
    } else if (slide.type === 'open') {
      out.push(line('Answer', 'Time'));
      for (const a of answers) out.push(line(a.answer.type === 'open' ? a.answer.text : '', a.at));
    }
    out.push('');
  });
  if (r.board.length) {
    out.push(line('Leaderboard'), line('Rank', 'Name', 'Points'));
    for (const e of r.board) out.push(line(e.rank, e.nickname, e.total));
    out.push('');
  }
  return '﻿' + out.join('\r\n');
}
