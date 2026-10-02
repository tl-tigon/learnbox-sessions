# LearnBox Sessions: design brief

> **Out of date since 2026-10-02.** This brief describes the earlier slide-deck product, written for a Claude Design handoff. The product now follows Slido's event model and its interface is built in code from `slido-study/STUDY.md`. The copy draft in §5 is still the source for the front page wording.

The product is **LearnBox Sessions**. Always write the name in full: the wordmark, the page titles and the copy never shorten it to "Sessions". It runs at `sessions.learnbox.one`.

## 1. What the product is

LearnBox Sessions is a free, self-serve tool for running polls, Q&A, quizzes and surveys with an audience. It is in the same space as Mentimeter, Slido and Kahoot.

- **Facilitators** are trainers, L&D managers, teachers and speakers. They sign up, build a presentation of interactive slides, and run it as a live session.
- **The audience** joins on their phones with a 6-digit code or a QR code. They need no account and no app.
- **Results** appear live on the big screen as people answer.

**LearnBox Sessions is made by LearnBox.** LearnBox makes simulations for corporate training, and that is the paid business. LearnBox Sessions is its free tool, in the way HubSpot offers free tools beside its main product. It has two jobs:

1. Be a product facilitators choose over Mentimeter or Slido on its own merit.
2. Show those facilitators that LearnBox exists, in a few fixed places (§4F).

There are three places the product is seen, and each needs to work well:

| Place | Device | Seen by | Distance |
|---|---|---|---|
| Audience | Phone, 390px wide (also works on a laptop) | Everyone in the room or on the call | In hand |
| Presenter screen | Projector or shared screen, 1920×1080 and 1366×768 | The whole room | 3–20 metres |
| Front page, facilitator app and control view | Laptop 1366×768 and phone 390px | The facilitator | Desk |

## 2. The quality bar

LearnBox Sessions is a SaaS product and is the first thing a facilitator sees of LearnBox. Every screen is finished to the standard of the signed-in apps of Mentimeter, Slido and Typeform. This applies equally to the front page and to every screen after sign-in.

- **Front page**: a full product page (§4A.1). Its visuals are the real product screens from this brief (presenter screen, phone, control view) with the §6 data. Use product screens, in place of illustrations or stock images.
- **Facilitator app**: one consistent app shell (§4E.22) across dashboard, results and account. Presentations show a thumbnail of their first slide. The editor is built around a live preview.
- **Every app screen** has its loading, saving, empty and error states drawn.
- **Every screen** is drawn at laptop and phone width, in dark and light.

`current-screens/` shows the working app today. Those screens are plain on purpose. They show what each screen holds; the layout and the look are yours to replace.

## 3. The visual system

LearnBox Sessions has its **own** visual system. Its wordmark carries the LearnBox name (§4F), and it otherwise stands as its own product. Please define:

- **Colour tokens** as CSS custom properties in one `:root` block, with both a **dark** and a **light** theme.
  - Name the roles: background, surface, raised surface, line, text, muted text, accent, accent ink, danger, success, and the chart series.
  - The presenter screen must read clearly on a washed-out projector. Choose contrast for that, not only for a monitor.
- **Chart palette**: up to 10 series for multiple-choice bars. It must be colour-blind safe, and each bar is also labelled, so colour is never the only cue.
- **Type**: one family for text and one tabular or mono face for numbers (codes, counts, timers, percentages).
  - The big screen needs a scale that is legible from 20 metres: question titles about 56–72px at 1920 wide, and option labels at least 28px.
- **Radius, spacing and motion.**
  - Results animate as counts change: bars grow and words in the cloud resize smoothly.
  - Reduced motion must be respected.
- **The QR code** is always black on white for camera reliability. Frame it; never recolour it.
- **An icon for each slide type** (eight types, §4E.23), used in the editor, the dashboard and the front page.

**Rules from the owner:**
- **Copy.**
  - The front page and the LearnBox panels use the copy in §5, as written. Add no other copy.
  - Every other screen uses labels, names and numbers only.
  - Buttons say what they do: "Join", "Submit", "Next", "Present", "Download CSV".
  - Empty states show no values rather than a sentence.
- **One primary action per view.**
- **Tap targets of at least 44px on phones.**
- **No generic AI look:** no purple gradients, glassmorphism, or three equal cards in a row.

## 4. Screens and every state to draw

### A. Public

**1. Front page (`/`)**

Two kinds of visitor arrive here: an audience member holding a code, and a facilitator deciding whether to sign up. Both find their action without scrolling, at phone and laptop width.

- **Header**: the wordmark; a join-by-code field; Sign in; Create account.
- **Top section**: the headline and line from §5, the primary action "Create free account", and the product shown running: the presenter screen with live results and a phone answering.
- **Slide types**: Multiple choice, Word cloud, Rating, Open text, Q&A, Quiz, Survey. Each has its icon, its line from §5 and a small view of its result on the presenter screen.
- **How it works**: the four steps in §5, each with the product screen it refers to.
- **What an account includes**: the numbers in §5.
- **LearnBox section**: see §4F.
- **Footer**: Terms, Privacy, LearnBox, contact email.
- States: join field error ("No session with that code"), signed-in visitor (the header shows "Open dashboard" in place of Sign in and Create account).

**2. Sign in / Create account**
- Email and password, plus a "Continue with Google" button.
- States:
  - sign in;
  - create account (password rule: 8 or more characters, with a number);
  - confirm email (6-digit code, resend);
  - forgot password (send code);
  - reset password (code and new password);
  - error (wrong password, code expired);
  - busy.

**3. Terms and Privacy**
- A long-text reading layout.

### B. Audience: phone

Every audience screen carries the wordmark, small, at the foot (§4F).

**4. Joining**
- Code entry with large digits.
- Joining in progress.
- Errors: No session with that code / This session is full / This session has ended / Too many tries.

**5. Nickname**
- Required for quiz, optional for Q&A.
- Error: Choose another name (blocked word).

**6. Heading slide**
- A heading and up to 1000 characters of text.

**7. Answer forms**, each with these states: unanswered, choosing, sending, sent, error, answers closed.
- **Multiple choice**: single pick, and "Pick up to 3" multi-pick. Up to 10 options, each up to 80 characters.
- **Word cloud**: one word at a time, showing "1 / 3" sent; error "That word is blocked".
- **Rating**: a 1–5 or 1–10 scale with end labels (for example 1 · Poor, 5 · Excellent).
- **Open text**: up to 280 characters, one to three answers allowed.
- After sending: results shown (the same chart as the big screen, phone-sized) or results hidden.
- Header on every slide: the session title, and "3 / 8" progress.

**8. Q&A**
- An ask box with an "Ask anonymously" toggle.
- The list, sorted Top or Recent, with an upvote on each and an upvote count.
- Each question shows its asker's name or "Anonymous".
- States:
  - my question waiting for approval (when moderation is on);
  - highlighted (the presenter is answering it now);
  - answered;
  - empty list.

**9. Quiz**
- Lobby showing my nickname and the number of players.
- Question with:
  - a countdown;
  - 2–4 answer buttons, which must be distinguishable by shape or letter as well as colour;
  - locked once answered.
- Waiting for others.
- Result: correct or incorrect, points earned, total, and my rank.
- Final: my place, my points, and the top 3.

**10. Survey (self-paced)**
- Progress "4 / 8", Back and Next.
- An answered slide shows "Sent" when revisited.
- End of survey.

**11. Session ended**

### C. Presenter screen (1920×1080 and 1366×768)

**12. Join splash**
- A large QR code, the URL (`sessions.learnbox.one/123456`), the code split as `954 152`, the session title, and the number of people joined (live).

**13. Join bar**
- Kept small on every slide: URL, code, people joined, a small QR code, and the wordmark.

**14. Results for each type**, live:
- **Multiple choice**: horizontal bars with label, count and %.
- **Rating**: the average, large (4.2 / 5), plus the distribution.
- **Word cloud**: up to 80 words sized by count.
- **Open text**: a wall of answer cards that keeps working at 300+ answers. Newest arrive smoothly, and older ones may scroll or fade.
- **Heading** slide.
- Footer: "5 answered" and "Answers closed".
- **Results hidden** state: the question and answered count only.

**15. Q&A**
- The highlighted question very large, with the top questions listed beside or below it and their vote counts.

**16. Quiz**
- Question with a countdown and an answered count.
- Reveal: the correct answer marked, with the spread of answers.
- Leaderboard: top 10 with points, and the rise or fall since the last question.
- Podium: top 3.

**17. Session ended**

### D. Control view: the presenter's remote (laptop 1366×768 and phone 390)

**18. Running a presenter-paced session**
- The current slide with its live results.
- Previous / Next (arrow keys also work), with "3 / 8".
- Results shown or hidden, and Close answers / Answers closed.
- The list of all slides, to jump to any one.
- Header:
  - code, people joined;
  - Open screen, Copy projector link;
  - End session (with a confirm: "End this session? People can no longer answer.").
- Errors: Not applied / The session has ended.

**19. Q&A moderation**
- A queue of questions waiting, with Approve and Hide.
- Approved questions with Highlight, Mark answered and Hide.
- Sort by Top or Recent.

**20. Quiz controls**
- Start question, the timer running, Reveal, Leaderboard, Next.

**21. Survey session**
- People joined, a live answered count per slide, and a link to Results.

### E. Facilitator app (laptop 1366×768; must also work at phone width)

**22. App shell and dashboard**

The shell is the same on the dashboard, results and account:
- the wordmark;
- navigation: Presentations, Sessions, LearnBox simulations (opens `learnbox.one`);
- account menu: account email, Account, theme (dark / light), Sign out.

Dashboard:
- **Presentations**: a card for each, with a thumbnail of its first slide, title, slide count and last edited. Actions on a card: Edit, Present, Delete. Primary action of the view: "New presentation".
- **Sessions**: title, code, date and time, Live or Ended, with Control / Screen / Results. Live sessions come first.
- **Usage**: "3 / 50 presentations" and "1 / 3 live sessions".
- **LearnBox panel**: see §4F.
- States: loading, empty (no values, no sentence), and the two limits reached:
  - "Up to 50 presentations per account. Delete one to make another."
  - "Up to 3 live sessions at once. End one to start another."

**23. Editor**
- Three areas:
  - the slide list, each slide shown as a small thumbnail with its number and type icon; slides can be reordered and deleted;
  - a live preview of the chosen slide as it looks on the big screen, with a switch to the phone view;
  - the settings for the chosen slide.
- Top bar: back to Presentations; the title of the presentation, editable in place; the save state (Saving… / Saved / Not saved); primary action **Present**; secondary **Run as survey**.
- "Add slide" opens a picker of eight types, each with its icon and name: Multiple choice, Word cloud, Rating, Open text, Q&A, Quiz question, Leaderboard, Heading.
- States: loading, save failed, slide limit reached ("Up to 50 slides per presentation.").
- At phone width the three areas become steps: list, then settings, then preview.
- Settings by type:

| Type | Settings |
|---|---|
| Multiple choice | 2–10 options; picks per person |
| Word cloud | Words per person, 1–3 |
| Rating | Scale (1 to 3/4/5/7/10); label for each end |
| Open text | Answers per person, 1–3 |
| Q&A | Moderation on/off; anonymous questions allowed |
| Quiz question | 2–4 options with one correct; time limit 10/20/30/60 s |
| Leaderboard | No settings |
| Heading | Heading; text |

**24. Results of a session**
- Title, date, code and people joined.
- Each slide's results, using the same charts as the big screen.
- Open text and Q&A as lists.
- Download CSV and Download Excel.
- **LearnBox panel**: see §4F.
- States: loading; a session with no answers (charts with no values).

**25. Account**
- Email, change password, delete account.
- The delete confirm states what is removed: presentations, sessions and all answers.

### F. LearnBox: where the product points to it

Four fixed places. Each is a static part of the page. None opens over the facilitator's work, moves, or repeats within a view.

| Place | What it is |
|---|---|
| Wordmark | "LearnBox Sessions", in full, in the public header and the app shell; small at the foot of every audience phone screen; small in the presenter screen's join bar. |
| Front page section | Heading, line, simulation list and link from §5. |
| Dashboard panel | Heading, line and link from §5. It sits beside or below the facilitator's own content and takes less room than it. |
| Results page panel | The same panel, after the last slide's results. |

The LearnBox link is always a text link or secondary button. The view's primary action stays the facilitator's own.

## 5. Copy

Draft by the owner's instruction: plain statements, no slogans. Use it exactly; the owner will edit the wording later.

**Front page: top section**
- Headline: "Live polls, Q&A, quizzes and surveys"
- Line: "Free. Your audience joins on their phones with a 6-digit code."
- Primary action: "Create free account"
- Join field: label "Code", button "Join"

**Front page: slide types**

| Type | Line |
|---|---|
| Multiple choice | The audience picks one or more options. The bars update as votes arrive. |
| Word cloud | Each person sends up to 3 words. Repeated words grow. |
| Rating | A scale of up to 10. The screen shows the average and the spread. |
| Open text | Short written answers, shown as a wall. |
| Q&A | The audience asks and upvotes questions. You approve, highlight and mark them answered. |
| Quiz | Timed questions. Points for correct and fast answers. Leaderboard and podium. |
| Survey | The audience answers at its own pace. |

**Front page: how it works**
1. "Build a presentation": add polls, Q&A and quiz questions as slides.
2. "Start a session": the screen shows a 6-digit code and a QR code.
3. "The audience answers on their phones": they join in the browser with the code.
4. "Results appear on the screen": download them afterwards as CSV or Excel.

**Front page: what an account includes**

| | |
|---|---|
| Price | Free |
| People per session | 1,000 |
| Presentations | 50 |
| Slides per presentation | 50 |
| Live sessions at once | 3 |
| Export | CSV and Excel |

**LearnBox: front page section**
- Heading: "LearnBox simulations"
- Line: "LearnBox Sessions is a free tool from LearnBox. LearnBox makes simulations that teach professional skills through practice, for corporate training."
- Simulation list: **[OWNER: the simulations to show, with a name and one line each]**
- Link: "See the simulations" → `learnbox.one`

**LearnBox: dashboard and results panel**
- Heading: "LearnBox simulations"
- Line: "Simulations that teach professional skills through practice, for corporate training."
- Link: "See the simulations" → `learnbox.one`

**Wordmark:** "LearnBox Sessions"

## 6. Data to design with

Use this data, so the designs match what the app really shows. Please also draw one "large room" variant of each results screen.

**Facilitator account: asha@example.com**
- Presentations (3 / 50):
  - "Sales kickoff 2027", 12 slides, edited today;
  - "Team offsite", 5 slides, edited yesterday;
  - "Onboarding feedback", 6 slides, edited 12 Sep 2026.
- Sessions (1 / 3 live):
  - "Sales kickoff 2027", code 418 207, today 10:30, Live;
  - "Team offsite", code 954 152, 28 Sep 2026 16:00, Ended.

**Small room: "Team offsite", code 954 152, 5 joined**
1. Multiple choice, "Where should we go?": Goa 3 (60%), Coorg 1 (20%), Lonavala 1 (20%). 5 answered.
2. Word cloud, "One word for this year": growth 3, trust 2, speed 1.
3. Rating 1–5, "How was the quarter?" (1 · Poor, 5 · Excellent): 5 ×2, 4 ×2, 3 ×1. Average 4.2.
4. Open text, "What should we change?":
   - "Fewer meetings on Mondays"
   - "Shared calendar for leave"
   - "Quarterly team lunch"
5. Heading, "Thank you".

**Large room: "Sales kickoff 2027", code 418 207, 248 joined**
- Multiple choice, "Which region grows fastest next year?": North 131, West 72, South 45 (248 answered).
- Word cloud of 40+ distinct words. The top ones are pipeline 38, focus 31, clients 27, speed 22 and margin 19, then a long tail of 1–5 each.
- Open text with 180 answers, of mixed lengths from 3 to 280 characters.
- **Q&A**, 23 questions:
  - "Will targets change mid-year?" (41 votes, highlighted)
  - "How are leads split between regions?" (29)
  - "When is the new CRM live?" (17, answered)
  - one pending moderation
  - one anonymous
- **Quiz**, 3 questions, 24 players:
  - Question: "Which planet is the largest?" Options: Earth / Jupiter / Saturn / Mars. Correct: Jupiter. Time limit 20 s.
  - Leaderboard: Asha 2,840, Rohan 2,615, Meera 2,410, Kabir 2,190 …
  - Points: up to 1,000 per correct answer, more for faster answers.

## 7. What exists now

`current-screens/` holds screenshots of the working app. The screens are plain on purpose: they show what each screen holds, not how it should look. Everything in them works end to end. The flows and data are real; the look is entirely yours.
