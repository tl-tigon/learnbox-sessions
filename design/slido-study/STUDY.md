# Slido: interface study (2026-10-02)

The owner chose Slido's event model and wants LearnBox Sessions to match the quality of Slido's interface. This is what Slido's screens do, measured from its public pages and from the demo event Slido embeds on its own feature pages. The screenshots in this folder are reference only and never ship.

**Seen:** the join page, the participant app (Q&A and Polls), the presenter wall ("Present mode"), and the marketing site. On 2026-10-02 the owner signed in to their own Slido account and the host's screens were studied there, view only: the list of events, one event's screen, the picker for a new interaction, a poll's menu, analytics and settings; and the participant's side of one event, with its menu.
**Not seen:** Q&A moderation on the host's screen. None of the events opened used Q&A, and adding it would have changed the owner's event.

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

## The participant's menu

- The header has a menu button on the left and the profile button on the right. With only one feature in use, the event's name takes the place of the tabs.
- The menu rises from the bottom of a phone: the event's name, dates and code; switch to another event; a dark mode switch; and a button that invites the participant to make an event of their own.
- The profile button opens a second sheet with the participant's name.
- With no poll running: an icon and one line, in the middle of the page.

## What LearnBox Sessions takes, and what stays Slido's

**Taken:** the event model, the layouts, the spacing and sizes above, the component shapes, and the restraint (one accent, one typeface, hairline cards, plain labels).

**How LearnBox Sessions differs on the facilitator's screen:**
- The Q&A is always part of a session, so its card is always in the list, and its bar holds the "Questions open" switch.
- The rail's second button opens the results page, and its third the settings (the links, and the two Q&A settings).
- A poll's menu holds move up, move down, duplicate and delete.
- The facilitator's screen has two filled buttons, Add and Start, as Slido's does.
- The phone's menu has the code, "Enter another code", the dark mode switch and "Create a session".

**Stays Slido's:** its name, wordmark, exact green, illustrations, photographs and wording. LearnBox Sessions uses LearnBox's wordmark, LearnBox's forest accent `#1f7a52` and its own labels.
