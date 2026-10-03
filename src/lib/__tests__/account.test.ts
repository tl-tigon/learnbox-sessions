import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { memoryStore } from '../store/memory';
import { deleteAccountData } from '../account';
import { control, editSession, respond, respondQuiz, respondSurvey, sessionResults } from '../live';
import { ask, moderate } from '../qa';
import { resultBlocks, resultsCsv, resultsXlsx } from '../export';
import type { Store } from '../store/types';
import { INTERACTIONS, running, TOKEN } from './helpers';

/** One session with a poll answer, a survey, a question with a reply and a quiz score. */
async function played(db: Store = memoryStore(), owner = 'u1') {
  const r = await running(1, owner, db);
  const formula = INTERACTIONS.map((i) => (i.id === 'choice1' ? { ...i, options: [{ id: 'opta', label: '=SUM(A1)' }, { id: 'optb', label: 'B' }] } : i));
  let s = await editSession(db, r.s, { interactions: formula });
  s = await control(db, s, { action: 'activate', id: 'choice1' });
  await respond(db, s, TOKEN(1), 'choice1', { optionIds: ['opta'] });
  s = await control(db, s, { action: 'activate', id: 'survey1' });
  await respondSurvey(db, s, TOKEN(1), 'survey1', { srate: { value: 4 }, sopen: { text: 'Good pace' } });
  const q = await ask(db, s, TOKEN(1), { text: 'When?' });
  await moderate(db, s, q.id, 'reply', 'In March.');
  s = await control(db, s, { action: 'activate', id: 'quiz1' });
  s = await control(db, s, { action: 'quiz-next' });
  await respondQuiz(db, s, TOKEN(1), 'ques1', { optionId: 'qopb' });
  return { db, s };
}

describe('deleting an account', () => {
  it('removes its sessions and everything recorded in them, and nothing of anyone else’s', async () => {
    const { db, s } = await played();
    const other = await played(db, 'u2');

    expect(await deleteAccountData(db, 'u1')).toEqual({ sessions: 1 });

    expect(await db.listSessions('u1')).toEqual([]);
    expect(await db.getSession(s.id)).toBeNull();
    expect(await db.sessionIdForCode(s.code)).toBeNull();
    expect(await db.getPerson(s.id, TOKEN(1))).toBeNull();
    expect(await db.pollAnswers(s.id, 'choice1')).toEqual([]);
    expect(await db.listTallies(s.id)).toEqual({});
    expect(await db.listQuestions(s.id)).toEqual([]);
    expect(await db.listScores(s.id, 'quiz1')).toEqual([]);

    expect(await db.listSessions('u2')).toHaveLength(1);
    expect(await db.sessionIdForCode(other.s.code)).toBe(other.s.id);
    expect(await db.pollAnswers(other.s.id, 'choice1')).toHaveLength(1);
    expect(await db.listScores(other.s.id, 'quiz1')).toHaveLength(1);
  });
});

describe('downloads', () => {
  it('CSV and Excel hold the same blocks, and text is never a formula', async () => {
    const { db, s } = await played();
    const r = await sessionResults(db, s);
    const blocks = resultBlocks(r);
    expect(blocks.map((b) => b.name)).toEqual(['Summary', ...Array.from({ length: 10 }, (_, i) => `Question ${i + 1}`), 'Leaderboard 1', 'Q&A']);

    const csv = resultsCsv(r);
    expect(csv).toContain(`"'=SUM(A1)","1"`);
    expect(csv).toContain('"Part of","Feedback"');
    expect(csv).toContain('"Good pace"');
    expect(csv).toContain('"Jupiter","1","Yes"');
    expect(csv).toMatch(/"Leaderboard","Planets"\r\n"Rank","Name","Points"\r\n"1","Person 1","\d+"/);
    expect(csv).toContain('"When?","Person 1","0","Approved","In March."');

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await resultsXlsx(r));
    expect(book.worksheets.map((w) => w.name)).toEqual(blocks.map((b) => b.name));
    const option = book.getWorksheet('Question 1')!.getCell('A4');
    expect(option.value).toBe('=SUM(A1)');
    expect(option.type).toBe(ExcelJS.ValueType.String);
    expect(book.getWorksheet('Question 1')!.getCell('B4').value).toBe(1);
    expect(book.getWorksheet('Leaderboard 1')!.getCell('B3').value).toBe('Person 1');
  });
});
