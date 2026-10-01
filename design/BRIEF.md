# Live: design brief

"Live" is a working name; the final name isn't chosen yet. Use it as a plain wordmark that can be swapped later.

## 1. What the product is

Live is a free, self-serve tool for running polls, Q&A, quizzes and surveys with an audience. It is in the same space as Mentimeter, Slido and Kahoot.

- **Facilitators** are trainers, managers, teachers and speakers. They sign up, build a presentation of interactive slides, and run it as a live session.
- **The audience** joins on their phones with a 6-digit code or a QR code. They need no account and no app.
- **Results** appear live on the big screen as people answer.

There are three places the product is seen, and each needs to work well:

| Place | Device | Seen by | Distance |
|---|---|---|---|
| Audience | Phone, 390px wide (also works on a laptop) | Everyone in the room or on the call | In hand |
| Presenter screen | Projector or shared screen, 1920×1080 and 1366×768 | The whole room | 3–20 metres |
| Facilitator app and control view | Laptop 1366×768; the control view also on a phone | The facilitator | Desk |

## 2. The visual system

The product needs its **own** visual system. It is unrelated to LearnBox or any other product. Please define:

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

**Rules from the owner:**
- **No invented copy.** No taglines, welcome lines, encouragement or jokes. Use labels, names and numbers only.
  - Buttons say what they do: "Join", "Submit", "Next", "Present", "Download CSV".
  - Empty states show no values rather than a sentence.
- **One primary action per view.**
- **Tap targets of at least 44px on phones.**
- **No generic AI look:** no purple gradients, glassmorphism, or three equal cards in a row.

## 3. Screens and every state to draw

### A. Public

**1. Front page (`/`)**
- A join-by-code field, which is the main action for most visitors.
- Sign in and Sign up.
- A short section naming what Live does: Polls, Word cloud, Rating, Open text, Q&A, Quiz, Survey. Use a one-line factual description each, which the owner will edit.
- Links to Terms and Privacy.

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
- A large QR code, the URL (`live.example/123456`), the code split as `954 152`, the session title, and the number of people joined (live).

**13. Join bar**
- Kept small on every slide: URL, code, people joined, and a small QR code.

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

### E. Facilitator app (laptop; must also work at phone width)

**22. Dashboard**
- **Presentations**: title, slide count and last edited, plus "New presentation".
- **Sessions**: title, code, date and time, Live or Ended, with Control / Screen / Results.
- Empty state (no values, no sentence).
- Limit messages:
  - "Up to 50 presentations per account. Delete one to make another."
  - "Up to 3 live sessions at once. End one to start another."
- Header: account email, Account, Sign out.

**23. Editor**
- A slide list on the left showing number, type and title. Slides can be reordered and deleted.
- The settings for the chosen slide.
- A live preview of how the slide looks on the big screen.
- The title of the presentation, editable in place.
- A save state: Saving… / Saved / Not saved.
- Primary action: **Present**. Secondary: **Run as survey**.
- "Add slide" offers eight types: Multiple choice, Word cloud, Rating, Open text, Q&A, Quiz question, Leaderboard, Heading.
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

**25. Account**
- Email, change password, delete account.
- The delete confirm states what is removed: presentations, sessions and all answers.

## 4. Data to design with

Use this data, so the designs match what the app really shows. Please also draw one "large room" variant of each results screen.

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

## 5. What exists now

`current-screens/` holds screenshots of the working app. The screens are plain on purpose: they show what each screen holds, not how it should look. Everything in them works end to end. The flows and data are real; the look is entirely yours.
