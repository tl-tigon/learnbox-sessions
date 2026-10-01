# Live: plan (approved by the owner on 2026-10-01)

## In plain terms

Live is a free product that anyone can sign up for. Facilitators use it with any audience, in a room or on a call.

**Facilitators**
- Sign up with email (confirmed by a code) or with Google. There are no plans, payments or invitations.
- Build reusable presentations of interactive slides.
- Start a session. The audience joins by phone with a 6-digit code or a QR code, with no account and no app.
- Run it from a presenter screen (projector) and a control view (laptop or phone). They can move between slides, show or hide results, close answers and moderate Q&A.
- Afterwards, see the results and download them (CSV or Excel).

**What the audience can do (v1)**
- **Polls**: multiple choice, word cloud, rating and open text. Results update live.
- **Q&A**: ask questions, upvote, and ask anonymously if allowed. The facilitator approves, highlights, marks answered or hides.
- **Quiz**: timed questions, points for correct and fast answers, a leaderboard and a podium. Players enter a nickname.
- **Survey**: self-paced. The audience goes through the slides at its own pace.

**Because it is free and open, it also needs**
- a front page, Terms and Privacy pages;
- account settings, including deleting the account;
- fair-use limits and cost alarms.

**Later:** a PowerPoint add-in that puts a live question inside a slide.

**Separate from LearnBox.** Live has its own repo, domain, logins, database and deploys. The quiz uses points and a leaderboard by the owner's choice, and LearnBox's no-gamification rule does not apply here.

## Approach

### Stack
- **App**: Next.js 15 App Router and TypeScript, one app.
- **Hosting**: its own AWS Amplify Hosting app. Pushing `main` deploys once it is connected.
- **Facilitator sign-in**: Cognito, with self sign-up on, email confirmation and Google. Email goes through SES, because Cognito's built-in email is capped at about 50 a day; SES production access must be requested.
- **Bot protection**: Cloudflare Turnstile checked in a pre-sign-up Lambda, plus a block on throwaway email domains.
- **Audience**: anonymous. Each phone keeps a random token in the browser and can give an optional nickname.
- **Data**: DynamoDB (on-demand), one table plus a `-dev` twin. Key layout is in `src/lib/store/dynamo.ts`.
- **Live push**: AWS AppSync Events.
  - Only the server publishes, signed with IAM; browsers subscribe with an API key.
  - Polling is the fallback. Screens poll every 1.5 s when push is down, and every 5–15 s as a safety net when it is up.

### How a vote flows
1. The phone POSTs to `/api/live/<id>/answer`.
2. The server checks that the session is live, the presenter is on that slide and answers are open.
3. The answer is written with a conditional put: one per token per slide entry.
4. The slide's counts go up by one in a single `UpdateItem`.
5. The new counts are published to `/live/<id>/tally/<slideId>`.

Presenter moves carry a rising `seq`, and a stale one is ignored. The quiz timer and points use the **server** clock.

Counts are a fast running total. The stored answers are the source of truth, and the results page and export are built from them.

### Fair use (`src/lib/limits.ts`)
| Limit | Value |
|---|---|
| People per session | 1,000 |
| Live sessions per account at once | 3 |
| Presentations per account | 50 |
| Slides per presentation | 50 |
| Session lifetime | Closes itself after 24 h |

Also:
- rate limits on joining, code lookups and answers;
- a profanity filter;
- an AWS Budgets alert and an alarm on the AppSync message count, with a switch (`PUSH_OFF=1`) that falls back to polling;
- answers deleted after 12 months using TTL;
- deleting an account removes all of its data.

## Phases

| # | What | Status |
|---|---|---|
| 0 | Name and domain; AWS setup: Cognito pool (self sign-up, Google, SES), table and dev table, AppSync Events API, Amplify app, budget alert; private GitHub repo. **Each needs the owner's OK.** Claude Design brief. | Brief done (`design/`); AWS and GitHub not started |
| 1 | Engine and polls: presentations, sessions, code and QR, join, live push, the four poll types plus heading; presenter screen and control view; survey mode; results page and CSV | **Built and tested** (commit 165f5be) |
| 2 | Q&A: ask, upvote, anonymous, moderation, highlight | Next |
| 3 | Quiz: timed questions, server-timed points, leaderboard, podium | — |
| 4 | Results in Excel; account settings and delete; front page; Terms and Privacy; cost alarms | — |
| 5 | Apply the Claude Design handoff to every screen, in dark and light, at phone, laptop and projector sizes | Waiting on the design |
| 6 | PowerPoint add-in (Office web add-in, content add-in in slideshow, task pane) | Later, with its own plan |

## Verification
- **Vitest**:
  - one answer per token under concurrent sends;
  - counts equal the stored answers;
  - quiz points use server time;
  - code collisions;
  - locked or closed slides refuse answers;
  - stale `seq` is dropped.
- **Browser walk** (playwright-core), with a facilitator, the big screen and 5 phones:
  - every slide type;
  - results hidden and shown;
  - lock;
  - end;
  - CSV;
  - survey;
  - another account blocked;
  - no page errors.
- **Load test** on dev: about 500 simulated phones vote within 10 s. No vote may be lost, and the time from vote to screen must stay under about 1 s.
- **Screenshots** in dark and light at phone and 1920×1080, sent to the owner before any deploy.
