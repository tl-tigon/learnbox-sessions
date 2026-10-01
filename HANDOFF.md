# Handoff: Live (state on 2026-10-01)

This continues the work started in the LearnBox session. Read this file, then `CLAUDE.md` and `docs/PLAN.md`.

## Where things stand

**Phase 1 is built and tested.** It is in a local git repo only (`main`, commit `165f5be`). There is no GitHub remote yet.

**What works now** (in-memory store, with development sign-in):
- **Facilitator**:
  - sign in (development: any email, no password);
  - dashboard;
  - presentation editor with autosave;
  - Present, or Run as survey.
- **Slide types**: multiple choice (1 to N picks), word cloud (1–3 words, normalised and profanity-filtered), rating (1–3/4/5/7/10 with end labels), open text (1–3 answers), heading.
- **Audience**: joins at `/` or `/s/<code>` with no account, using a browser token. They follow the presenter, or go at their own pace in a survey.
- **Presenter screen** `/present/<id>`:
  - join bar with code, QR and people joined;
  - live results;
  - also opens on a projector that isn't signed in, via `#k=<displayKey>`.
- **Control view** `/control/<id>`:
  - previous / next (and arrow keys);
  - jump to any slide;
  - results shown or hidden;
  - close answers;
  - end session;
  - copy projector link.
- **Results page** with CSV download, built from the stored answers.
- **Fair-use caps, rate limits and the profanity filter.**

**Tests:**
- `npm test` runs 14 vitest tests (engine, store guarantees, views).
- A browser walk passed 17 of 17 checks: `node scripts/walk.js`, with `npm run dev` running.
  - It uses playwright-core from `../LMS/Trust Sim/capture-tool/node_modules/playwright-core` with system Chrome.
  - Screenshots go to `scripts/live-walk/`, which is gitignored.
  - It covered a facilitator, the big screen and 5 phones; every slide type; hide and show results; lock; end; CSV; survey; and a check that another account is blocked.

**Written but not yet run:**
- `src/lib/store/dynamo.ts`: the DynamoDB store, which needs the table to exist.
- `src/lib/push/server.ts` and `src/lib/push/client.ts`: AppSync Events publish and subscribe, which need the Events API.
- The Cognito sign-up, confirm and Google flows in `src/lib/auth/client.ts` and `src/app/sign-in/page.tsx`, which need the user pool.

## Direction set by the owner on 2026-10-01
- **Live is LearnBox's free tool**, like HubSpot's free tools beside its main product. It brings facilitators to the simulation business.
- **The UI must be SaaS-grade**, on the front page and on every screen after sign-in.
- **Claude Design produces the look.** `design/PROMPT.md` and `design/BRIEF.md` were rewritten for this: the quality bar (§2), a full front page (§4A.1), an app shell with dashboard and editor (§4E), the four places LearnBox appears (§4F) and the draft copy (§5).
- **Copy**: drafted here, approved by the owner. Plain statements, no creative writing, no long explanation.
- **Domain**: a subdomain of `learnbox.one`. The brief uses `live.learnbox.one` as a stand-in.

## Waiting on the owner
1. **Product name**, which also gives the subdomain of `learnbox.one`. The DNS record goes in the `learnbox.one` zone, which belongs to LearnBox, so it needs the owner's OK.
2. **The simulations to show** on the front page: a name and one line each. The slot is marked `[OWNER: …]` in `design/BRIEF.md` §5. Fill it before sending the brief to Claude Design.
3. **Approval of the draft copy** in `design/BRIEF.md` §5.
4. **OK to create in AWS** (account `281627750083`, profile `personal`, region `ap-south-1`):
   - Cognito user pool (self sign-up, email confirm, Google);
   - SES identity, with production access requested early because approval takes a day or more;
   - DynamoDB table `<Name>` and `<Name>-dev` (on-demand, `PK`/`SK` strings, TTL on `expiresAt`);
   - AppSync Events API (namespace `live`; API key for subscribe, IAM for publish);
   - Amplify Hosting app;
   - Budgets alert.
5. **OK to create a private GitHub repo** under `tl-tigon`.
6. **Company name and contact** for the Terms and Privacy pages.
7. **Claude Design handoff** of the UI. The owner runs `design/PROMPT.md` with `design/BRIEF.md` and `design/current-screens/` attached. The `.dc.html` that comes back is the visual authority.

## Next steps (in order, unless the owner redirects)

### 1. Phase 2: Q&A
Add slide type `qa` to `src/lib/types.ts`, with settings `moderation: boolean` and `anonymous: boolean`.

| Row | Key | Fields |
|---|---|---|
| Question | `SESS#<id>` / `QA#<slideId>#<qid>` | text, nickname or anonymous, token, status `pending\|live\|answered\|hidden`, votes, at |
| Upvote | `SESS#<id>` / `UPVOTE#<qid>#<token>` | conditional put, one per person |

Votes are counted with `ADD votes :1` after the upvote put succeeds.

**Routes:**
- audience: ask, upvote, list;
- owner: approve, hide, highlight, answered.

The highlighted question id goes in the session state, so it travels on the state channel. Each Q&A change is pushed on `/live/<id>/qa/<slideId>`.

**Screens:** the phone list with an ask box, a moderation queue in the control view, and the highlighted question on the big screen.

### 2. Phase 3: Quiz
Slide types: `quiz` (2–4 options, one correct, `seconds` 10/20/30/60) and `leaderboard`.

**Timing:**
- The question opens with `state.quiz = { slideId, openedAt (server ms), closesAt }`.
- Answers after `closesAt` are refused.
- `points = correct ? round(500 + 500 * (1 - elapsed/seconds)) : 0`, where `elapsed` is measured on the server from `openedAt`.

**Scoring:**
- Score row `SCORE#<token>`: total, plus the last question's points.
- Leaderboard: query `SCORE#` and sort. That is fine up to the 1,000-person cap.

**Control:** Start question, Reveal, Leaderboard, Next.

**Join:** a nickname is required for quiz sessions. The join route already takes one.

### 3. Phase 4: the rest of v1
- Excel export (`exceljs`).
- `/app/account`: change password; delete account, which deletes everything owned and then the Cognito user.
- Front page content, Terms and Privacy.
- The LearnBox places: the "by LearnBox" mark, the front page section, the dashboard panel and the results page panel (`design/BRIEF.md` §4F).
- TTL `expiresAt` = 12 months on session rows.

### 4. Phase 0 provisioning, on the owner's OK
Write scripts in `scripts/` (AWS CLI or SDK, in the same style as LearnBox's `scripts/create-dev-table.mjs`). Then:
- run the store tests against the dev table;
- run a load test of about 500 simulated phones.

### 5. Phase 5: apply the Claude Design handoff

## Gotchas found so far
- **PowerShell writes:** in Windows PowerShell 5.1, `Get-Content` / `Set-Content` mangle UTF-8 characters such as "·". Use the Edit/Write tools for files that contain them.
- **Screenshots:** a Playwright screenshot of a background tab can hang. Call `page.bringToFront()` first.
- **Production guards:** `next start` (production) refuses the memory store and dev sign-in by design. Use `npm run dev` (port 3200) for local walks, or set `STORE=dynamo` with real Cognito.
- **Live counts:** the counts row in DynamoDB keeps each count as a top-level attribute `c:<key>`, so `ADD` works for a word nobody has sent before.
