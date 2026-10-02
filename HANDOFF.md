# Handoff: LearnBox Sessions (state on 2026-10-02)

This continues the work started in the LearnBox session. Read this file, then `CLAUDE.md` and `docs/PLAN.md`.

## Where things stand

**Phases 1 (polls) and 2 (Q&A) are built and tested.** They are in a local git repo only (`main`). There is no GitHub remote yet.

**What works now** (in-memory store, with development sign-in):
- **Facilitator**:
  - sign in (development: any email, no password);
  - dashboard;
  - presentation editor with autosave;
  - Present, or Run as survey.
- **Slide types**: multiple choice (1 to N picks), word cloud (1–3 words, normalised and profanity-filtered), rating (1–3/4/5/7/10 with end labels), open text (1–3 answers), Q&A, heading.
- **Q&A**:
  - the audience asks questions (with a name, or anonymously if the slide allows it) and upvotes, one vote per person;
  - with moderation on, a question waits for the facilitator's approval and only its asker sees it meanwhile;
  - the control view has the queue: Approve, Hide, Highlight, Mark answered, sorted Top or Recent;
  - the big screen shows the highlighted question large and the top questions with votes;
  - the results page and the CSV list every question with its votes and status.
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
- `npm test` runs 24 vitest tests (engine, store guarantees, views, Q&A).
- A browser walk passed 27 of 27 checks: `node scripts/walk.js`, with `npm run dev` running.
  - It uses playwright-core from `../LMS/Trust Sim/capture-tool/node_modules/playwright-core` with system Chrome.
  - Screenshots go to `scripts/live-walk/`, which is gitignored.
  - It covered a facilitator, the big screen (as a signed-out projector with the display key) and 5 phones; every slide type; hide and show results; lock; a moderated Q&A; end; CSV; survey; and checks that another account is blocked.

**Written but not yet run:**
- `src/lib/store/dynamo.ts`: the DynamoDB store, which needs the table to exist.
- `src/lib/push/server.ts` and `src/lib/push/client.ts`: AppSync Events publish and subscribe, which need the Events API.
- The Cognito sign-up, confirm and Google flows in `src/lib/auth/client.ts` and `src/app/sign-in/page.tsx`, which need the user pool.

## Direction set by the owner on 2026-10-01
- **The name is LearnBox Sessions** (chosen 2026-10-02), always written in full. "Live" was the working name and stays in the repo folder, file names and routes.
- **It is LearnBox's free tool**, like HubSpot's free tools beside its main product. It brings facilitators to the simulation business.
- **The UI must be SaaS-grade**, on the front page and on every screen after sign-in.
- **Claude Design produces the look.** `design/PROMPT.md` and `design/BRIEF.md` were rewritten for this: the quality bar (§2), a full front page (§4A.1), an app shell with dashboard and editor (§4E), the four places LearnBox appears (§4F) and the draft copy (§5).
- **Copy**: drafted here, approved by the owner. Plain statements, no creative writing, no long explanation.
- **Domain**: `sessions.learnbox.one`.

## Waiting on the owner
1. **OK to add the DNS record** for `sessions.learnbox.one`. It goes in the `learnbox.one` zone, which belongs to LearnBox.
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

### 1. Phase 3: Quiz
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

### 2. Phase 4: the rest of v1
- Excel export (`exceljs`).
- `/app/account`: change password; delete account, which deletes everything owned and then the Cognito user.
- Front page content, Terms and Privacy.
- The LearnBox places: the wordmark, the front page section, the dashboard panel and the results page panel (`design/BRIEF.md` §4F).
- TTL `expiresAt` = 12 months on session rows.

### 3. Phase 0 provisioning, on the owner's OK
Write scripts in `scripts/` (AWS CLI or SDK, in the same style as LearnBox's `scripts/create-dev-table.mjs`). Then:
- run the store tests against the dev table;
- run a load test of about 500 simulated phones.

### 4. Phase 5: apply the Claude Design handoff

## How Q&A is built (Phase 2)
- **Rules**: `src/lib/engine/questions.ts` (checks, what a screen may see, ordering) and `src/lib/qa.ts` (ask, upvote, moderate).
- **Rows**: question `SESS#<id>` / `QA#<slideId>#<qid>`; upvote `SESS#<id>` / `UPVOTE#<token>#<qid>` (token first, so one query lists a person's votes). The vote count goes up only when the upvote row is new.
- **Routes**: audience `GET`/`POST /api/live/<id>/qa/<slideId>` and `POST …/<qid>/vote`; owner `PATCH /api/sessions/<id>/qa/<slideId>/<qid>`.
- **Push**: `/live/<id>/qa/<slideId>`. Every phone can read it, so a waiting or hidden question travels as id and status only; the control view reloads to fetch a waiting one.
- **Highlight**: `state.highlight` in the session state. It clears on a slide move, and when the question is hidden or marked answered.
- **Limits**: 280 characters, 10 questions per person per slide, 500 per slide (`LIMITS`).

## Gotchas found so far
- **PowerShell writes:** in Windows PowerShell 5.1, `Get-Content` / `Set-Content` mangle UTF-8 characters such as "·". Use the Edit/Write tools for files that contain them.
- **Screenshots:** a Playwright screenshot of a background tab can hang. Call `page.bringToFront()` first.
- **Production guards:** `next start` (production) refuses the memory store and dev sign-in by design. Use `npm run dev` (port 3200) for local walks, or set `STORE=dynamo` with real Cognito.
- **Background tabs stop polling:** `useLive` polls only while the page is visible. In the walk, each screen has its own browser context so all stay in the foreground; `bringToFront()` on one page puts the others in its context in the background.
- **Build while the dev server runs:** `NEXT_DIST_DIR=.next-check npx next build`, then `git checkout tsconfig.json` and delete `.next-check` (the build adds that folder to `tsconfig.json`).
- **Stale sessions in dev:** a walk that fails midway leaves a live session, and three live sessions block the next walk. End them from the dashboard, or restart the dev server.
- **Live counts:** the counts row in DynamoDB keeps each count as a top-level attribute `c:<key>`, so `ADD` works for a word nobody has sent before.
