// @ts-nocheck - AWS SDK v3 sub-packages disagree on @smithy/types versions; safe at runtime.
/**
 * The DynamoDB store. One table, no indexes.
 *
 *   USER#<sub>      SESS#<id>               the owner's list entry for a session
 *   USER#<sub>      ACCOUNT                 the account's plan: `proUntil`
 *   USER#<sub>      ORDER#<id>              one payment for Pro
 *   SESS#<id>       META                   the session (interactions, Q&A settings, state, seq)
 *   SESS#<id>       PEOPLE                  the headcount
 *   SESS#<id>       PART#<token>            one person
 *   SESS#<id>       ANS#<poll>#<token>#<n>  one answer entry
 *   SESS#<id>       TALLY#<poll>            live counts; each count is a top-level "c:<key>" number
 *   SESS#<id>       QA#<qid>                one question, with its replies; qids sort by time
 *   SESS#<id>       UPVOTE#<token>#<qid>    one person's upvote on one question
 *   SESS#<id>       SCORE#<quiz>#<token>    one player's points in one quiz
 *   CODE#<code>     META                    which live session a code belongs to
 *
 * Counts are top-level attributes rather than a map so `ADD` works on a word nobody has sent yet;
 * a nested map path has to exist before it can be added to.
 *
 * Every SESS# row and the owner's list entry carry `expiresAt` (epoch seconds), the table's TTL
 * attribute, set LIMITS.keepDays after the row is written. The account row and paid orders are
 * kept; an order that is never paid goes after 30 days.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { LIMITS } from '../limits';
import type { Question, Score, Session, SessionState, Tally } from '../types';
import type { Order, Person, Store, StoredAnswer } from './types';

const isClash = (e: unknown) => (e as { name?: string })?.name === 'ConditionalCheckFailedException';
/** A transaction that was called off because one of its conditions did not hold. */
const isCancelledByCondition = (e: unknown) => {
  const x = e as { name?: string; CancellationReasons?: { Code?: string }[] };
  return x?.name === 'TransactionCanceledException' && !!x.CancellationReasons?.some((r) => r.Code === 'ConditionalCheckFailed');
};

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

  /** Deletes rows by key, 25 to a batch, a few batches at a time, trying again what the table did not take. */
  async function deleteKeys(keys: { PK: string; SK: string }[]) {
    const batches = [];
    for (let i = 0; i < keys.length; i += 25) batches.push(keys.slice(i, i + 25));
    for (let i = 0; i < batches.length; i += 8) {
      await Promise.all(batches.slice(i, i + 8).map(async (batch) => {
        let pending = batch.map((k) => ({ DeleteRequest: { Key: { PK: k.PK, SK: k.SK } } }));
        for (let attempt = 0; pending.length && attempt < 6; attempt++) {
          const r = await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
          pending = r.UnprocessedItems?.[table] ?? [];
          if (pending.length) await new Promise((done) => setTimeout(done, 100 * 2 ** attempt));
        }
        if (pending.length) throw new Error('Could not delete every row');
      }));
    }
  }

  /** When a row written now is deleted by the table's TTL. */
  const expiry = () => Math.floor(Date.now() / 1000) + LIMITS.keepDays * 86400;

  const sessionFrom = (i): Session | null => {
    if (!i) return null;
    const { PK, SK, expiresAt, ...s } = i;
    return s as Session;
  };
  const tallyFrom = (i): Tally => {
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(i ?? {})) if (k.startsWith('c:')) counts[k.slice(2)] = Number(v);
    return { people: Number(i?.people ?? 0), counts };
  };
  const questionFrom = (i): Question | null =>
    i ? { id: i.id, token: i.token, text: i.text, name: i.name ?? '', status: i.status, votes: Number(i.votes ?? 0), at: i.at, replies: i.replies ?? [] } : null;
  const scoreFrom = (i): Score => ({ token: i.token, nickname: i.nickname ?? '', total: Number(i.total ?? 0), last: Number(i.last ?? 0), lastId: i.lastId ?? '' });
  const answerFrom = (i): StoredAnswer => ({ pollId: i.pollId, token: i.token, entry: i.entry, answer: i.answer, at: i.at, ...(i.points === undefined ? {} : { points: Number(i.points) }) });
  const orderFrom = (i): Order | null =>
    i ? { id: i.id, sub: i.sub, amount: i.amount, days: Number(i.days), status: i.status, createdAt: i.createdAt, ...(i.paidAt ? { paidAt: i.paidAt } : {}), ...(i.ref ? { ref: i.ref } : {}) } : null;
  const listEntry = (s: Session) => ({ id: s.id, code: s.code, title: s.title, status: s.status, createdAt: s.createdAt, closesAt: s.closesAt, interactions: s.interactions.length });

  return {
    async createSession(s) {
      /* The code, the session and the owner's list entry are written together or not at all.
         A code row whose session has ended or passed its close time is free. */
      try {
        await ddb.send(new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: table,
                Item: { PK: `CODE#${s.code}`, SK: 'META', sessionId: s.id, expiresAt: s.closesAt },
                ConditionExpression: 'attribute_not_exists(PK) OR expiresAt < :now',
                ExpressionAttributeValues: { ':now': Math.floor(Date.now() / 1000) },
              },
            },
            { Put: { TableName: table, Item: { PK: `SESS#${s.id}`, SK: 'META', ...s, expiresAt: expiry() } } },
            { Put: { TableName: table, Item: { PK: `USER#${s.ownerSub}`, SK: `SESS#${s.id}`, ...listEntry(s), expiresAt: expiry() } } },
          ],
        }));
        return true;
      } catch (e) {
        if (isCancelledByCondition(e)) return false;
        throw e;
      }
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
      return rows.map((r) => ({ id: r.id, code: r.code, title: r.title, status: r.status, createdAt: r.createdAt, closesAt: r.closesAt, interactions: Number(r.interactions ?? 0) }));
    },
    async updateSession(id, edit, fromSeq) {
      const sets: string[] = [];
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = {};
      for (const key of ['title', 'interactions', 'qa'] as const) {
        if (edit[key] === undefined) continue;
        sets.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = edit[key];
      }
      sets.push('#rev = if_not_exists(#rev, :one) + :one');
      names['#rev'] = 'rev';
      values[':one'] = 1;
      let saved: Session | null;
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { PK: `SESS#${id}`, SK: 'META' },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ConditionExpression: 'attribute_exists(PK) AND #st.seq = :seq',
          ExpressionAttributeNames: { ...names, '#st': 'state' },
          ExpressionAttributeValues: { ...values, ':seq': fromSeq },
          ReturnValues: 'ALL_NEW',
        }));
        saved = sessionFrom(r.Attributes);
      } catch (e) {
        if (isClash(e)) return null;
        throw e;
      }
      /* The owner's list shows the title and how many interactions there are. */
      try {
        await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { PK: `USER#${saved.ownerSub}`, SK: `SESS#${id}` },
          UpdateExpression: 'SET title = :t, interactions = :n',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: { ':t': saved.title, ':n': saved.interactions.length },
        }));
      } catch (e) {
        if (!isClash(e)) throw e; // the session was deleted meanwhile; there is no list entry to update
      }
      return saved;
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
      /* Each update applies only to a row that is still there, so a session deleted meanwhile is not brought back as an empty row. */
      const ifThere = async (command) => {
        try {
          await ddb.send(command);
        } catch (e) {
          if (!isClash(e)) throw e;
        }
      };
      await ifThere(new UpdateCommand({
        TableName: table,
        Key: { PK: `SESS#${s.id}`, SK: 'META' },
        UpdateExpression: 'SET #status = :e, endedAt = :t',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':e': 'ended', ':t': endedAt },
      }));
      await ifThere(new UpdateCommand({
        TableName: table,
        Key: { PK: `USER#${s.ownerSub}`, SK: `SESS#${s.id}` },
        UpdateExpression: 'SET #status = :e',
        ConditionExpression: 'attribute_exists(PK)',
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
    async deleteSession(s) {
      try {
        await ddb.send(new DeleteCommand({
          TableName: table,
          Key: { PK: `CODE#${s.code}`, SK: 'META' },
          ConditionExpression: 'sessionId = :id',
          ExpressionAttributeValues: { ':id': s.id },
        }));
      } catch (e) {
        if (!isClash(e)) throw e; // the code already belongs to a newer session, or is gone
      }
      /* Every row under the session, 25 to a batch, a few batches at a time. */
      let start;
      do {
        const page = await ddb.send(new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'PK = :p',
          ExpressionAttributeValues: { ':p': `SESS#${s.id}` },
          ProjectionExpression: 'PK, SK',
          ExclusiveStartKey: start,
        }));
        await deleteKeys(page.Items ?? []);
        start = page.LastEvaluatedKey;
      } while (start);
      await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: `USER#${s.ownerSub}`, SK: `SESS#${s.id}` } }));
    },

    async join(sessionId, token, nickname, cap) {
      const had = await get(`SESS#${sessionId}`, `PART#${token}`, true);
      if (had) {
        if (nickname && nickname !== had.nickname) {
          try {
            await ddb.send(new UpdateCommand({
              TableName: table, Key: { PK: `SESS#${sessionId}`, SK: `PART#${token}` },
              UpdateExpression: 'SET nickname = :n', ConditionExpression: 'attribute_exists(SK)', ExpressionAttributeValues: { ':n': nickname },
            }));
          } catch (e) {
            if (!isClash(e)) throw e; // the session was deleted meanwhile
          }
        }
        return { person: { token, nickname: nickname || had.nickname, joinedAt: had.joinedAt }, full: false, people: await this.countPeople(sessionId) };
      }
      /* Take a place under the cap first, then write the person; the count can never pass the cap. */
      let people: number;
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: table, Key: { PK: `SESS#${sessionId}`, SK: 'PEOPLE' },
          UpdateExpression: 'ADD n :one SET expiresAt = if_not_exists(expiresAt, :exp)',
          ConditionExpression: 'attribute_not_exists(n) OR n < :cap',
          ExpressionAttributeValues: { ':one': 1, ':cap': cap, ':exp': expiry() },
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
          TableName: table, Item: { PK: `SESS#${sessionId}`, SK: `PART#${token}`, ...person, expiresAt: expiry() },
          ConditionExpression: 'attribute_not_exists(SK)',
        }));
      } catch (e) {
        /* The person was not written: hand back the place this join took, whatever the reason. */
        await ddb.send(new UpdateCommand({
          TableName: table, Key: { PK: `SESS#${sessionId}`, SK: 'PEOPLE' },
          UpdateExpression: 'ADD n :m', ExpressionAttributeValues: { ':m': -1 },
        }));
        if (!isClash(e)) throw e;
        /* Two joins from the same phone at once: the other one wrote the person. */
        people -= 1;
      }
      return { person, full: false, people };
    },
    async getPerson(sessionId, token) {
      const i = await get(`SESS#${sessionId}`, `PART#${token}`, true);
      return i ? { token: i.token, nickname: i.nickname ?? '', joinedAt: i.joinedAt } : null;
    },
    async countPeople(sessionId) {
      return Number((await get(`SESS#${sessionId}`, 'PEOPLE'))?.n ?? 0);
    },

    async addAnswer(sessionId, a) {
      try {
        await ddb.send(new PutCommand({
          TableName: table,
          Item: { PK: `SESS#${sessionId}`, SK: `ANS#${a.pollId}#${a.token}#${a.entry}`, ...a, expiresAt: expiry() },
          ConditionExpression: 'attribute_not_exists(SK)',
        }));
        return true;
      } catch (e) {
        if (isClash(e)) return false;
        throw e;
      }
    },
    async replaceAnswer(sessionId, a, prevAt) {
      try {
        await ddb.send(new PutCommand({
          TableName: table,
          Item: { PK: `SESS#${sessionId}`, SK: `ANS#${a.pollId}#${a.token}#${a.entry}`, ...a, expiresAt: expiry() },
          ConditionExpression: '#at = :prev',
          ExpressionAttributeNames: { '#at': 'at' },
          ExpressionAttributeValues: { ':prev': prevAt },
        }));
        return true;
      } catch (e) {
        if (isClash(e)) return false;
        throw e;
      }
    },
    async myAnswers(sessionId, pollId, token) {
      const r = await ddb.send(new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'PK = :p AND begins_with(SK, :s)',
        ExpressionAttributeValues: { ':p': `SESS#${sessionId}`, ':s': `ANS#${pollId}#${token}#` },
        ConsistentRead: true,
      }));
      return (r.Items ?? []).map(answerFrom).sort((a, b) => a.entry - b.entry);
    },
    async pollAnswers(sessionId, pollId, limit) {
      /* Keys sort by token, not time, so read the poll whole before taking the newest. */
      const all = (await queryAll(`SESS#${sessionId}`, `ANS#${pollId}#`)).map(answerFrom).sort((a, b) => a.at.localeCompare(b.at));
      return limit ? all.slice(-limit) : all;
    },

    async bumpTally(sessionId, pollId, delta, people) {
      const names: Record<string, string> = {};
      const values: Record<string, number> = {};
      const parts: string[] = [];
      Object.entries(delta).forEach(([k, n], i) => {
        names[`#c${i}`] = `c:${k}`;
        values[`:c${i}`] = n;
        parts.push(`#c${i} :c${i}`);
      });
      if (people) {
        values[':ppl'] = people;
        parts.push('people :ppl');
      }
      if (!parts.length) return this.getTally(sessionId, pollId);
      values[':exp'] = expiry();
      const r = await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { PK: `SESS#${sessionId}`, SK: `TALLY#${pollId}` },
        UpdateExpression: `ADD ${parts.join(', ')} SET expiresAt = if_not_exists(expiresAt, :exp)`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));
      return tallyFrom(r.Attributes);
    },
    async getTally(sessionId, pollId) {
      return tallyFrom(await get(`SESS#${sessionId}`, `TALLY#${pollId}`, true));
    },
    async listTallies(sessionId) {
      const rows = await queryAll(`SESS#${sessionId}`, 'TALLY#');
      return Object.fromEntries(rows.map((r) => [String(r.SK).slice('TALLY#'.length), tallyFrom(r)]));
    },

    async clearAnswers(sessionId, pollIds) {
      for (const pollId of pollIds) {
        await deleteKeys(await queryAll(`SESS#${sessionId}`, `ANS#${pollId}#`));
        await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: `SESS#${sessionId}`, SK: `TALLY#${pollId}` } }));
      }
    },
    async clearScores(sessionId, quizId) {
      await deleteKeys(await queryAll(`SESS#${sessionId}`, `SCORE#${quizId}#`));
    },

    async addQuestion(sessionId, q) {
      await ddb.send(new PutCommand({ TableName: table, Item: { PK: `SESS#${sessionId}`, SK: `QA#${q.id}`, ...q, expiresAt: expiry() } }));
    },
    async getQuestion(sessionId, id) {
      return questionFrom(await get(`SESS#${sessionId}`, `QA#${id}`, true));
    },
    async listQuestions(sessionId) {
      return (await queryAll(`SESS#${sessionId}`, 'QA#')).map(questionFrom);
    },
    async setQuestionStatus(sessionId, id, status) {
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { PK: `SESS#${sessionId}`, SK: `QA#${id}` },
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
    async addReply(sessionId, id, reply, max) {
      try {
        const r = await ddb.send(new UpdateCommand({
          TableName: table,
          Key: { PK: `SESS#${sessionId}`, SK: `QA#${id}` },
          UpdateExpression: 'SET replies = list_append(if_not_exists(replies, :none), :r)',
          ConditionExpression: 'attribute_exists(SK) AND (attribute_not_exists(replies) OR size(replies) < :max)',
          ExpressionAttributeValues: { ':r': [reply], ':none': [], ':max': max },
          ReturnValues: 'ALL_NEW',
        }));
        return questionFrom(r.Attributes);
      } catch (e) {
        if (isClash(e)) return null;
        throw e;
      }
    },
    async upvote(sessionId, id, token) {
      /* The upvote row is the person's one vote; the count goes up only when that row is new. */
      const voteKey = { PK: `SESS#${sessionId}`, SK: `UPVOTE#${token}#${id}` };
      try {
        await ddb.send(new PutCommand({
          TableName: table,
          Item: { ...voteKey, at: new Date().toISOString(), expiresAt: expiry() },
          ConditionExpression: 'attribute_not_exists(SK)',
        }));
      } catch (e) {
        if (isClash(e)) return null;
        throw e;
      }
      /* The count must follow the vote row. It is tried a few times; if it cannot be written,
         or the question is gone, the vote row is taken back so the person can vote again. */
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await ddb.send(new UpdateCommand({
            TableName: table,
            Key: { PK: `SESS#${sessionId}`, SK: `QA#${id}` },
            UpdateExpression: 'ADD votes :one',
            ConditionExpression: 'attribute_exists(SK)',
            ExpressionAttributeValues: { ':one': 1 },
            ReturnValues: 'ALL_NEW',
          }));
          return questionFrom(r.Attributes);
        } catch (e) {
          if (!isClash(e) && attempt < 2) {
            await new Promise((done) => setTimeout(done, 40 * 2 ** attempt));
            continue;
          }
          await ddb.send(new DeleteCommand({ TableName: table, Key: voteKey }));
          if (isClash(e)) return null;
          throw e;
        }
      }
    },
    async myUpvotes(sessionId, token) {
      const prefix = `UPVOTE#${token}#`;
      return (await queryAll(`SESS#${sessionId}`, prefix)).map((r) => String(r.SK).slice(prefix.length));
    },

    async addScore(sessionId, quizId, token, nickname, questionId, points) {
      const r = await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { PK: `SESS#${sessionId}`, SK: `SCORE#${quizId}#${token}` },
        UpdateExpression: 'ADD #total :p SET #token = :t, nickname = :n, #last = :p, lastId = :q, expiresAt = if_not_exists(expiresAt, :exp)',
        ExpressionAttributeNames: { '#total': 'total', '#token': 'token', '#last': 'last' },
        ExpressionAttributeValues: { ':p': points, ':t': token, ':n': nickname, ':q': questionId, ':exp': expiry() },
        ReturnValues: 'ALL_NEW',
      }));
      return scoreFrom(r.Attributes);
    },
    async listScores(sessionId, quizId) {
      return (await queryAll(`SESS#${sessionId}`, `SCORE#${quizId}#`)).map(scoreFrom);
    },

    async getAccount(sub) {
      const i = await get(`USER#${sub}`, 'ACCOUNT', true);
      return i ? { proUntil: Number(i.proUntil ?? 0) } : null;
    },
    async addOrder(o) {
      await ddb.send(new PutCommand({ TableName: table, Item: { PK: `USER#${o.sub}`, SK: `ORDER#${o.id}`, ...o, expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400 } }));
    },
    async getOrder(sub, id) {
      return orderFrom(await get(`USER#${sub}`, `ORDER#${id}`, true));
    },
    async listOrders(sub) {
      return (await queryAll(`USER#${sub}`, 'ORDER#')).map(orderFrom).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async settleOrder(sub, id, ref) {
      const orderKey = { PK: `USER#${sub}`, SK: `ORDER#${id}` };
      /* The order and the account change together or not at all. The account's new end is worked
         out from the one just read, and written only if that one still stands. */
      for (let attempt = 0; attempt < 5; attempt++) {
        const order = orderFrom(await get(orderKey.PK, orderKey.SK, true));
        if (!order || order.status === 'paid') return null;
        const had = await get(`USER#${sub}`, 'ACCOUNT', true);
        const now = Math.floor(Date.now() / 1000);
        const proUntil = Math.max(now, Number(had?.proUntil ?? 0)) + order.days * 86400;
        try {
          await ddb.send(new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: table, Key: orderKey,
                  UpdateExpression: 'SET #status = :paid, paidAt = :at, #ref = :ref REMOVE expiresAt',
                  ConditionExpression: 'attribute_exists(PK) AND #status <> :paid',
                  ExpressionAttributeNames: { '#status': 'status', '#ref': 'ref' },
                  ExpressionAttributeValues: { ':paid': 'paid', ':at': new Date().toISOString(), ':ref': ref },
                },
              },
              {
                Update: {
                  TableName: table, Key: { PK: `USER#${sub}`, SK: 'ACCOUNT' },
                  UpdateExpression: 'SET proUntil = :next',
                  ConditionExpression: had ? 'proUntil = :prev' : 'attribute_not_exists(PK)',
                  ExpressionAttributeValues: had ? { ':next': proUntil, ':prev': had.proUntil } : { ':next': proUntil },
                },
              },
            ],
          }));
          return { proUntil };
        } catch (e) {
          if (!isCancelledByCondition(e)) throw e; // otherwise read both again: the order was paid meanwhile, or the account changed
        }
      }
      throw new Error('Could not settle the order');
    },
    async failOrder(sub, id) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: table, Key: { PK: `USER#${sub}`, SK: `ORDER#${id}` },
          UpdateExpression: 'SET #status = :failed',
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':failed': 'failed', ':pending': 'pending' },
        }));
      } catch (e) {
        if (!isClash(e)) throw e; // already paid or failed, or there is no such order
      }
    },
    async deleteAccount(sub) {
      const orders = await queryAll(`USER#${sub}`, 'ORDER#');
      for (const o of orders) await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: o.PK, SK: o.SK } }));
      await ddb.send(new DeleteCommand({ TableName: table, Key: { PK: `USER#${sub}`, SK: 'ACCOUNT' } }));
    },
  };
}
