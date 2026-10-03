# Handoff: LearnBox Sessions (state on 2026-10-02)

Read this file, then `CLAUDE.md`, `docs/PLAN.md` and `design/slido-study/STUDY.md`.

## Where things stand

**The product was rebuilt on 2026-10-02 around Slido's event model, with a new interface.** The earlier slide-deck version (presentations, slides, a control view) is gone; its rules for counting, Q&A, quiz scoring, storage and downloads were carried over. Everything is in a local git repo only (`main`). There is no GitHub remote yet.

**What works now** (in-memory store, with development sign-in):
- **Facilitator**
  - Sign in (development: any email, no password).
  - Sessions list: new session; filter by all, live or ended; search by name or code; duplicate, results and delete on each row; the caps in use.
  - The session screen, laid out as Slido's host screen:
    - Header: back, the session's name, people joined, the code (a click copies it), Share (join link, projector link), Present, and a menu (Duplicate session, End session, Delete session).
    - Rail: the session, its results page, its settings (the two links and the Q&A settings).
    - Left: an Add button, the Q&A card, then a card for each poll, quiz and survey, then the Feedback card (or "Add feedback"). Each card has a round Start button and a menu (Move up, Move down, Duplicate, Reset results, Delete; the feedback card has no Move or Duplicate). The running card also has Hide results and Close voting.
    - Right: the open card. Add shows the seven types to pick from. A poll shows its question and options, with each option's result under it: live for the running poll, stored for any other.
    - The Q&A shows the announcement field, chips for In review, Live and Answered, and the questions as plain rows. A row's actions are round buttons that show on it: Highlight, Mark answered, Reply, and Hide under More. Reply opens the question and its replies in a panel at the side.
    - Under it, a bar: Start; or Stop with Prev, hide results, close voting and Next (Prev and Next start the neighbouring poll); the quiz's next step; for the Q&A, "Close Q&A" (asks first) or "Open Q&A". "Participant view" opens the phone's screen.
    - "Reset results" in a card's menu deletes the answers of that poll, quiz or survey, after asking. It is off while the card is running. A quiz that is reset loses its scores and can be played again.
    - Addresses: a screen's id is in the query string (`/app/session?id=…`, `/present?id=…`, `/s?c=…`), because the pages are plain files. The join link people share is `/j/<code>`, answered by the API with the session's name for chat previews (Slido's own join link previews generically).
    - Settings open in a panel down the right side: the session's links, the Q&A's two settings, a poll's settings. Ending or deleting a session, deleting a poll and closing the Q&A ask first in a dialog.
    - Edits save as they are typed.
  - Results page with CSV and Excel downloads.
  - Account page: the plan (Free, or Pro and the date it runs to), paying for Pro, and deleting the account, which removes its sessions, all their answers, its plan and its orders.
- **Plans** (2026-10-03): Free and Pro.
  - Free: 100 people and 8 polls and quizzes in a session; no surveys; no CSV or Excel download. Pro: 1,000 people; 50 polls, quizzes and surveys; surveys; downloads. Everything else, the feedback form included, is the same on both.
  - The server refuses what a plan does not hold (HTTP 402): saving a 9th poll or a survey, starting a survey, a download, the 101st person, copying a session that needs Pro.
  - On Free the facilitator sees: "Polls 3 / 8"; Survey marked Pro on the types to add (it opens the account page); "Get Pro" in place of Add when the session is full; "Downloads are on Pro" on the results page; "Full · Get Pro" beside the people count at 100.
  - Pro costs ₹79 for 1 month (30 days) or ₹588 for 12 months (₹49 a month). Each is paid once and does not renew; a second payment adds its time to the end of the first. The amount is set on the server from the period chosen.
  - Paying: the account page asks for a name and a mobile number (PayU requires both; the number is not stored), then posts to PayU's payment page. PayU sends the browser back with a signed outcome. On each load of the account page the server also asks PayU about payments whose outcome never came back.
  - When Pro ends the account is on Free again. Its sessions keep what they hold and can be edited; they take no more polls, their surveys do not start, and they cannot be copied.
  - **Run against PayU's test site** (2026-10-03) with PayU's public test key (`gtKFFx`) and test card, in three cases: a payment that succeeds (PayU's signed outcome came back and the account became Pro), one that fails (the account stayed on Free), and one that succeeds while the browser never comes back (the next load of the account page asked PayU and gave Pro). That run found one fault, now fixed and tested: when PayU adds charges for the buyer, its lookup gives the total as `amt` and the order's amount as `transaction_amount`.
    - PayU's own payment page for that public test merchant does not load (PayU's storage answers "Access Denied"), so the test card was sent with the request and PayU went straight to its test bank. The page a buyer picks a payment method on has therefore not been seen from this product.
    - **Not yet run with the owner's own keys.** The keys the owner put in `.env.local` are Live keys; PayU's test site refuses them. With them set and `PAYU_ENV` not `live`, Pay opens PayU's error page.
    - The browser walk pays on the stand-in page, which is used only when no PayU key is set: start the dev server for it with `PAYU_ENV=standin npm run dev`.
- **Q&A, open for the whole session**
  - The audience asks from a sheet (with a name; left empty, the question is anonymous if that is allowed) and upvotes, one vote per person.
  - A person can withdraw their own question while it is live or waiting for review.
  - With review on, a question waits for approval and only its asker sees it meanwhile.
  - The facilitator approves, hides, highlights, marks answered, restores and replies in writing.
  - The facilitator can close questions (upvotes stay open) and post an announcement.
- **Polls, started one at a time**
  - Multiple choice (1 to N picks), word cloud (1–3 words), rating (1 to 3/4/5/7/10 with end labels), open text (1–3 answers), ranking.
  - A choice, rating or ranking can be changed while voting is open. The facilitator can lock voting and hide results.
- **Survey**: several polls on one page, sent with one button, changeable while open.
- **AI debrief and follow-up** (2026-10-03, owner's brief): under an interaction's results on the facilitator's screen, once anyone has answered, a "Debrief" button. It gives a card, "LearnBox Debrief", with four parts: What happened, What to explore, Ask the room, Facilitator tip; "Generate another" gives a different angle. Under it, "Follow up with the room" with five modes (Explore, Probe, Challenge, Apply, Check understanding); the chosen one gives a proposed interaction (type, question, options, the correct one marked for a quiz, a one-line note) and "Launch this interaction" adds it after the current one and starts it. The last debrief of each interaction is kept, so a reload costs nothing. Rules: the model (Claude Haiku through the Anthropic API, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`) is called from the server only; it is sent labels and counts, and for written answers up to 40 texts cut to 200 characters, never a name or a token; fewer than 3 people answered, or written answers with nothing usable, are refused before any call; a failure shows "LearnBox couldn't generate this right now. Try again." and changes nothing; each account may make 6 requests a minute and, per calendar month, 30 debriefs and 15 follow-ups on Free (a "Get Pro" line) or 300 and 150 on Pro; every request is recorded with its tokens and estimated cost (`AiUse` rows under the account). With no key, development uses a stand-in that writes from the session's numbers (the walk uses it, and `x-ai-test: fail` makes it fail), and production has the feature off (the card does not appear). **Not yet run against the real API**: no key is on this machine. To try it, put `ANTHROPIC_API_KEY` in `.env.local` and restart the dev server; the unit tests cover the request and response shapes with a mocked API.
- **Feedback** (2026-10-03, owner's choices): one form per session, on Free as on Pro, outside the count of polls. Two fixed questions, a 1–5 rating of the session ("Poor" to "Excellent") and "Comments", then any questions the facilitator adds. It is started like a poll and, once started, stays open after the session ends until the session's close time (7 days after it was made): the code and the join link keep working for it, a phone that opens them sees "Session ended" and the form, and nothing else is open. The answers are the facilitator's alone: the big screen shows only that feedback is open, and phones get no counts. The facilitator sees the average and the comments on the card, running or not, and on the results page. Ending the session with the form running keeps the session's code until the close time; to close the form, stop it before ending the session.
- **Quiz**: a run of timed questions (2–4 options, one correct, 10/20/30/60 seconds).
  - Players give a name in the lobby.
  - Steps: Start quiz, Reveal answer, Leaderboard, Next question. When time is up the screen shows how people voted; Reveal marks the correct answer.
  - A correct answer earns 500 points plus up to 500 more for speed, timed on the server.
  - The phone shows correct or incorrect, points and rank; the last leaderboard ends the quiz, which is played once.
- **The site** (2026-10-02), laid out as slido.com is, studied page by page:
  - A sticky top bar with Product and Use cases menus, Pricing, Sign in and Create account. On a phone the menus open as one page.
  - Front page: the code field in a pill; the heading and one button; a moving picture of the big screen and a phone playing a poll, the Q&A, a word cloud and a quiz; where a session runs; the five parts of a session, opening one at a time beside their picture; three cards; three steps; a working example (vote on the drawn phone, the drawn big screen follows); a band with one button; a footer of links.
  - `/product` (the tour), `/features/polls`, `qa`, `word-cloud`, `quizzes`, `surveys`, `results`, `/use-cases`, `/pricing` (Free and Pro as two cards, then a table comparing them; numbers from `LIMITS`, `PLANS` and `plans.ts`).
  - Every picture is a drawing of the product's own screens in code; nothing is a photograph or a video.
  - The picture under the front page's heading tells one session as a story, as slido.com's video does: a phone scans the code and joins, votes, types and upvotes a question, sends a word, plays a quiz. The big screen and the phone move between scenes and a touch mark shows each tap (`src/components/site/hero-demo.tsx`).
  - Every other picture plays once when it is scrolled to (`play.tsx`). The working examples have a made-up audience answering alongside, and say so.
- **Audience**: joins at `/` or `/s/<code>` with no account. The phone has two tabs, Q&A and Polls; starting a poll brings the Polls tab forward, and stopping it brings the Q&A back. After a vote the options give way to the results, with "Edit response" under them. A menu holds the session's name and code, "Enter another code", a dark mode switch and "Create a session"; the profile button sets the person's name. Once a person has answered or asked, a strip at the foot of the page offers "Create a session".
- **Big screen** `/present/<id>`: join instructions with code and QR on the left; the questions or the running poll on the right. Opens on a projector that isn't signed in with `#k=<displayKey>`.
- **Fair-use caps, rate limits and the profanity filter.**

**Tests:**
- `npm test` runs 110 vitest tests: answers, cleaning, sessions, vote changes, surveys, the feedback form (`feedback.test.ts`: its fixed questions, Free, answers after the end, the code kept, the close time), the AI features (`ai.test.ts`: what the model is sent, the cache, too little data, failures, the mocked Anthropic request and its usage record, the monthly allowance and the per-minute guard, every follow-up mode launched and answered, what the model returns kept as text, and that no page or component reads the key or the prompts), views, Q&A, quiz, account deletion, downloads, plans and payments (`plans.test.ts`: what Free refuses, what happens when Pro ends, PayU's signatures, forged and repeated outcomes). Many try to break a rule (voting twice, changing a locked vote, answering a closed question, reading hidden answers). `hardening.test.ts` holds the cases found by the review below.
- The same walk passes 81 of 81 against the production shape: the built files served as a CDN would and the API running through the Lambda bundles (`npm run preview`, then `BASE=http://localhost:3300 node scripts/walk.js`).
- A browser walk passes 81 of 81 checks: `node scripts/walk.js`, with `npm run dev` running.
  - It uses playwright-core from `../LMS/Trust Sim/capture-tool/node_modules/playwright-core` with system Chrome.
  - Screenshots go to `scripts/live-walk/`, which is gitignored.
  - It runs a facilitator, the big screen (a signed-out projector with the display key) and 5 phones through the whole flow, then tries the ways around the rules: another account, the display key, a made-up phone, late and repeated answers.
  - The walk account starts on Free: the refusals are tried, a payment is failed and then paid on the stand-in payment page, and the rest runs on Pro.
  - It empties the walk account at the start and deletes it at the end.

**Reviewed for bugs and ways around the rules (2026-10-02).** Two independent reviews, one of the server and one of the screens, read the code after the rebuild. The rules held: ownership, no tokens or display key in anything sent out, quiz secrecy and timing, one vote per person. Everything they found is fixed, each with a test or a walk check:
- a changed vote after the facilitator edits the poll counted the person twice;
- counts and written answers went out on the push channel while results were hidden, and for surveys;
- an autosave could change a quiz that had just started; a quiz deleted and added again could point past its end;
- the per-address limits blocked a room behind one address, and trusted an address the caller could set;
- typed text was lost when the phone switched tabs; buttons stayed disabled after a network failure; saves could land out of order, and a second window could overwrite the first;
- iPhones zoomed on focusing a field; number fields in the editor could not be retyped;
- gaps in the DynamoDB code (rows brought back after a delete, a code claimed without its session, a leaked place in the headcount).

**Written but not yet run:**
- `src/lib/store/dynamo.ts`: the DynamoDB store, which needs the table to exist. It was rewritten for the event model along with `memory.ts`.
- `src/lib/push/server.ts` and `src/lib/push/client.ts`: AppSync Events publish and subscribe, which need the Events API.
- The Cognito sign-up, confirm, Google, change-password and delete-user flows in `src/lib/auth/client.ts`, which need the user pool.

## Decisions by the owner
- **2026-10-01**: LearnBox Sessions is LearnBox's free tool, like HubSpot's free tools. The UI must be SaaS-grade on the front page and after sign-in. Copy is plain statements.
- **2026-10-02**: the name is LearnBox Sessions, at `sessions.learnbox.one`.
- **2026-10-03**: no managed compute. The pages are plain files on a CDN and the API runs as Lambdas behind API Gateway, after a crawler flood once ran up a large bill on a managed-compute app. Keeping Lambdas warm is decided after a load test.
- **2026-10-03**: two plans, Free and Pro. Free holds 100 people and 8 polls and quizzes, with the full Q&A (first set at 200 and 10, tightened the same day); Pro adds 1,000 people, 50 items, surveys and downloads. Pro is ₹79 for 1 month or ₹588 for 12 months (owner, 2026-10-03). Payments go through the owner's PayU (India) account.
- **2026-10-03**: PayU may add its convenience fee for the buyer on top of ₹588. The PayU account's website moves from `tigon.one` to `sessions.learnbox.one`.
- **2026-10-03**: every screen has a white background, whatever the device's setting. Dark stays as the switch in the phone's menu, for the phone's screens only.
- **2026-10-02**: switch to Slido's event model, and model the interface on Slido's.
  - The interface is built here in code from `design/slido-study/STUDY.md`. This replaces the earlier rule that a Claude Design handoff was the visual authority.
  - Identity: LearnBox's forest green with Inter.
  - Extras in the first build: host replies, ranking poll, announcement.
  - The bar: well thought out, nothing buggy or glitchy, no way around a rule.

`design/PROMPT.md` and `design/BRIEF.md` describe the earlier slide-deck product for Claude Design. They are kept for their copy draft (§5) and are otherwise out of date.

## Numbers chosen with the event model (owner to confirm)
These are in `src/lib/limits.ts`.

| Limit | Value | Was |
|---|---|---|
| A session's code works for | 7 days | 24 hours |
| Live sessions per account at once | 5 | 3 |
| Sessions per account, live and ended | 100 | (50 presentations) |
| Polls, quizzes and surveys per session | 50 on Pro, 8 on Free | (50 slides) |
| People per session | 1,000 on Pro, 100 on Free | 1,000 |
| Questions per person per session | 20 | 10 per slide |
| Leaderboard rows on the big screen | 5 | 10 |

## Waiting on the owner
1. **OK to create in AWS** (account `281627750083`, profile `personal`, region `ap-south-1`):
   - Cognito user pool (self sign-up, email confirm, Google);
   - SES identity, with production access requested early because approval takes a day or more;
   - DynamoDB table and its `-dev` twin (on-demand, `PK`/`SK` strings, TTL on `expiresAt`);
   - AppSync Events API (namespace `live`; API key for subscribe, IAM for publish);
   - the CDK stack: an S3 bucket and CloudFront distribution for the built files, the HTTP API with its three Lambdas and throttling, alarms;
   - Budgets alert.
2. **OK to add the DNS record** for `sessions.learnbox.one`. It goes in the `learnbox.one` zone, which belongs to LearnBox.
3. **OK to create a private GitHub repo** under `tl-tigon`.
4. **PayU**, to switch payments on:
   - the owner's PayU account is approved for `www.tigon.one` (seen 2026-10-03), which takes no payments, so its website can be changed to `sessions.learnbox.one` (owner, 2026-10-03). Change it once that site is live with the pages PayU checks for: contact, terms, privacy and refunds. Those pages need the company's legal name, a contact address and the refund rule;
   - the keys in `.env.local` are the Live ones. Either test keys from the dashboard's Test Mode (if the account still has it), or the owner's go-ahead for `PAYU_ENV=live` and one real payment of ₹588, refunded afterwards from the dashboard;
   - a convenience fee added by PayU for the buyer is accepted (owner, 2026-10-03). If the first live payment shows one, the account page and the Pricing page must say so beside ₹588;
   - whether the account takes international cards (the price is in rupees only);
   - whether ₹588 includes GST, and who issues the invoice. Nothing here makes an invoice;
   - a card charged by itself every month needs PayU's subscriptions product and a bank mandate from the buyer; it is not built. Both periods are single payments;
   - a refund is made by hand in the PayU dashboard; Pro stays on the account until its date unless the row is changed.
5. **The site's copy**: the draft is in `src/lib/site.ts` and the pages in `src/app/(site)/`. Also for the owner: whether the Pricing page should promise the limits it lists; the line "Zoom, Teams, Meet, Webex: share the big screen's browser tab"; the use cases chosen (training, team meetings, all-hands, events, classrooms).
   - Left out until real ones exist: customer quotes, customer logos, awards.
6. **The simulations to show**, a name and one line each, for the LearnBox places (front page section, sessions list, results page).
7. **Company name and contact** for the Terms and Privacy pages.
8. **The test event in the owner's Slido account**, "Claude test - safe to delete" (#2650635), can be deleted.
9. **Copy for the owner to confirm**: "Create a session" in the phone's menu; the strip "LearnBox Sessions is free to use at your own meetings." with its "Create a session" button (it leads to `/sign-in?mode=up`); the two lines under the Q&A settings.

## Next steps
1. **Provisioning**, on the owner's OK: a CDK stack in `infra/` (as LearnBox has) with the table, the user pool, the Events API, the HTTP API and its three Lambdas from `dist/lambda/` and `routes.json`, throttling per route, reserved concurrency, the bucket and CloudFront distribution for `out/` with `/api/*` and `/j/*` forwarded to the gateway, and alarms. Then run the store tests against the dev table, and a load test of about 500 simulated phones.
2. **The rest of v1**, each waiting on the owner: the site's copy, Terms and Privacy, the LearnBox places, cost alarms.
3. **More of Slido**, if wanted: downvotes, labels, audience replies, a PowerPoint add-in.

## To check at the first deploy
- **The caller's address.** `clientIp` in `src/lib/http.ts` takes the last entry of `X-Forwarded-For`. Behind CloudFront and API Gateway that entry may be CloudFront's own address, with the viewer's before it. Confirm with one request and, if so, take the entry before last; otherwise every caller shares one limit.
- **Cookies from `learnbox.one`.** A browser sends cookies set for `.learnbox.one` to `sessions.learnbox.one` too. LearnBox Sessions sets none and reads none, but the request must still fit the host's header limit. Open the site in a browser that is signed in to LearnBox and confirm it loads.
- **Store tests against DynamoDB.** The store has never run against a real table. Run the unit tests with `STORE=dynamo` on the dev table before anything else.
- **Rows written while a session is being deleted** stay until their 12-month expiry. They belong to no session and are not reachable.

## How it is built
- **An edit and the live state.** `updateSession` saves only on the `seq` the edit was worked out against; if a control landed in between, `editSession` works the edit out again. This is what keeps an autosave from changing a quiz that has just started.
- **A change made on a screen is not undone by a reload.** `setData` from `useLive` drops any load in flight, so a reload that began before a vote, a save or a control cannot put the old data back for a moment. An upvote and the "Questions open" switch also show what was asked for until the request has landed.
- **The stored results of the open interaction.** The facilitator's screen loads with `?show=<id>`; `hostView` adds that interaction's stored counts and written answers as `shown`. The running interaction is left out: its counts come live, and an open quiz question's votes stay back.
- **The browser walk on a busy machine.** The dev server compiles routes on first use; right after a build or an edit a wait can run out. The build check (`NEXT_DIST_DIR=.next-check npx next build`) rewrites `tsconfig.json` for a moment, which makes the running dev server drop requests for a few minutes; run the walk before the build, or wait after it. The walk waits up to 30 s, and on a failure saves `scripts/live-walk/fail-<n>.png` for every screen and prints any error shown.
- **Revisions.** `Session.rev` rises with each saved edit. The facilitator's screen sends the revision its draft was made from, and a save from an older one is refused with 409 ("changed in another window"). The screen then offers a reload.
- **Counts are not written in a transaction with the answer.** A whole room writes to one counts row at once, and DynamoDB transactions on one row collide. The answer is stored first; the counts and the score follow as plain writes, tried three times (`surely` in `live.ts`). The results page and the downloads count again from the stored answers (`recount`), so they are right even if a running count drifted.
- **Hidden results stay off the push channel.** While results are hidden, and for survey polls, a tally event carries only the number who answered and is marked `withheld`; the facilitator's screen reloads to get the counts.
- **Rate limits.** Code lookups count only wrong codes per address, so a room entering the right code is never held back. Joining is limited per phone (30 a minute), with a high per-address ceiling.
- **Edits and live state are separate.** The facilitator's edits (`title`, `interactions`, `qa`) go through `PUT /api/sessions/<id>` → `editSession` → `store.updateSession`. Everything that changes live is in `state` and goes through `PATCH` → `control` → `store.setState`, which applies only on top of the `seq` it was made from. Every edit ends with a `touch` control, so phones get the active poll's new wording and a deleted active poll stops.
- **The facilitator's screen keeps its own draft.** It loads the session once, edits locally and saves 600 ms after the last change; a control (Start, Lock) saves first. The server is not asked to overwrite the draft.
- **Answers**: row `ANS#<poll>#<token>#<n>`. A first answer is a conditional put. A changed answer is `replaceAnswer`, which applies only if the stored answer is still the one the change was made from; the counts then move by the difference in one update.
- **Counts** (`TALLY#<poll>`) are running totals; the stored answers are the truth. For ranking, an option's count is its points: first place earns as many as there are options.
- **Quiz**: `state.quiz = { quizId, index, openedAt, closesAt, revealed, correct?, board }` on the server's clock; `index` -1 is the lobby. `state.played` lists finished quizzes. A quiz left midway resumes when it is started again. A quiz that has started keeps its questions against edits. Scores are in `SCORE#<quiz>#<token>`.
- **What each screen is sent**: see "Three views of a session" in `CLAUDE.md`. A quiz question's votes are sent as a count only while it is open, in full once time is up, and the correct option on Reveal.
- **Clock**: every view and state event carries the server's time; `useServerClock` keeps the difference, so a phone with a wrong clock counts down right. When a countdown reaches zero the big screen reloads to fetch the votes.
- **Q&A**: rows `QA#<qid>` (with replies) and `UPVOTE#<token>#<qid>`. Push channel `/live/<id>/qa`; every phone can read it, so a waiting or hidden question travels as id and status only.
- **Push and phones**: a phone applies pushed state without asking the server, except during a quiz, where its own answer, points and rank need a reload (after a random wait of up to 1.2 s, so a room does not ask at once). The facilitator's screen and the big screen reload on every state change; there are only a few of them.

## Gotchas found so far
- **PowerShell writes:** in Windows PowerShell 5.1, `Get-Content` / `Set-Content` mangle UTF-8 characters such as "·". Use the Edit/Write tools for files that contain them.
- **"HTTP ERROR 431" on localhost (2026-10-03).** A browser sends every cookie stored for `localhost` to every port, so cookies left by other local projects count against this server. Node refuses a request whose headers pass 16 KB. The `dev` and `start` scripts now run Node with `--max-http-header-size=65536`. This app sets no cookies.
- **Production guards:** `next start` (production) refuses the memory store and dev sign-in by design. Use `npm run dev` (port 3200) for local walks, or set `STORE=dynamo` with real Cognito.
- **Background tabs stop polling:** `useLive` polls only while the page is visible. In the walk, each screen has its own browser context so all stay in the foreground.
- **Build while the dev server runs:** `NEXT_DIST_DIR=.next-check npx next build`, then `git checkout tsconfig.json` and delete `.next-check` (the build adds that folder to `tsconfig.json`).
- **Walk right after a build or an install:** the dev server recompiles when `tsconfig.json` or `package.json` changes, and the walk's 10-second waits can time out meanwhile. Run the walk again once the server has settled.
- **The dev store across reloads:** the memory database lives on `globalThis` under a key that carries its shape's version (`__sessionsDb2` in `store/index.ts`). Change the key when the shape changes.
- **Deleting a session in DynamoDB** deletes its rows 25 to a batch, 8 batches at a time. A session with tens of thousands of rows takes several seconds; time it during the load test.
- **Live counts:** the counts row in DynamoDB keeps each count as a top-level attribute `c:<key>`, so `ADD` works for a word nobody has sent before.
- **Inter** is fetched by `next/font` at build time, so a build needs network access.
