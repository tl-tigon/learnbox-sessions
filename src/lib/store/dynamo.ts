// @ts-nocheck - AWS SDK v3 sub-packages disagree on @smithy/types versions; safe at runtime.
/**
 * The DynamoDB store. One table, no indexes.
 *
 *   PRES#<id>       META                    a presentation
 *   USER#<sub>      PRES#<id>               the owner's list entry for it
 *   USER#<sub>      SESS#<id>               the owner's list entry for a session
 *   SESS#<id>       META                    the session (slides snapshot, state, seq)
 *   SESS#<id>       PEOPLE                  the headcount
 *   SESS#<id>       PART#<token>            one person
 *   SESS#<id>       ANS#<slide>#<token>#<n> one answer entry
 *   SESS#<id>       TALLY#<slide>           live counts; each count is a top-level "c:<key>" number
 *   SESS#<id>       QA#<slide>#<qid>        one question; qids sort by time
 *   SESS#<id>       UPVOTE#<token>#<qid>    one person's upvote on one question
 *   SESS#<id>       SCORE#<token>           one player's quiz points
 *   CODE#<code>     META                    which live session a code belongs to
 *
 * Counts are top-level attributes rather than a map so `ADD` works on a word nobody has sent yet;
 * a nested map path has to exist before it can be added to.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Question, Score, Session, SessionState, Tally } from '../types';
import type { Person, Store, StoredAnswer } from './types';

const isClash = (e: unknown) => (e as { name?: string })?.name === 'ConditionalCheckFailedException';

export function dynamoStore(table = process.env.DYNAMODB_TABLE_NAME!): Store {
  if (!table) throw new Error('DYNAMODB_TABLE_NAME is not set');
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const get = async (PK: string, SK: string, consistent = false) =>
    (await ddb.send(new GetCommand({ TableName: table, Key: { PK, SK }, ConsistentRead: consistent }))).Item;

  async function queryAll(PK: string, prefix: string, opts: { limit?: number; forward?: boolean } = {}) {
    const out = [];
    let start;
    do {
      const r = await ddb.send(new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'PK = :p AND begins_with(SK, :s)',
        ExpressionAttributeValues: { ':p': PK, ':s': prefix },
        ScanIndexForward: opts.forward ?? true,
        ExclusiveStartKey: start,
      }));
      out.push(...(r.Items ?? []));
      start = r.LastEvaluatedKey;
    } while (start && (!opts.limit || out.length < opts.limit));
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  const sessionFrom = (i): Session | null => {
    if (!i) return null;
    const { PK, SK, ...s } = i;
    return s as Session;
  };
  const tallyFrom = (i): Tally => {
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(i ?? {})) if (k.startsWith('c:')) counts[k.slice(2)] = Number(v);
    return { people: Number(i?.people ?? 0), counts };
  };
  const questionFrom = (i): Question | null =>
    i ? { id: i.id, slideId: i.slideId, token: i.token, text: i.text, name: i.name ?? '', status: i.status, votes: Number(i.votes ?? 0), at: i.at } : null;
  const scoreFrom = (i): Score => ({ token: i.token, nickname: i.nickname ?? '', total: Number(i.total ?? 0), last: Number(i.last ?? 0), lastSlideId: i.lastSlideId ?? '' });
  const answerFrom = (i): StoredAnswer => ({ slideId: i.slideId, token: i.token, entry: i.entry, answer: i.answer, at: i.at, ...(i.points === undefined ? {} : { points: Number(i.points) }) });

  return {
    async listPresentations(ownerSub) {
      const rows = await queryAll(`USER#${ownerSub}`, 'PRES#');
      return rows
        .map((r) => ({ id: r.id, title: r.title, slideCount: r.slideCount, updatedAt: r.updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getPresentation(id) {
      const i = await get(`PRES#${id}`, 'META');
      if (!i) return null;
      const { PK, SK, ...p } = i;
      return p;
    },
    async putPresentation(p) {
      await ddb.send(new PutCommand({ TableName: table, Item: { PK: `PRES#${p.id}`, SK: 'META', ...p } }));
      await ddb.send(new PutCommand({
        TableName: table,
        Item: { PK: `USER#${p.ownerSub}`, SK: `PRES#${p.id}`, id: p.id, title: p.title, slideCount: p.slides.length, updatedAt: p.updatedAt },
      }));
    },
    async deletePresentation(p) {
      await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: `PRES#${p.id}`, SK: 'META' } }));
      await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: `USER#${p.ownerSub}`, SK: `PRES#${p.id}` } }));
    },

    async createSession(s) {
      /* Claim the code first. A code row whose session has ended or passed its close time is free. */
      try {
        await ddb.send(new PutCommand({
          TableName: table,
          Item: { PK: `CODE#${s.code}`, SK: 'META', sessionId: s.id, expiresAt: s.closesAt },
          ConditionExpression: 'attribute_not_exists(PK) OR expiresAt < :now',
          ExpressionAttributeValues: { ':now': Math.floor(Date.now() / 1000) },
        }));
      } catch (e) {
        if (isClash(e)) return false;
        throw e;
      }
      await ddb.send(new PutCommand({ TableName: table, Item: { PK: `SESS#${s.id}`, SK: 'META', ...s } }));
      await ddb.send(new PutCommand({
        TableName: table,
        Item: { PK: `USER#${s.ownerSub}`, SK: `SESS#${s.id}`, id: s.id, code: s.code, title: s.title, status: s.status, mode: s.mode, createdAt: s.createdAt, closesAt: s.closesAt },
      }));
      return true;
    },
    async getSession(id) {
      return sessionFrom(await get(`SESS#${id}`, 'META', true));
    },
    async sessionIdForCode(code) {
      const i = await get(`CODE#${code}`, 'META');
      if (!i || i.expiresAt < Date.now() / 1000) return null;
      return i.sessionId;
    },
    async listSessions(ownerSub) {
      const rows = await queryAll(`USER#${ownerSub}`, 'SESS#', { forward: false });
      return rows.map((r) => ({ id: r.id, code: r.code, title: r.title, status: r.status, mode: r.mode, createdAt: r.createdAt, closesAt: r.closesAt }));
    },
    async setState(id, next: SessionState, fromSeq) {
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { PK: `SESS#${id}`, SK: 'META' },
          UpdateExpression: 'SET #st = :n',
          ConditionExpression: '#st.seq = :from AND #status = :live',
          ExpressionAttributeNames: { '#st': 'state', '#status': 'status' },
          ExpressionAttributeValues: { ':n': next, ':from': fromSeq, ':live': 'live' },
          ReturnValues: 'ALL_NEW',
        }));
        return sessionFrom(r.Attributes);
      } catch (e) {
        if (isClash(e)) return null;
        throw e;
      }
    },
    async endSession(s) {
      const endedAt = new Date().toISOString();
      await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { PK: `SESS#${s.id}`, SK: 'META' },
        UpdateExpression: 'SET #status = :e, endedAt = :t',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':e': 'ended', ':t': endedAt },
      }));
      await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { PK: `USER#${s.ownerSub}`, SK: `SESS#${s.id}` },
        UpdateExpression: 'SET #status = :e',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':e': 'ended' },
      }));
      try {
        await ddb.send(new DeleteCommand({
          TableName: table,
          Key: { PK: `CODE#${s.code}`, SK: 'META' },
          ConditionExpression: 'sessionId = :id',
          ExpressionAttributeValues: { ':id': s.id },
        }));
      } catch (e) {
        if (!isClash(e)) throw e; // the code already belongs to a newer session
      }
    },

    async join(sessionId, token, nickname, cap) {
      const had = await get(`SESS#${sessionId}`, `PART#${token}`);
      if (had) {
        if (nickname && nickname !== had.nickname) {
          await ddb.send(new UpdateCommand({
            TableName: table, Key: { PK: `SESS#${sessionId}`, SK: `PART#${token}` },
            UpdateExpression: 'SET nickname = :n', ExpressionAttributeValues: { ':n': nickname },
          }));
        }
        return { person: { token, nickname: nickname || had.nickname, joinedAt: had.joinedAt }, full: false, people: await this.countPeople(sessionId) };
      }
      /* Take a place under the cap first, then write the person; the count can never pass the cap. */
      let people: number;
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: table, Key: { PK: `SESS#${sessionId}`, SK: 'PEOPLE' },
          UpdateExpression: 'ADD n :one',
          ConditionExpression: 'attribute_not_exists(n) OR n < :cap',
          ExpressionAttributeValues: { ':one': 1, ':cap': cap },
          ReturnValues: 'UPDATED_NEW',
        }));
        people = Number(r.Attributes.n);
      } catch (e) {
        if (isClash(e)) return { person: null, full: true, people: cap };
        throw e;
      }
      const person: Person = { token, nickname, joinedAt: new Date().toISOString() };
      try {
        await ddb.send(new PutCommand({
          TableName: table, Item: { PK: `SESS#${sessionId}`, SK: `PART#${token}`, ...person },
          ConditionExpression: 'attribute_not_exists(SK)',
        }));
      } catch (e) {
        if (!isClash(e)) throw e;
        /* Two joins from the same phone at once: hand back the place this one took. */
        await ddb.send(new UpdateCommand({
          TableName: table, Key: { PK: `SESS#${sessionId}`, SK: 'PEOPLE' },
          UpdateExpression: 'ADD n :m', ExpressionAttributeValues: { ':m': -1 },
        }));
        people -= 1;
      }
      return { person, full: false, people };
    },
    async getPerson(sessionId, token) {
      const i = await get(`SESS#${sessionId}`, `PART#${token}`);
      return i ? { token: i.token, nickname: i.nickname ?? '', joinedAt: i.joinedAt } : null;
    },
    async countPeople(sessionId) {
      return Number((await get(`SESS#${sessionId}`, 'PEOPLE'))?.n ?? 0);
    },

    async addAnswer(sessionId, a) {
      try {
        await ddb.send(new PutCommand({
          TableName: table,
          Item: { PK: `SESS#${sessionId}`, SK: `ANS#${a.slideId}#${a.token}#${a.entry}`, ...a },
          ConditionExpression: 'attribute_not_exists(SK)',
        }));
        return true;
      } catch (e) {
        if (isClash(e)) return false;
        throw e;
      }
    },
    async myAnswers(sessionId, slideId, token) {
      const rows = await queryAll(`SESS#${sessionId}`, `ANS#${slideId}#${token}#`);
      return rows.map(answerFrom).sort((a, b) => a.entry - b.entry);
    },
    async slideAnswers(sessionId, slideId, limit = 500) {
      /* Keys sort by token, not time, so read the slide whole before taking the oldest. */
      const rows = await queryAll(`SESS#${sessionId}`, `ANS#${slideId}#`);
      return rows.map(answerFrom).sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
    },

    async bumpTally(sessionId, slideId, delta, newPerson) {
      const names: Record<string, string> = {};
      const values: Record<string, number> = {};
      const parts: string[] = [];
      Object.entries(delta).forEach(([k, n], i) => {
        names[`#c${i}`] = `c:${k}`;
        values[`:c${i}`] = n;
        parts.push(`#c${i} :c${i}`);
      });
      if (newPerson) {
        values[':one'] = 1;
        parts.push('people :one');
      }
      if (!parts.length) return this.getTally(sessionId, slideId);
      const r = await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { PK: `SESS#${sessionId}`, SK: `TALLY#${slideId}` },
        UpdateExpression: `ADD ${parts.join(', ')}`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));
      return tallyFrom(r.Attributes);
    },
    async getTally(sessionId, slideId) {
      return tallyFrom(await get(`SESS#${sessionId}`, `TALLY#${slideId}`, true));
    },

    async addQuestion(sessionId, q) {
      await ddb.send(new PutCommand({ TableName: table, Item: { PK: `SESS#${sessionId}`, SK: `QA#${q.slideId}#${q.id}`, ...q } }));
    },
    async getQuestion(sessionId, slideId, id) {
      return questionFrom(await get(`SESS#${sessionId}`, `QA#${slideId}#${id}`, true));
    },
    async listQuestions(sessionId, slideId) {
      return (await queryAll(`SESS#${sessionId}`, `QA#${slideId}#`)).map(questionFrom);
    },
    async setQuestionStatus(sessionId, slideId, id, status) {
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { PK: `SESS#${sessionId}`, SK: `QA#${slideId}#${id}` },
          UpdateExpression: 'SET #status = :s',
          ConditionExpression: 'attribute_exists(SK)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':s': status },
          ReturnValues: 'ALL_NEW',
        }));
        return questionFrom(r.Attributes);
      } catch (e) {
        if (isClash(e)) return null;
        throw e;
      }
    },
    async upvote(sessionId, slideId, id, token) {
      /* The upvote row is the person's one vote; the count goes up only when that row is new. */
      try {
        await ddb.send(new PutCommand({
          TableName: table,
          Item: { PK: `SESS#${sessionId}`, SK: `UPVOTE#${token}#${id}`, at: new Date().toISOString() },
          ConditionExpression: 'attribute_not_exists(SK)',
        }));
        const r = await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { PK: `SESS#${sessionId}`, SK: `QA#${slideId}#${id}` },
          UpdateExpression: 'ADD votes :one',
          ConditionExpression: 'attribute_exists(SK)',
          ExpressionAttributeValues: { ':one': 1 },
          ReturnValues: 'ALL_NEW',
        }));
        return questionFrom(r.Attributes);
      } catch (e) {
        if (isClash(e)) return null;
        throw e;
      }
    },
    async myUpvotes(sessionId, token) {
      const prefix = `UPVOTE#${token}#`;
      return (await queryAll(`SESS#${sessionId}`, prefix)).map((r) => String(r.SK).slice(prefix.length));
    },

    async addScore(sessionId, token, nickname, slideId, points) {
      const r = await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { PK: `SESS#${sessionId}`, SK: `SCORE#${token}` },
        UpdateExpression: 'ADD #total :p SET #token = :t, nickname = :n, #last = :p, lastSlideId = :s',
        ExpressionAttributeNames: { '#total': 'total', '#token': 'token', '#last': 'last' },
        ExpressionAttributeValues: { ':p': points, ':t': token, ':n': nickname, ':s': slideId },
        ReturnValues: 'ALL_NEW',
      }));
      return scoreFrom(r.Attributes);
    },
    async listScores(sessionId) {
      return (await queryAll(`SESS#${sessionId}`, 'SCORE#')).map(scoreFrom);
    },
  };
}
