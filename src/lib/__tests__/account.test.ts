import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { memoryStore } from '../store/memory';
import { deleteAccountData } from '../account';
import { control, respond, sessionResults, startSession } from '../live';
import { ask } from '../qa';
import { resultBlocks, resultsCsv, resultsXlsx } from '../export';
import { cleanSlides } from '../engine/slides';
import type { Presentation } from '../types';

const TOKEN = (n: number) => `tok-${String(n).padStart(16, '0')}`;

function deck(id: string, ownerSub: string): Presentation {
  const slides = cleanSlides([
    { id: 'aaaa1', type: 'choice', title: 'Pick', maxPicks: 1, options: [{ id: 'opta', label: '=SUM(A1)' }, { id: 'optb', label: 'B' }] },
    { id: 'qqqq2', type: 'qa', title: 'Questions', moderation: false, anonymous: true },
    { id: 'quiz3', type: 'quiz', title: 'Largest?', seconds: 20, correctId: 'opty', options: [{ id: 'optx', label: 'Earth' }, { id: 'opty', label: 'Jupiter' }] },
  ]);
  const now = new Date().toISOString();
  return { id, ownerSub, title: 'Deck', slides, createdAt: now, updatedAt: now };
}

/** One session with an answer, a question and a quiz score. */
async function played(db = memoryStore(), owner = 'u1') {
  const p = deck(`p-${owner}`, owner);
  await db.putPresentation(p);
  let s = await startSession(db, owner, p, 'presenter');
  await db.join(s.id, TOKEN(1), 'Asha', 1000);
  await respond(db, s, TOKEN(1), 'aaaa1', { optionIds: ['opta'] });
  s = await control(db, s, { action: 'next' });
  await ask(db, s, TOKEN(1), 'qqqq2', { text: 'When?' });
  s = await control(db, s, { action: 'next' });
  s = await control(db, s, { action: 'quiz-start' });
  await respond(db, s, TOKEN(1), 'quiz3', { optionId: 'opty' });
  return { db, s, p };
}

describe('deleting an account', () => {
  it('removes its presentations, sessions and everything recorded in them, and nothing of anyone else’s', async () => {
    const { db, s } = await played();
    const other = await played(db, 'u2');

    expect(await deleteAccountData(db, 'u1')).toEqual({ presentations: 1, sessions: 1 });

    expect(await db.listPresentations('u1')).toEqual([]);
    expect(await db.listSessions('u1')).toEqual([]);
    expect(await db.getSession(s.id)).toBeNull();
    expect(await db.sessionIdForCode(s.code)).toBeNull();
    expect(await db.getPerson(s.id, TOKEN(1))).toBeNull();
    expect(await db.slideAnswers(s.id, 'aaaa1')).toEqual([]);
    expect(await db.getTally(s.id, 'aaaa1')).toEqual({ people: 0, counts: {} });
    expect(await db.listQuestions(s.id, 'qqqq2')).toEqual([]);
    expect(await db.listScores(s.id)).toEqual([]);

    expect(await db.listPresentations('u2')).toHaveLength(1);
    expect(await db.sessionIdForCode(other.s.code)).toBe(other.s.id);
    expect(await db.slideAnswers(other.s.id, 'aaaa1')).toHaveLength(1);
    expect(await db.listScores(other.s.id)).toHaveLength(1);
  });
});

describe('downloads', () => {
  it('CSV and Excel hold the same blocks, and text is never a formula', async () => {
    const { db, s } = await played();
    const r = await sessionResults(db, s);
    const blocks = resultBlocks(r);
    expect(blocks.map((b) => b.name)).toEqual(['Summary', 'Slide 1', 'Slide 2', 'Slide 3', 'Leaderboard']);

    const csv = resultsCsv(r);
    expect(csv).toContain(`"'=SUM(A1)","1"`);
    expect(csv).toContain('"When?","Asha","0","Approved"');
    expect(csv).toContain('"Jupiter","1","Yes"');
    expect(csv).toMatch(/"Leaderboard"\r\n"Rank","Name","Points"\r\n"1","Asha","\d+"/);

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await resultsXlsx(r));
    expect(book.worksheets.map((w) => w.name)).toEqual(blocks.map((b) => b.name));
    const option = book.getWorksheet('Slide 1')!.getCell('A4');
    expect(option.value).toBe('=SUM(A1)');
    expect(option.type).toBe(ExcelJS.ValueType.String);
    expect(book.getWorksheet('Slide 1')!.getCell('B4').value).toBe(1);
    expect(book.getWorksheet('Leaderboard')!.getCell('B3').value).toBe('Asha');
  });
});
