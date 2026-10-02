# Slido: interface study (2026-10-02)

The owner chose Slido's event model and wants LearnBox Sessions to match the quality of Slido's interface. This is what Slido's screens do, measured from its public pages and from the demo event Slido embeds on its own feature pages. The screenshots in this folder are reference only and never ship.

**Seen:** the join page, the participant app (Q&A and Polls), the presenter wall ("Present mode"), and the marketing site.
**Not seen:** the host's admin screens. They are behind sign-in.

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

## What LearnBox Sessions takes, and what stays Slido's

**Taken:** the event model, the layouts, the spacing and sizes above, the component shapes, and the restraint (one accent, one typeface, hairline cards, plain labels).

**Stays Slido's:** its name, wordmark, exact green, illustrations, photographs and wording. LearnBox Sessions uses LearnBox's wordmark, LearnBox's forest accent `#1f7a52` and its own labels.
