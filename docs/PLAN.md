# LearnBox Sessions: plan

- **2026-10-01**: the owner approved the first plan, a slide-deck product under the working name "Live".
- **2026-10-02**: the owner chose the name LearnBox Sessions, then switched the product to Slido's event model with an interface modelled on Slido's. This file describes the product as it is now.

## In plain terms

LearnBox Sessions is a product anyone can sign up for, free, with a paid Pro plan for larger sessions (2026-10-03). Facilitators use it with any audience, in a room or on a call.

**Facilitators**
- Sign up with email (confirmed by a code) or with Google. Every account starts on Free. Pro is ₹79 for 1 month or ₹588 for 12 months, each paid once through PayU, and adds 1,000 people, 50 polls, surveys and downloads.
- Make a session. Its 6-digit code works for up to 7 days.
- Add polls, quizzes and surveys to it, before or during the session.
- Run it from the session screen (laptop or phone): start one poll at a time, lock voting, show or hide results, and moderate the Q&A beside it.
- Show the big screen on a projector or a shared screen.
- Afterwards, see the results and download them (CSV or Excel), and duplicate the session to run it again.

**The audience**
- Joins by phone with the code or a QR code, with no account and no app.
- **Q&A**, open for the whole session: ask questions, upvote, ask anonymously if allowed, and read the facilitator's replies.
- **Polls**: multiple choice, word cloud, rating, open text and ranking. A vote can be changed while voting is open.
- **Quiz**: timed questions, points for correct and fast answers, and a leaderboard. Players give a name.
- **Survey**: several questions on one page, sent together.

**Because it is free and open, it also needs**
- a front page, Terms and Privacy pages;
- account settings, including deleting the account;
- fair-use limits and cost alarms.

**Later:** a PowerPoint add-in that puts a live question inside a slide.

**LearnBox's free tool.** It brings facilitators to LearnBox's simulation business, the way HubSpot's free tools bring people to HubSpot.
- It runs at `sessions.learnbox.one`.
- The front page and every signed-in screen are finished to SaaS standard.
- It points to LearnBox in the wordmark, and in three places still to build: a front page section, a panel on the sessions list and a panel on the results page.

**Built separately from LearnBox.** It has its own repo, logins, database and deploys. The quiz uses points and a leaderboard by the owner's choice, and LearnBox's no-gamification rule does not apply here.

## Approach

### Stack
- **App**: Next.js 15 App Router and TypeScript, one app.
- **Hosting**: its own AWS Amplify Hosting app. Pushing `main` deploys once it is connected.
- **Facilitator sign-in**: Cognito, with self sign-up on, email confirmation and Google. Email goes through SES, because Cognito's built-in email is capped at about 50 a day; SES production access must be requested.
- **Bot protection**: Cloudflare Turnstile checked in a pre-sign-up Lambda, plus a block on throwaway email domains.
- **Audience**: anonymous. Each phone keeps a random token in the browser and can give a name.
- **Data**: DynamoDB (on-demand), one table plus a `-dev` twin. Key layout is in `src/lib/store/dynamo.ts`.
- **Live push**: AWS AppSync Events.
  - Only the server publishes, signed with IAM; browsers subscribe with an API key.
  - Polling is the fallback. Screens poll every 1.5 s when push is down, and every 5–15 s as a safety net when it is up.

### How a vote flows
1. The phone POSTs to `/api/live/<id>/answer`.
2. The server checks that the session is live, that this poll is the one started, and that voting is open.
3. A first answer is written with a conditional put: one per token per poll entry. A changed answer replaces the old one only if the old one is still what the change was made from.
4. The poll's counts move in a single `UpdateItem`.
5. The new counts are published to `/live/<id>/tally/<pollId>`.

Controls carry a rising `seq`, and a stale one is ignored. The quiz timer and points use the **server** clock.

Counts are a fast running total. The stored answers are the source of truth.

### Fair use (`src/lib/limits.ts`)
| Limit | Value |
|---|---|
| People per session | 1,000 on Pro, 200 on Free |
| Live sessions per account at once | 5 |
| Sessions per account | 100 |
| Polls, quizzes and surveys per session | 50 on Pro, 10 on Free (no surveys on Free) |
| A session's code works for | 7 days |

Also:
- rate limits on joining, code lookups, answers, questions and votes;
- a profanity filter;
- an AWS Budgets alert and an alarm on the AppSync message count, with a switch (`PUSH_OFF=1`) that falls back to polling;
- answers deleted after 12 months using TTL;
- deleting an account removes all of its data.

## Phases

| # | What | Status |
|---|---|---|
| 0 | AWS setup: Cognito pool (self sign-up, Google, SES), table and dev table, AppSync Events API, Amplify app, budget alert; DNS for `sessions.learnbox.one`; private GitHub repo. **Each needs the owner's OK.** | Not started |
| 1–3 | The first build: a slide deck with polls, Q&A and quiz | Built 2026-10-01 to 02, then replaced by the event model |
| 4 | Results in Excel; account delete; 12-month expiry | **Built and tested** |
| 5 | The event model: sessions as events, always-open Q&A, polls started one at a time, vote changes, ranking, surveys, quiz runs, replies, announcement, duplicate | **Built and tested** (2026-10-02) |
| 6 | The interface, modelled on Slido's (`design/slido-study/STUDY.md`), in LearnBox green with Inter | **Built** (2026-10-02). The facilitator's and the participant's screens follow Slido's own, run from both sides in a test event in the owner's account |
| 7 | The site: front page, product tour, six product pages, use cases, pricing | **Built** (2026-10-02), laid out as slido.com is; its copy is a draft |
| 7b | Plans: Free and Pro, the limits checked on the server, the Pricing page, paying through PayU | **Built and tested** (2026-10-03). Paid, failed and never-returned payments were run on PayU's test site with PayU's public test key. Waiting on the owner: a payment with their own keys, and PayU's approval of `sessions.learnbox.one` |
| 8 | The site's copy approved; the LearnBox places; Terms and Privacy; cost alarms | Waiting on the owner |
| 9 | PowerPoint add-in (Office web add-in, content add-in in slideshow, task pane) | Later, with its own plan |

## Verification
- **Vitest** (64 tests):
  - one answer per token under concurrent sends, and a changed vote that keeps the counts adding up;
  - answers only for the poll that is started; locked voting and ended sessions refuse them;
  - a survey checked whole before anything is stored;
  - quiz points use server time; the correct answer and the votes stay back until their moment; a quiz is played once;
  - Q&A: one upvote per person; a waiting question seen only by its asker and the facilitator;
  - code collisions; stale `seq` is dropped;
  - deleting an account; CSV and Excel.
- **Browser walk** (playwright-core, 67 checks), with a facilitator, the big screen as a signed-out projector and 5 phones: the whole flow, then the ways around the rules that must be refused.
- **Load test** on dev: about 500 simulated phones vote within 10 s. No vote may be lost, and the time from vote to screen must stay under about 1 s.
- **Screenshots** in dark and light at phone and 1920×1080, sent to the owner before any deploy.
