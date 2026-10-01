Design the full UI for **Live**: a free tool for running live polls, Q&A, quizzes and surveys with an audience, in the same space as Mentimeter, Slido and Kahoot. "Live" is a working name, so use it as a plain wordmark.

The attached **BRIEF.md** is the specification. It lists:
- every screen and every state to draw (§3);
- the data to design with (§4: use it, and invent no fields or numbers);
- the rules (§2).

**current-screens/** shows the working app today. Those screens are deliberately plain: take what each screen holds from them, not how it looks.

This product needs its **own visual system**, so please create one:
- colour tokens as CSS custom properties, in a dark and a light theme;
- a colour-blind-safe chart palette;
- a text face and a tabular or mono face for numbers;
- a type scale that reads from 20 metres on a projector;
- radius, spacing and motion.

Five things matter most:
1. **The phone answer screens** must be fast to use with one thumb.
2. **The presenter screen** must be legible from the back of a room, on a washed-out projector.
3. **Results must animate smoothly** as answers arrive.
4. **The open-text wall and the word cloud** must hold up at 300 answers.
5. **The control view** must work one-handed on a phone while presenting.

Please hand back `.dc.html` files:
1. **Foundations**: the tokens (dark and light), the type scale, the chart palette, buttons, inputs and the QR frame.
2. **Public**: front page, sign in and create account (all states), Terms and Privacy.
3. **Audience (phone, 390px)**: every state in §3B.
4. **Presenter screen (1920×1080 and 1366×768)**: every state in §3C, with the small-room and large-room data.
5. **Control view (1366×768 and phone 390px)**: every state in §3D.
6. **Facilitator app (1366×768 and phone 390px)**: dashboard, editor (every slide type's settings), results and account.

Draw each screen in dark and light, using frames or a state switcher. Put the tokens in one `:root` block, so they can be lifted straight into code.

Add a note in the file for anything you would want that §4 doesn't list as data, so it can be added or dropped.

No taglines, welcome lines or encouraging copy anywhere: only labels, names and numbers. Buttons say what they do.
