# LearnBox Sessions

LearnBox Sessions is a self-serve tool for live Q&A, polls, quizzes and surveys with any audience, with a Free plan and a paid Pro plan. It follows Slido's event model and matches the quality of Slido's interface.

- **The name is always written in full** in the UI and in copy. "Sessions" alone is another company's product (sessions.us), and "session" here also means one event a facilitator runs.
- "Live" was the working name. It stays in the repo folder, file names, routes and channel names (`live-audience`, `src/lib/live.ts`, `/api/live`).

- **Facilitators** sign up and make sessions. A session has a code that works for up to 7 days.
- **The audience** joins on phones with the 6-digit code and needs no account. The phone has two tabs: Q&A, open for the whole session, and Polls, which shows whatever the facilitator has started.
- **The facilitator** starts polls, quizzes and surveys one at a time, and moderates the Q&A beside them.
- **The big screen** shows the join instructions, and the questions or the running poll.

**It is LearnBox's free tool.** LearnBox (`../LMS`) sells simulations for corporate training; LearnBox Sessions brings facilitators to it, the way HubSpot's free tools bring people to HubSpot. It will run at `sessions.learnbox.one`.

The code stays separate from LearnBox: this product has its own repo, AWS resources and deploys. Never change LearnBox from here.

**Start here:**
- `HANDOFF.md`: current state and next steps.
- `docs/PLAN.md`: the plan and its phases.
- `design/slido-study/STUDY.md`: what the interface is modelled on, with measurements and reference screenshots.

## Commands
- `npm run dev`: dev server on http://localhost:3200. It uses the in-memory store and development sign-in from `.env.local`.
- `npm test`: vitest, `src/**/*.test.ts`.
- `npm run typecheck`, then `npx next build`. While the dev server is running, build with `NEXT_DIST_DIR=.next-check npx next build`, then `git checkout tsconfig.json` and delete `.next-check`.
- `node scripts/walk.js`: the browser walk, with the dev server running.

## Stack and layout
- **Framework**: Next.js 15 App Router, TypeScript, React 19, plain CSS (`src/app/globals.css`), Inter through `next/font`. No Tailwind or UI kits.
- **Model** (`src/lib/types.ts`):
  - Session = an event with a code, Q&A settings, a list of interactions, a `state` and a display key.
  - Interaction = a poll (`choice`, `wordcloud`, `rating`, `open`, `ranking`), a quiz (a run of timed questions) or a survey (several polls sent together). Interactions are edited in place while the session runs.
  - `state {active, showResults, locked, qaOpen, announcement, highlight, quiz, played, seq}`: everything that changes live. `active` is the interaction the facilitator has started.
- **Rules**, pure and tested:
  - `src/lib/engine/`: cleaning interactions (`polls.ts`), answer checks and vote changes (`answers.ts`), words and profanity, Q&A rules (`questions.ts`), quiz phases, points and ranking (`quiz.ts`).
  - `src/lib/live.ts`: create, edit, control, respond, the views for each screen, results.
  - `src/lib/qa.ts`: ask, upvote, moderate, reply.
  - `src/lib/export.ts`: results as CSV and Excel, from the same blocks.
  - `src/lib/account.ts`: deleting everything an account owns.
- **Storage**: `src/lib/store/`, one `Store` interface with two implementations, `memory.ts` (dev and tests) and `dynamo.ts`. Both must keep the same guarantees (see `types.ts`); new storage rules get a test in `src/lib/__tests__/`.
- **Screens**:
  - `/` front page with the code field; `/s/<code>` the phone;
  - the site, in `src/app/(site)/` under one top bar and footer: `/`, `/product`, `/features/<slug>` (polls, qa, word-cloud, quizzes, surveys, results), `/use-cases`, `/pricing`. What its pages say is in `src/lib/site.ts`; its pictures are drawings of the product's screens in `src/components/site/`;
  - `/app` the facilitator's sessions; `/app/sessions/<id>` the facilitator's screen; `/app/sessions/<id>/results`; `/app/account`;
  - `/present/<id>` the big screen, also opened on a projector with `#k=<displayKey>`.
- **Three views of a session** (`live.ts`): `audienceView` for a phone, `wallView` for the big screen, `hostView` for the facilitator. Only `hostView` holds questions waiting for review, every poll's answered count and the display key. With `?show=<id>` it also carries the stored results of the interaction open on the facilitator's screen, unless that one is running.
- **Live push**:
  - `src/lib/push/`: AppSync Events, where the server publishes (IAM) and the browser subscribes (API key).
  - `src/lib/use-live.ts`: polls when push is down. `src/lib/use-host.ts`: the facilitator's and the big screen's data.
  - Channel names are in `push/events.ts`.
- **Auth**:
  - `src/lib/auth/`: Cognito ID token as a Bearer header. `src/lib/owner.ts`: the ownership check every facilitator route uses.
  - `AUTH_MODE=dev` (with `NEXT_PUBLIC_AUTH_MODE=dev`) accepts `dev:<email>`, and is refused in production.
- **Audience identity**: a random browser token (`src/lib/audience.ts`). Server routes validate it with `isToken`.
- **Limits**: all fair-use numbers are in `src/lib/limits.ts`.
- **Plans** (owner's decision, 2026-10-03): Free and Pro.
  - `PLANS` in `limits.ts` holds what differs: Free has 100 people and 8 polls and quizzes in a session; Pro has 1,000 people, 50 polls, quizzes and surveys, surveys, and the CSV and Excel downloads.
  - `src/lib/plans.ts`: the price in `PRO_OPTIONS` (₹79 for 1 month or ₹588 for 12 months, each paid once, no renewal) and `planOf`, which every check reads. An account is on Pro until `proUntil`; with nothing stored it is on Free.
  - A plan refuses with HTTP 402. When Pro ends, a session keeps what it holds and takes no more; its surveys do not start.
  - `src/lib/billing/`: PayU's hosted checkout. An order is written, the browser posts a signed form to PayU, and PayU's signed outcome comes back to `/api/billing/return`. With no `PAYU_KEY`, or with `PAYU_ENV=standin`, development uses a stand-in payment page (`/api/billing/dev-gateway`) and production has payments off.

## Rules
- **Ask the owner before creating anything outside this machine**: every AWS resource, the GitHub repo and any deploy. AWS account `281627750083`, profile `personal`, region `ap-south-1`.
- **Commits**: commit at each green checkpoint. **Never add Co-Authored-By or any AI attribution** to commits or PR bodies.
- **Never commit** `.env*` files or secrets.
- **The interface follows `design/slido-study/STUDY.md`** (owner's decision, 2026-10-02). It is built here in code.
  - One accent, LearnBox's forest green. One typeface, Inter, at 14px and 12px. White cards with a hairline border and no shadow. One full-width primary action per phone screen.
  - The site uses larger type (64px and 40px headings, 16px to 20px text) in `src/app/(site)/site.css`; its layout follows slido.com.
  - The facilitator's screen follows Slido's host screen: a header, a rail, a list of cards, the open card with its results under each option, and a bar that starts and stops it.
  - Screenshots of the owner's Slido account hold their clients' names. They stay in `.playwright-mcp/` (ignored by git) and never go into the repo.
  - Slido's name, wordmark, exact green, images and wording are never used.
  - Every colour is a token in `globals.css`.
  - **Every screen is light** (owner's decision, 2026-10-03), whatever the device's own setting. Dark is a choice a person makes in the phone's menu, and it applies to the phone's screens only.
- **It must work cleanly.** The owner's bar: nothing clunky, buggy or glitchy, and no way around a rule. A rule is enforced on the server and has a test that tries to break it; a flow is checked in the browser walk.
- **No invented UI copy**: no taglines, welcome lines or encouragement. Use labels, names and numbers. Buttons say what they do. A state with nothing to show uses a short label ("No active poll", "Questions closed").
  - The site's copy (`src/lib/site.ts` and the pages in `src/app/(site)/`) is a draft the owner edits. It is plain statements: no creative writing and no long explanation. Every statement about the product is true of the code, and its numbers come from `LIMITS`.
  - The site has no awards, customer quotes or customer logos until real ones exist, and names other tools only to say a browser tab can be shared in them.
  - Where the site mentions something only Pro has (surveys, downloads, 1,000 people), it says "on Pro".
- **Writing style**: affirmative and concise. State what something is, not what it isn't.
- **The owner reads plans and updates in plain terms**: lead with what changes for facilitators and the audience, and keep code detail below that.
- **Numbers** (codes, counts, timers, percentages) use tabular figures (`.num`).
- **The server decides.** Answers, vote changes, quiz timing and points are checked and timed on the server; never trust the phone.
- **A plan's limits are checked on the server** (`planOf`), never only hidden in the interface.
- **A payment is believed only when PayU signed it**, it names an order of that account, and it is for that order's amount. An order gives Pro once, however many times it is reported. The PayU key and salt live in the environment and are never committed.
- **The audience is sent only what it may see.** A quiz question goes out without its correct option, its votes stay back until time is up, a waiting or hidden question travels as id and status only, and no response carries another person's token or the display key.
- **Every route that reads or changes a session checks ownership** through `ownedSession`. Someone else's session returns 404, not 403. The display key reads the big screen's view and nothing else.
- **Audience text** (words, open answers, names, questions) goes through `cleanText` / `isProfane`, with length limits from `LIMITS`.
