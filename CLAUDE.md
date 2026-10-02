# LearnBox Sessions

LearnBox Sessions is a free, self-serve tool for live polls, Q&A, quizzes and surveys with any audience, like Mentimeter, Slido and Kahoot.

- **The name is always written in full** in the UI and in copy. "Sessions" alone is another company's product (sessions.us), and "session" here also means one run of a presentation.
- "Live" was the working name. It stays in the repo folder, file names, routes and channel names (`live-audience`, `src/lib/live.ts`, `/api/live`).

- **Facilitators** sign up and build presentations.
- **The audience** joins on phones with a 6-digit code and needs no account.
- **Results** update live on a presenter screen.

**It is LearnBox's free tool.** LearnBox (`../LMS`) sells simulations for corporate training; LearnBox Sessions brings facilitators to it, the way HubSpot's free tools bring people to HubSpot. It will run at `sessions.learnbox.one`.
- It is a SaaS product: the front page and every signed-in screen are finished to that standard.
- It points to LearnBox in four fixed places: the wordmark, a front page section, a dashboard panel and a results page panel (`design/BRIEF.md` §4F).

The code stays separate from LearnBox: this product has its own repo, AWS resources and deploys. Never change LearnBox from here.

**Start here:**
- `HANDOFF.md`: current state and next steps.
- `docs/PLAN.md`: the approved plan.
- `design/`: the Claude Design prompt and brief.

## Commands
- `npm run dev`: dev server on http://localhost:3200. It uses the in-memory store and development sign-in from `.env.local`.
- `npm test`: vitest, `src/**/*.test.ts`.
- `npm run typecheck`, then `npx next build`. While the dev server is running, build with `NEXT_DIST_DIR=.next-check npx next build`, then `git checkout tsconfig.json` and delete `.next-check`.
- `node scripts/walk.js`: the browser walk, with the dev server running.

## Stack and layout
- **Framework**: Next.js 15 App Router, TypeScript, React 19, plain CSS (`src/app/globals.css`, tokens only, until the Claude Design handoff). No Tailwind or UI kits.
- **Model** (`src/lib/types.ts`):
  - Presentation → slides.
  - Session = a run with a **snapshot** of the slides, a code, `state {current, showResults, locked, highlight, quiz, played, seq}` and a display key.
- **Rules**, pure and tested:
  - `src/lib/engine/`: slide cleaning, answer checks, words and profanity, Q&A rules (`questions.ts`), quiz phases, points and ranking (`quiz.ts`).
  - `src/lib/live.ts`: start, control, respond, the views for each screen, results.
  - `src/lib/qa.ts`: ask, upvote, moderate.
  - `src/lib/export.ts`: results as CSV and Excel, from the same blocks.
  - `src/lib/account.ts`: deleting everything an account owns.
- **Storage**: `src/lib/store/`, one `Store` interface with two implementations, `memory.ts` (dev and tests) and `dynamo.ts`. Both must keep the same guarantees (see `types.ts`); new storage rules get a test in `src/lib/__tests__/`.
- **Live push**:
  - `src/lib/push/`: AppSync Events, where the server publishes (IAM) and the browser subscribes (API key).
  - `src/lib/use-live.ts`: polls when push is down.
  - Channel names are in `push/events.ts`.
- **Auth**:
  - `src/lib/auth/`: Cognito ID token as a Bearer header.
  - `AUTH_MODE=dev` (with `NEXT_PUBLIC_AUTH_MODE=dev`) accepts `dev:<email>`, and is refused in production.
- **Audience identity**: a random browser token (`src/lib/audience.ts`). Server routes validate it with `isToken`.
- **Limits**: all fair-use numbers are in `src/lib/limits.ts`.

## Rules
- **Ask the owner before creating anything outside this machine**: every AWS resource, the GitHub repo and any deploy. AWS account `281627750083`, profile `personal`, region `ap-south-1`.
- **Commits**: commit at each green checkpoint. **Never add Co-Authored-By or any AI attribution** to commits or PR bodies.
- **Never commit** `.env*` files or secrets.
- **UI look comes from Claude Design.** The `.dc.html` handoff is the sole visual authority; do not hand-design screens beyond plain functional layout.
  - Use the DesignSync tool only when the owner starts `/design-sync`.
  - Get the handoff from a file or link the owner gives.
- **No invented UI copy**: no taglines, welcome lines or encouragement. Use labels, names and numbers. Buttons say what they do. Empty states show no values, not a sentence.
  - The front page and the LearnBox panels use the copy in `design/BRIEF.md` §5, which the owner approves. It is plain statements: no creative writing and no long explanation.
- **Writing style**: affirmative and concise. State what something is, not what it isn't.
- **The owner reads plans and updates in plain terms**: lead with what changes for facilitators and the audience, and keep code detail below that.
- **Numbers** (codes, counts, timers, percentages) use the tabular/mono face. One primary action per view. Dark and light themes both.
- **The server decides.** Answers, quiz timing and points are checked and timed on the server; never trust the phone.
- **The audience is sent only what it may see.** A quiz question goes out without its correct option, a waiting or hidden question as id and status only, and no response carries another person's token.
- **Every route that reads or changes a presentation or session checks ownership.** Someone else's resource returns 404, not 403.
- **Audience text** (words, open answers, nicknames, questions) goes through `cleanText` / `isProfane`, with length limits from `LIMITS`.
