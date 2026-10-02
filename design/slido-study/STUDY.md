# Slido: interface study (2026-10-02)

The owner chose Slido's event model and wants LearnBox Sessions to match the quality of Slido's interface. This is what Slido's screens do, measured from its public pages and from the demo event Slido embeds on its own feature pages. The screenshots in this folder are reference only and never ship.

**Seen:** the join page, the participant app (Q&A and Polls), the presenter wall ("Present mode"), and the marketing site. On 2026-10-02 the owner signed in to their own Slido account and the host's screens were studied there, view only: the list of events, one event's screen, the picker for a new interaction, a poll's menu, analytics and settings; and the participant's side of one event, with its menu.
Later that day, with the owner's go-ahead, a test event was made in that account ("Claude test - safe to delete") and run from both sides: Q&A (ask, upvote, highlight, reply, mark answered, close and open), a multiple choice poll (start, vote, stop), a quiz (lobby, question, reveal, leaderboard) and Present mode. The owner's own events were not changed.
**Not seen:** moderation ("review incoming questions"), replies from participants, labels and surveys. They are on Slido's paid plans.

Screenshots of the owner's account hold their clients' names. They stay in `.playwright-mcp/`, which git ignores, and are never added to this folder.

## What makes it look clean

1. **One accent colour, used sparingly.** Green appears on the header, the primary button and the selected state. Everything else is white, near-black text and three greys.
2. **One typeface at few sizes.** Inter throughout the app: 14px for almost everything, 12px for labels, weights 400, 500 and 600. No large headings on the phone.
3. **Cards with a hairline border and no shadow.** White, 12px radius, 1px border at about 24% grey, 16px padding, 8px between cards.
4. **One primary action per screen**, full width on a phone: "Send".
5. **Quiet numbers.** Counts sit in small grey pills at the right edge of a card.
6. **Plain labels.** "Q&A", "Polls", "Popular", "Questions closed", "Voting as Anonymous", "Send".

## Measured values

| Element | Value |
|---|---|
| App typeface | Inter; 14px body, 12px labels, weights 400/500/600 |
| Text | `#1a1a1a`; secondary `#525252`; tertiary `#6f6f6f` |
| Accent | `#198038`; header a darker shade of it |
| Lines | `#e5e5e5`, or grey at 24% |
| Selected or highlighted card | accent at 12% |
| Reply block inside a card | black at 4%, 8px radius, 10px padding |
| Card | white, 12px radius, 1px border, 16px padding |
| Primary button | 44px tall, 8px radius, accent, white 12px/500 label |
| Header | 64px tall; menu left, tab switch centre, avatar right |
| Tab switch | 48px tall, 12px radius, dark translucent track; selected tab 40px tall, 8px radius, accent |
| Avatar | 32px circle, pale tint |
| Join field | pill (50px radius), 18px text, `#` prefix, round accent button with an arrow |
| Content column | about 650px wide, centred, on desktop |
| Site headings | 56–64px, weight 700; site buttons 4px radius |

## Screen by screen

**Join** ([07](07-join-phone.png), [08](08-join-desktop.png))
One field in the middle of an almost empty page: `#`, "enter code here", a round arrow button. The wordmark is centred at the top. One line of legal text sits under the field.

**Participant: Q&A** ([01](01-phone-qa.png), [03](03-desktop-qa.png))
- Header with the two tabs, Q&A and Polls.
- An announcement box from the host, in pale blue.
- The ask box, or a "Questions closed" card.
- A sort control ("Popular") on the left and the question count on the right.
- One card per question: avatar, name or "Anonymous", age, the upvote pill on the right, the text, and replies indented in a grey block. The highlighted question has the accent tint.

**Participant: poll** ([02](02-phone-poll.png), [04](04-desktop-poll.png))
- A small type label ("Multiple choice") and the number of people.
- The question in bold.
- One bordered row per option with a checkbox.
- "Voting as Anonymous", then the full-width "Send" button.

**Presenter wall** ([05](05-wall-qa.png), [06](06-wall-poll.png))
- A warm off-white background.
- A narrow left column: the wordmark and the join instructions.
- A wide right column of white cards: either the questions, with the highlighted one in solid accent, or the active poll.
- Poll bars are thick and fully rounded; the leading option is in the accent and the others are grey; the percentage sits at the end of each bar.
- A small dark control bar at the bottom left.

## The host's screens

### Measured values

| Element | Value |
|---|---|
| Page | `#f7f7f7`; the working panel `#fbfbfb`, with a hairline on its top and left |
| Header | 64px, on the page colour, no border |
| Back button | 40px circle, hairline |
| Event name | 18px, weight 500, edited in place |
| Header buttons | 40px tall, 8px radius, outlined in the accent with accent text; "Present" is joined to a 40px menu button |
| Rail | 73px wide; 40px round icon buttons; the current one tinted with the accent |
| List column | 383px wide, 24px padding |
| Section label | 12px, weight 500, `#525252` |
| List card | white, 8px radius, hairline, 16px padding, 8px apart; the selected one has a 1px accent ring |
| Card text | title 14px on a 24px line, two lines at most; under it the type's icon and "20 votes" at 12px |
| Card actions | 32px icon buttons: hide results, close voting, a round filled start button, a menu |
| Filled button | 40px tall, 8px radius, accent, white 14px/500 label |
| Open card | white, 8px radius, hairline, 24px padding; it scrolls inside the panel |
| Question field | 18px, weight 500, on a 24px line, in a hairline box with 12px/16px padding |
| Option | text at 16px; under it a 16px-tall fully rounded bar on a `#e5e5e5` track, with the figure at the right |
| Bottom bar | its own white card, 72px tall, 16px under the open card |
| Type picker | cards 197px wide in a four-column grid, 16px apart: a drawing on grey, then the icon and the name at 16px/500 |
| List of events | rows 77px tall, joined, with hairlines; filter chips 40px tall, the selected one tinted and ringed in the accent; a 340px search field |
| Settings | a dialog over the screen, with its sections down the left |

### Screen by screen

**List of events**
- Filter chips (all, active and upcoming, past) on the left, the create button on the right, a search field under them.
- One row per event: its name with the code beside it, its dates, its status, then a duplicate button and a menu.

**One event**
- Header: back, the name, the dates, the code (a click copies it), Share, and Present with its menu.
- Rail: interactions, analytics, settings.
- Left column: an Add button; a Q&A section; a Polls section with one card per poll.
- Right: the selected poll in one card. Its type and vote count at the top, with delete and "Poll settings" at the right. The question, then each option with its result bar under it: editing and results are one view.
- Under it, a bar with the start button on the left and "View as participant" on the right.
- Add replaces the right side with a grid of types, one card each, and a Close button.
- A poll's menu: select, add a divider, duplicate, direct link, reset results, delete.

**Analytics**
- Three figures across the top, then the polls in a list on the left with the selected poll's results on the right.

### Q&A on the host's screen

- The Q&A card in the list shows the number of questions and "Open" or "Closed" with a dot, green or red.
- The header has the name, then search, Archive and "Q&A settings" at the right.
- Two chips, Live and Answered, 32px tall with a count badge; the selected chip is ringed in the accent and its badge is filled. The sort ("Popular", "Recent") sits at the right.
- Questions are plain rows with no border: a 16px avatar, the name and the time at 12px grey, then the question at 14px/500 in `#525252`, with the votes at the right.
- Hovering a row gives it a hairline box, darkens its text and shows a small pill of round icon buttons at its top right: Highlight (filled accent), Mark as answered, Reply, More (Select, Edit, Archive, Delete).
- A highlighted row is tinted and ringed in the accent. Its pill then holds "Remove highlight", and "Mark as answered" becomes the filled button: the filled button is always the usual next step.
- In Answered, the pill holds Restore, Reply and More.
- Reply opens a panel down the right side, under the header, about 432px wide: the question, a "1 replies" divider, the replies, and the reply field with Send at the bottom. The row in the list then shows "View 1 reply".
- "Q&A settings" and "Poll settings" open in the same side panel: a switch per setting with one line under it.
- The bar under the card holds "Close Q&A" (red tint, lock icon). It asks first, in a small dialog with Cancel and a solid red "Close Q&A". Once closed: the card says "Closed", the header shows a red outlined "Q&A is closed" pill, and the bar holds "Open Q&A" (green tint).
- An edit shows a dark "Saved" toast at the bottom for a moment.

### A running poll on the host's screen

- The card's title turns green, its count gets a green dot, and its round button becomes a solid red stop.
- The bar holds Stop (red tint), Prev, hide results, close voting, Next. Prev and Next start the neighbouring poll.

### A quiz on the host's screen

- The quiz card opens to list its questions and a "Final leaderboard" row.
- Each question is its own card: a numbered badge, the vote count and the time limit ("20 sec") as a small dropdown beside it, the question, and options with a round check to mark the correct one. A red notice asks for the correct answer until one is marked.
- While it runs, the editor gives way to a stage: "Participants are joining", then the question with grey bars, then the correct option in green after the reveal, then the leaderboard. The bar's one button is the next step, with an arrow: "First question", "Reveal answer", "Reveal leaderboard".

## The participant's screens, run from both sides

- **Asking.** The ask box is a single row, "Type your question", with the person's avatar. It opens a full-screen sheet: the question with a count of characters left, "Your name (optional)", and a pill "Send". A round "Ask" button floats at the bottom right. After sending, a toast says "Question sent".
- **Own questions** have a menu: Edit, Withdraw.
- **An upvote given** shows as a tinted pill ringed in the accent.
- **After voting**, the options give way to the results (each option with its bar and share, the person's own pick marked) and a full-width "Edit response".
- **When a poll stops**, the phone goes back to the Q&A tab.
- **Quiz.** A "Join" row with the person's name; "Get ready"; the question with a clock, the seconds and a line that shortens; "Vote sent!"; then the result with the correct option marked; at the end a medal, the place, and the person's own row.
- **The invitation.** After a vote, a strip at the bottom asks "Want to use Slido at your meeting?" with a "Try Slido for free" button and a close button. The final quiz screen has a second button, "Make your own Slido in minutes". This is how Slido turns participants into hosts.

## The participant's menu

- The header has a menu button on the left and the profile button on the right. With only one feature in use, the event's name takes the place of the tabs.
- The menu rises from the bottom of a phone: the event's name, dates and code; switch to another event; a dark mode switch; and a button that invites the participant to make an event of their own.
- The profile button opens a second sheet with the participant's name.
- With no poll running: an icon and one line, in the middle of the page.

## slido.com, the site

Studied on 2026-10-02 at 1440px and 390px wide: the home page, the menus, the product tour and the pages for live polls, live Q&A, quizzes, word cloud, surveys and analytics.

- **Top bar**: 80px, sticky, white; it gains a hairline once the page scrolls. The wordmark, then Product, Solutions, Pricing, Resources, Enterprise; "Log In" and a filled "Sign Up" at the right. Product and Solutions open a panel on hover: a list on the left, and on the right an icon in a tinted circle, the item's name, two lines and "Learn more" for the item the pointer is on. On a phone the bar keeps the wordmark, "Sign Up" and a menu button; the menu opens as a full page with the groups folding open.
- **Home page**, top to bottom:
  - a pill, "Joining as a participant?", with the code field in it;
  - the heading at 64px/72px bold, a 20px line, one 56px button;
  - a video, 800x450 and 48 seconds, that loops: a browser window (the presenter's screen) and a phone side by side, playing a poll being voted on, then the Q&A with questions arriving, then a word cloud;
  - a cream band (`#faf7f0`), "Works standalone and with your favorite tools", with six logos;
  - a centred heading and a paragraph;
  - four items (Live polls, Audience Q&A, Quizzes, Analytics) that open one at a time beside a picture that changes with them;
  - three cream cards, an icon, a title and two lines each;
  - award badges, a carousel of customer quotes with photographs, a row of customer logos;
  - a green band with one heading and one button;
  - a footer of five columns of links.
- **The video, frame by frame.** It is one story with the objects moving in space, and that movement is most of why the page feels alive (the page itself has no scroll effects):
  - the browser window swings up into view showing the join code and QR code; a phone flies in tilted, stops over the QR code, and turns green once joined; participant tiles light up one by one;
  - the poll's question appears, then its options one at a time; the phone turns to show the poll; a grey touch circle lands on an option, then on Send; the bars grow on both;
  - the view moves in on the phone alone for the Q&A: a touch on the ask box, the question typed letter by letter, Send; the window swings back in with questions arriving; a touch upvotes one;
  - a word cloud builds on a laptop beside four video-call faces, and the view pulls back to a photograph of a meeting room with the cloud on its TV.
- **What else gives it life**: photographs of people (the video-call faces, hands holding phones, customer portraits), a second colour (blue for the participant's side) and coloured avatars and tool logos, a display typeface for headings, and headings written with a voice.
- **A product page** (live Q&A): the heading at the left with a short list and a button, a picture at the right; "in 3 steps" as three green cards with a drawing each; "See how it works", a real event in two frames, "Participant mode" (a phone) and "Present mode" (the screen), where a vote on one shows on the other; then rows that alternate sides and background, each a small label, a 38px heading, two lines and a picture; a grid of six smaller features, icon, title and line; the tools band; quotes; the green band.
- **Type**: headings in Slido's own sans at 64px and 38px bold; text in Inter at 16px, 20px for the lead line; buttons 56px tall with a 4px radius.

**How LearnBox Sessions' site differs:**
- The pictures are drawings of LearnBox Sessions' own screens, built in code (`src/components/site/mock.tsx`). The one under the home page's heading tells the same kind of story in five scenes (join, poll, Q&A, word cloud, quiz), with the screen and phone moving between them and a touch mark for each tap; five labels under it choose the scene. The other pictures play once when scrolled to.
- It has no photographs, one colour and one typeface, and plain headings. Those are the owner's choices to revisit.
- "Try it" is a working example in the page: a vote or a question on the drawn phone shows on the drawn big screen. It runs in the visitor's browser.
- The menus are Product (the tour and six pages), Use cases (one page, five sections) and Pricing (one free plan).
- The band under the picture says where a session runs: a projector, a shared browser tab in a video call, phones, the code and QR code. LearnBox Sessions has no add-ins for other tools, so no logos.
- No awards, customer quotes or customer logos: there are none yet.

## What LearnBox Sessions takes, and what stays Slido's

**Taken:** the event model, the layouts, the spacing and sizes above, the component shapes, and the restraint (one accent, one typeface, hairline cards, plain labels).

**How LearnBox Sessions differs:**
- The Q&A is always part of a session, so its card is always in the list. Opening it again needs no confirmation.
- The Q&A has a third chip, "In review", when questions are reviewed first; its pill holds Approve and Hide.
- A question's More menu holds Hide. Replies are the facilitator's only, shown as "Host".
- An announcement field sits above the questions.
- The rail's second button opens the results page, and its third the settings (the links, and the two Q&A settings).
- A poll's menu holds move up, move down, duplicate and delete.
- The quiz's editor stays under the stage while it runs, read-only; a quiz answer is sent by tapping the option; places are by points.
- A person can withdraw their own question; editing it is left out.
- The phone's menu has the code, "Enter another code", the dark mode switch and "Create a session". After a person answers or asks, a strip offers "Create a session".
- Edits show "Saving…" and "Saved" beside the session's name; toasts are for copying a link and for a question sent or withdrawn.

**Stays Slido's:** its name, wordmark, exact green, illustrations, photographs and wording. LearnBox Sessions uses LearnBox's wordmark, LearnBox's forest accent `#1f7a52` and its own labels.
