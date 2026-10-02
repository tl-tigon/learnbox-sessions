Design the full UI for **LearnBox Sessions**: a free SaaS tool for running live polls, Q&A, quizzes and surveys with an audience, in the same space as Mentimeter, Slido and Kahoot. Always write the name in full, and design a wordmark for it.

LearnBox Sessions is made by **LearnBox**, which sells simulations for corporate training. It is LearnBox's free tool, in the way HubSpot offers free tools beside its main product. It has to be a product facilitators would choose on its own merit, and it points to LearnBox in four fixed places.

The attached **BRIEF.md** is the specification. It lists:
- the quality bar (§2);
- the rules (§3);
- every screen and every state to draw (§4), including where LearnBox appears (§4F);
- the copy for the front page and the LearnBox panels (§5: use it exactly, and add no other copy);
- the data to design with (§6: use it, and invent no fields or numbers).

**current-screens/** shows the working app today. Those screens are deliberately plain: take what each screen holds from them, not how it looks or how it is laid out.

This product needs its **own visual system**, so please create one:
- colour tokens as CSS custom properties, in a dark and a light theme;
- a colour-blind-safe chart palette;
- a text face and a tabular or mono face for numbers;
- a type scale that reads from 20 metres on a projector;
- an icon for each of the eight slide types;
- radius, spacing and motion.

Seven things matter most:
1. **The front page** must read as a finished SaaS product page, and show the product itself running.
2. **The facilitator app** (dashboard, editor, results, account) must match that standard after sign-in: one app shell, slide thumbnails, an editor built around a live preview, and every loading, empty and error state.
3. **The phone answer screens** must be fast to use with one thumb.
4. **The presenter screen** must be legible from the back of a room, on a washed-out projector.
5. **Results must animate smoothly** as answers arrive.
6. **The open-text wall and the word cloud** must hold up at 300 answers.
7. **The control view** must work one-handed on a phone while presenting.

Please hand back `.dc.html` files:
1. **Foundations**: the tokens (dark and light), the type scale, the chart palette, the slide-type icons, buttons, inputs, the QR frame, the wordmark and the LearnBox panel.
2. **Public (1366×768 and phone 390px)**: front page (every section and state in §4A.1), sign in and create account (all states), Terms and Privacy.
3. **Audience (phone, 390px)**: every state in §4B.
4. **Presenter screen (1920×1080 and 1366×768)**: every state in §4C, with the small-room and large-room data.
5. **Control view (1366×768 and phone 390px)**: every state in §4D.
6. **Facilitator app (1366×768 and phone 390px)**: app shell, dashboard, editor (every slide type's settings), results and account, with every state in §4E.

Draw each screen in dark and light, using frames or a state switcher. Put the tokens in one `:root` block, so they can be lifted straight into code.

Add a note in the file for anything you would want that §6 doesn't list as data, so it can be added or dropped.

Copy: the front page and the LearnBox panels use §5 exactly. Everywhere else, use only labels, names and numbers. Buttons say what they do.
