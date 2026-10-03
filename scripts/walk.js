/* Walk on the in-memory dev server, end to end as people would use it:
   a facilitator makes a session and builds polls and a quiz in the editor; a projector opens the
   big screen with the display key; five phones join by code. Then Q&A (ask, upvote, review, reply,
   highlight, announcement, closing), each poll type (with a changed vote, locked voting and hidden
   results), a survey, a quiz to its final leaderboard, the results downloads, resetting a poll, the ways around the
   rules that must be refused, a duplicate, ending, and deleting the account. The account starts on
   Free: what Free refuses is tried, then Pro is paid for on the development payment page.
   Run with the dev server up: node scripts/walk.js */
const fs = require('fs'), path = require('path');
const { chromium } = require('C:/Users/tejas/OneDrive/Documents/Workspace/LMS/Trust Sim/capture-tool/node_modules/playwright-core');
/* BASE=http://localhost:3300 runs it against the built files and the Lambda bundles (scripts/preview.js). */
const BASE = process.env.BASE || 'http://localhost:3200';
const OUT = path.join(__dirname, 'live-walk'); fs.mkdirSync(OUT, { recursive: true });
const AUTH = { authorization: 'Bearer dev:walk@example.com', 'content-type': 'application/json' };
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };
/* The dev server also compiles each API route on its first use, and again after a minute unused. */
const WAIT = { timeout: 30000 };
/* The dev server compiles each page the first time it is opened. */
const FIRST = { timeout: 120000 };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const fac = await browser.newContext({ viewport: { width: 1366, height: 800 } });
    const p = await fac.newPage(); p.setDefaultTimeout(20000);
    const errs = []; p.on('pageerror', (e) => errs.push('host: ' + e));
    p.on('dialog', (d) => d.accept());
    const api = (method, url, body, headers = AUTH) => p.evaluate(async ({ method, url, body, headers }) => {
      const r = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, { method, url, body, headers });

    // ---- Sign in and make a session
    await p.goto(`${BASE}/sign-in`, FIRST);
    /* An address the server would refuse is turned away at sign-in; one already held sends the screen back to sign-in. */
    await p.fill('input[type="email"]', 'a@aa');
    await p.click('button:has-text("Continue")');
    await p.waitForSelector('[role="alert"]:has-text("Enter a full email address")', WAIT);
    check('sign-in refuses an address the server would not accept', /\/sign-in$/.test(p.url()) && (await p.evaluate(() => localStorage.getItem('la-dev-email'))) === null);
    await p.evaluate(() => localStorage.setItem('la-dev-email', 'a@aa'));
    await p.goto(`${BASE}/app`, FIRST);
    await p.waitForURL(/\/sign-in$/, FIRST);
    check('a sign-in the server refuses goes back to the sign-in page', (await p.evaluate(() => localStorage.getItem('la-dev-email'))) === null);
    await p.fill('input[type="email"]', 'walk@example.com');
    await p.click('button:has-text("Continue")');
    await p.waitForURL(/\/app$/, FIRST);
    /* Anything an earlier walk left behind goes first, so each run starts from an empty account. */
    await api('DELETE', '/api/account');
    await p.click('button:has-text("New session")', FIRST);
    await p.waitForURL(/\/app\/session\?id=/, FIRST);
    const sessionId = new URL(p.url()).searchParams.get('id');
    await p.waitForSelector('input[aria-label="Session name"]', FIRST);
    await p.fill('input[aria-label="Session name"]', 'Team offsite');

    // ---- Build a multiple choice poll and a quiz in the editor
    /* A new session opens on the types to add. */
    await p.waitForSelector('button.typecard:has-text("Quiz")', WAIT);
    check('a new session opens on the types to add', (await p.$$('button.typecard')).length === 8);
    const add = async (type) => { await p.click('.hostlist button.primary:has-text("Add")'); await p.click(`button.typecard:has-text("${type}")`); };
    await add('Multiple choice');
    await p.fill('textarea[aria-label="Question"]', 'Where should we go?');
    await p.fill('input[aria-label="Option 1"]', 'Goa');
    await p.fill('input[aria-label="Option 2"]', 'Coorg');
    await p.click('button:has-text("Add option")');
    await p.fill('input[aria-label="Option 3"]', 'Lonavala');
    await add('Quiz');
    await p.fill('textarea[aria-label="Quiz name"]', 'Planets');
    await p.fill('input[aria-label="Question 1"]', 'Which planet is the largest?');
    await p.fill('input[aria-label="Option 1"]', 'Earth');
    await p.fill('input[aria-label="Option 2"]', 'Jupiter');
    await p.click('button:has-text("Add option")');
    await p.fill('input[aria-label="Option 3"]', 'Mars');
    await p.check('input[aria-label="Option 2 is correct"]');
    await p.selectOption('select[aria-label="Time limit"]', '10');
    await p.click('button:has-text("Add question")');
    await p.fill('input[aria-label="Question 2"]', 'Which planet is closest to the sun?');
    const q2 = p.locator('.sub').nth(1);
    await q2.locator('input[aria-label="Option 1"]').fill('Mercury');
    await q2.locator('input[aria-label="Option 2"]').fill('Venus');
    await q2.locator('select').selectOption('10');
    await p.waitForSelector('[role="status"]:has-text("Saved")', WAIT);
    await p.screenshot({ path: path.join(OUT, '01-host-editor.png') });

    let host = (await api('GET', `/api/sessions/${sessionId}`)).body;
    const [choice, quiz] = host.interactions;
    check('editor saved the session name, the poll and the quiz',
      host.title === 'Team offsite' && choice.type === 'choice' && choice.options.map((o) => o.label).join() === 'Goa,Coorg,Lonavala'
      && quiz.type === 'quiz' && quiz.questions.length === 2 && quiz.questions[0].seconds === 10
      && quiz.questions[0].options.find((o) => o.id === quiz.questions[0].correctId)?.label === 'Jupiter',
      host.interactions.map((i) => i.type).join());

    // The other kinds go in through the API, then the screen is reloaded to pick them up.
    const more = [
      { id: 'cloud001', type: 'wordcloud', title: 'One word for this year', maxEntries: 3 },
      { id: 'rate0001', type: 'rating', title: 'How was the quarter?', max: 5, lowLabel: 'Poor', highLabel: 'Excellent' },
      { id: 'open0001', type: 'open', title: 'What should we change?', maxEntries: 1 },
      { id: 'rank0001', type: 'ranking', title: 'Order these priorities', options: [{ id: 'rnka', label: 'Speed' }, { id: 'rnkb', label: 'Quality' }, { id: 'rnkc', label: 'Cost' }] },
      { id: 'surv0001', type: 'survey', title: 'Session feedback', polls: [
        { id: 'srat0001', type: 'rating', title: 'Overall', max: 5 },
        { id: 'sopn0001', type: 'open', title: 'One thing to improve', maxEntries: 1 },
      ] },
    ];
    // ---- Plans: what Free refuses, then paying for Pro on the development payment page
    const sessionUrl = `${BASE}/app/session?id=${sessionId}`;
    const planNow = async () => (await api('GET', '/api/account')).body.plan;
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `rate10${String(i).padStart(2, '0')}`, type: 'rating', title: `Poll ${i + 1}`, max: 5 }));
    const refused = [
      (await api('PUT', `/api/sessions/${sessionId}`, { interactions: [choice, ...more, quiz] })).status,
      (await api('PUT', `/api/sessions/${sessionId}`, { interactions: nine })).status,
      (await api('GET', `/api/sessions/${sessionId}/results?format=csv`)).status,
      (await api('GET', `/api/sessions/${sessionId}/results?format=xlsx`)).status,
    ];
    check('Free: a survey, a 9th poll and the downloads are refused, and nothing is saved',
      refused.join() === '402,402,402,402' && (await api('GET', `/api/sessions/${sessionId}`)).body.interactions.length === 2 && (await planNow()) === 'free', refused.join());
    /* An outcome nobody signed, posted the way the payment page posts one. */
    const forgedPay = await p.evaluate(async () => {
      const body = new URLSearchParams({ status: 'success', key: 'dev', txnid: 'x', amount: '588.00', udf1: 'dev-walk-example-com', hash: 'f'.repeat(128) });
      const r = await fetch('/api/billing/return', { method: 'POST', body });
      return r.url;
    });
    check('Free: a made-up payment outcome is not believed', /payment=failed/.test(forgedPay) && (await planNow()) === 'free', forgedPay);
    await p.click('.hostlist button.primary:has-text("Add")');
    await p.waitForSelector('button.typecard:has-text("Survey") .pill-pro', WAIT);
    await p.screenshot({ path: path.join(OUT, '01b-host-add-free.png') });
    await p.click('button.typecard:has-text("Survey")');
    await p.waitForURL(/\/app\/account$/, FIRST);
    await p.waitForSelector('#plan .pill-pro:has-text("Free")', FIRST);
    check('Free: Survey is marked Pro on the types to add, and opens the account page', true);
    await p.screenshot({ path: path.join(OUT, '01c-account-free.png') });
    const payWith = async (button, period, rupees) => {
      await p.fill('#plan label:has-text("Name") input', 'Walk Tester');
      await p.fill('#plan label:has-text("Mobile number") input', '98765 43210');
      await p.click(`#plan .chips button:has-text("${period}")`);
      await p.click(`#plan button:has-text("Pay ₹${rupees}")`);
      await p.waitForSelector('h1:has-text("Development payment page")', FIRST);
      const asked = await p.textContent('main');
      if (!asked.includes(`₹${rupees}.00`) || !asked.includes(`Pro ${period}`)) throw new Error(`the payment page asked for: ${asked}`);
      const posted = await p.$$eval(`form:has(button:text-is("${button}")) input`, (els) => Object.fromEntries(els.map((e) => [e.name, e.value])));
      await p.click(`button:text-is("${button}")`);
      await p.waitForURL(/\/app\/account$/, FIRST);
      return posted;
    };
    await payWith('Fail', '1 month', 79);
    await p.waitForSelector('#plan [role="alert"]:has-text("Payment not completed")', WAIT);
    check('a payment for 1 month at ₹79 that fails leaves the account on Free', (await planNow()) === 'free');
    const paid = await payWith('Pay', '12 months', 588);
    await p.waitForSelector('#plan [role="status"]:has-text("Payment received")', WAIT);
    await p.waitForSelector('#plan:has-text("Pro until")', WAIT);
    const account = (await api('GET', '/api/account')).body;
    const days = Math.round((account.proUntil * 1000 - Date.now()) / 86400000);
    check('a payment for 12 months at ₹588 that succeeds puts the account on Pro for 365 days', account.plan === 'pro' && days === 365, `${account.plan} ${days}`);
    await p.screenshot({ path: path.join(OUT, '01d-account-pro.png') });
    /* The same signed outcome posted a second time, as a reload of the return would. */
    const paidAgain = await p.evaluate(async (fields) => (await fetch('/api/billing/return', { method: 'POST', body: new URLSearchParams(fields) })).url, paid);
    check('the same payment reported again adds nothing', /payment=paid/.test(paidAgain) && (await api('GET', '/api/account')).body.proUntil === account.proUntil, paidAgain);
    await p.goto(sessionUrl, FIRST);
    await p.waitForSelector('input[aria-label="Session name"]', FIRST);

    const put = await api('PUT', `/api/sessions/${sessionId}`, { interactions: [choice, ...more, quiz] });
    check('on Pro the API takes the remaining polls, with the survey', put.status === 200 && put.body.interactions.length === 7, String(put.status));
    await p.reload();
    await p.waitForSelector('.icard:has-text("Session feedback")', WAIT);
    host = (await api('GET', `/api/sessions/${sessionId}`)).body;
    const code = host.code;

    // ---- The big screen: a projector that is not signed in, opened with the display key
    const projector = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const wall = await projector.newPage(); wall.setDefaultTimeout(20000);
    wall.on('pageerror', (e) => errs.push('wall: ' + e));
    await wall.goto(`${BASE}/present?id=${sessionId}#k=${host.displayKey}`, FIRST);
    await wall.waitForSelector(`text=# ${code.slice(0, 3)} ${code.slice(3)}`, FIRST);
    check('the big screen opens with the display key and shows the code', true);

    // ---- Five phones join with the code on the front page
    const phones = [];
    for (let i = 0; i < 5; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const ph = await ctx.newPage(); ph.setDefaultTimeout(20000);
      ph.on('pageerror', (e) => errs.push(`phone ${i}: ` + e));
      await ph.goto(`${BASE}/`, FIRST);
      await ph.fill('#code', code);
      await ph.click('button[aria-label="Join"]');
      await ph.waitForSelector('button[role="tab"]:has-text("Q&A")', FIRST);
      phones.push(ph);
    }
    const phoneApi = (ph, method, url, body) => ph.evaluate(async ({ method, url, body }) => {
      const token = localStorage.getItem('la-token');
      const r = await fetch(url.replace('{t}', token), { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify({ token, ...body }) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, { method, url, body });
    await wall.waitForFunction(() => document.querySelector('.wall aside > .num')?.textContent.trim() === '5', null, WAIT);
    check('five phones joined without an account', true);
    await phones[0].screenshot({ path: path.join(OUT, '02-phone-qa-empty.png') });

    // ---- Q&A: open for the whole session
    const Q1 = 'Will targets change mid-year?', Q2 = 'When is the new CRM live?';
    /* The ask row opens a sheet: the question, a name (left empty, the question is anonymous), Send. */
    const askFrom = async (ph, text, name) => {
      await ph.click('button.askrow');
      await ph.fill('textarea[aria-label="Your question"]', text);
      if (name !== undefined) await ph.fill('[role="dialog"] input[aria-label="Your name"]', name);
      await ph.click('[role="dialog"] button:has-text("Send")');
      await ph.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 30000 });
    };
    await askFrom(phones[0], Q1, 'Asha');
    for (const ph of phones) await ph.waitForSelector(`.question:has-text("${Q1}")`, WAIT);
    check('Q&A: a question reaches every phone, with the name given', (await phones[3].textContent('.question .name')) === 'Asha');
    for (const i of [1, 2, 3]) await phones[i].click(`.question:has-text("${Q1}") button.votes`);
    await wall.waitForFunction((t) => [...document.querySelectorAll('.wq')].some((e) => e.textContent.includes(t) && e.querySelector('.head .num').textContent.trim() === '3'), Q1, WAIT);
    check('Q&A: upvotes are counted on the big screen', true);
    const list = (await phoneApi(phones[1], 'GET', `/api/live/${sessionId}/qa?t={t}`)).body.questions;
    const dup = await phoneApi(phones[1], 'POST', `/api/live/${sessionId}/qa/${list[0].id}/vote`, {});
    check('Q&A: a second upvote from the same phone is refused', dup.status === 409 && list[0].votes === 3, `${dup.status}:${list[0].votes}`);
    check('Q&A: no phone is sent another person\'s token', !JSON.stringify(list).includes('token'));

    // Taking a question back: only its asker can
    const notMine = await phoneApi(phones[2], 'POST', `/api/live/${sessionId}/qa/${list[0].id}/withdraw`, {});
    await askFrom(phones[3], 'Asked by mistake');
    await phones[4].waitForSelector('.question:has-text("Asked by mistake")', WAIT);
    await phones[3].click('.question:has-text("Asked by mistake") button[aria-label="Your question"]');
    await phones[3].click('button:has-text("Withdraw")');
    await phones[3].click('[role="alertdialog"] button:has-text("Withdraw")');
    await phones[4].waitForSelector('.question:has-text("Asked by mistake")', { state: 'detached', timeout: 30000 });
    await p.waitForSelector('.qrow:has-text("Asked by mistake")', { state: 'detached', timeout: 30000 });
    check('Q&A: a question is withdrawn by its asker, and by nobody else', notMine.status === 404 && (await p.$$('.qrow:has-text("Asked by mistake")')).length === 0, String(notMine.status));

    // Review before showing
    await p.click('button:has-text("Q&A settings")');
    await p.check('label.switch:has-text("Review questions") input');
    await p.waitForSelector('[role="status"]:has-text("Saved")', WAIT);
    await p.click('button[aria-label="Close panel"]');
    await askFrom(phones[1], Q2);
    await phones[1].waitForSelector('text=Waiting for review', WAIT);
    await p.waitForSelector(`.qrow:has-text("${Q2}") button[aria-label="Approve"]`, WAIT);
    check('Q&A: a question waiting for review shows only to its asker and the facilitator',
      (await phones[2].$$(`.question:has-text("${Q2}")`)).length === 0 && (await wall.$$(`.wq:has-text("${Q2}")`)).length === 0);
    await p.screenshot({ path: path.join(OUT, '03-host-qa-review.png') });
    await p.click(`.qrow:has-text("${Q2}") button[aria-label="Approve"]`);
    for (const ph of phones) await ph.waitForSelector(`.question:has-text("${Q2}")`, WAIT);
    const names = await phones[3].$$eval('.question .name', (els) => els.map((e) => e.textContent).sort().join('|'));
    check('Q&A: an approved question shows to everyone, as Anonymous when asked that way', names === 'Anonymous|Asha', names);

    // Reply, highlight, announcement
    await p.click('.qtabs button:has-text("Live")');
    await p.click(`.qrow:has-text("${Q1}") button[aria-label="Reply"]`);
    await p.fill('textarea[aria-label="Your reply"]', 'Targets stay as set in April.');
    await p.click('.sidepanel button:has-text("Send")');
    await phones[4].waitForSelector('.reply:has-text("Targets stay as set in April.")', WAIT);
    check('Q&A: the facilitator\'s reply shows under the question on phones', true);
    await p.waitForSelector('.sidepanel .qrow:has-text("Targets stay as set in April.")', WAIT);
    await p.screenshot({ path: path.join(OUT, '03b-host-reply.png') });
    await p.click('button[aria-label="Close panel"]');
    await p.click(`.qrow:has-text("${Q1}") button[aria-label="Highlight"]`);
    await wall.waitForSelector(`.wq.highlighted:has-text("${Q1}")`, WAIT);
    await phones[4].waitForSelector(`.question.highlighted:has-text("${Q1}")`, WAIT);
    check('Q&A: the highlighted question stands out on the big screen and on phones', true);
    await p.fill('input[aria-label="Announcement"]', 'Slides will be shared after the session.');
    await p.click('button:has-text("Post")');
    await phones[2].waitForSelector('.announce:has-text("Slides will be shared after the session.")', WAIT);
    check('Q&A: the announcement shows at the top of the Q&A tab', true);
    await wall.screenshot({ path: path.join(OUT, '04-wall-qa.png') });
    await phones[4].screenshot({ path: path.join(OUT, '05-phone-qa.png') });
    await p.screenshot({ path: path.join(OUT, '05b-host-qa-highlight.png') });
    await p.click(`.qrow:has-text("${Q1}") button[aria-label="Mark answered"]`);
    await wall.waitForSelector('.wq.highlighted', { state: 'detached', timeout: 10000 });
    check('Q&A: marking a question answered clears the highlight', true);

    // Closing questions
    await p.click('button:has-text("Close Q&A")');
    await p.click('[role="alertdialog"] button:has-text("Close Q&A")');
    await phones[3].waitForSelector('text=Questions closed', WAIT);
    const lateAsk = await phoneApi(phones[3], 'POST', `/api/live/${sessionId}/qa`, { text: 'Too late?', anonymous: true });
    await phones[3].click(`.question:has-text("${Q2}") button.votes`);
    await phones[0].waitForFunction((t) => [...document.querySelectorAll('.question')].some((e) => e.textContent.includes(t) && e.querySelector('.votes').textContent.trim() === '1'), Q2, WAIT);
    check('Q&A: closed questions refuse a new one and still take upvotes', lateAsk.status === 409, String(lateAsk.status));
    await p.click('button:has-text("Open Q&A")');
    // A question half typed must survive the sheet closing and the phone jumping to the Polls tab.
    await phones[2].waitForSelector('button.askrow', WAIT);
    await phones[2].click('button.askrow');
    await phones[2].fill('textarea[aria-label="Your question"]', 'Half typed when the poll started');
    await phones[2].click('[role="dialog"] button[aria-label="Close ask"]');

    // ---- Multiple choice: start, vote, change a vote, lock, hide results
    const early = await phoneApi(phones[0], 'POST', `/api/live/${sessionId}/answer`, { pollId: choice.id, answer: { optionIds: [choice.options[0].id] } });
    check('polls: an answer before the poll is started is refused', early.status === 409, String(early.status));
    await p.click('button[aria-label="Start Where should we go?"]');
    for (const ph of phones) await ph.waitForSelector('.poll-title:has-text("Where should we go?")', WAIT);
    check('polls: starting a poll brings it up on every phone', true);
    await phones[2].click('button[role="tab"]:has-text("Q&A")');
    await phones[2].click('button.askrow');
    const kept = await phones[2].inputValue('textarea[aria-label="Your question"]');
    check('a question half typed is still there after the phone jumps to the poll', kept === 'Half typed when the poll started', kept);
    await phones[2].fill('textarea[aria-label="Your question"]', '');
    await phones[2].click('[role="dialog"] button[aria-label="Close ask"]');
    await phones[2].click('button[role="tab"]:has-text("Polls")');
    await phones[0].screenshot({ path: path.join(OUT, '06-phone-poll.png') });
    const picks = ['Goa', 'Goa', 'Coorg', 'Goa', 'Lonavala'];
    for (let i = 0; i < 5; i++) { await phones[i].click(`label.option:has-text("${picks[i]}")`); await phones[i].click('button:has-text("Send"):visible'); await phones[i].waitForSelector('text=Sent', WAIT); }
    const bars = () => wall.$$eval('.bar', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
    await wall.waitForFunction(() => /Goa\s*60%/.test(document.querySelector('.panel')?.textContent ?? ''), null, WAIT);
    check('polls: the big screen shows the shares as votes arrive', /Goa\s?60%.*Coorg\s?20%.*Lonavala\s?20%/.test(await bars()), await bars());
    await wall.screenshot({ path: path.join(OUT, '07-wall-poll.png') });
    await phones[1].screenshot({ path: path.join(OUT, '06b-phone-voted.png') });
    check('after answering, the phone shows the results and offers a session of one\'s own', (await phones[1].$$('.card .bar')).length === 3 && !!(await phones[1].$('.offer a:has-text("Create a session")')));
    await phones[0].click('button:has-text("Edit response")');
    await phones[0].click('label.option:has-text("Coorg")');
    await phones[0].click('button:has-text("Send"):visible');
    await wall.waitForFunction(() => /Goa\s*40%/.test(document.querySelector('.panel')?.textContent ?? ''), null, WAIT);
    host = (await api('GET', `/api/sessions/${sessionId}`)).body;
    check('polls: a changed vote moves to the new option and the person is still counted once',
      /Goa\s?40%.*Coorg\s?40%.*Lonavala\s?20%/.test(await bars()) && host.tally.people === 5 && Object.values(host.tally.counts).reduce((a, n) => a + n, 0) === 5, `${await bars()} · ${host.tally.people} people`);
    await p.click('.startbar button[aria-label="Close voting"]');
    await phones[1].waitForSelector('text=Voting closed', WAIT);
    const locked = await phoneApi(phones[1], 'POST', `/api/live/${sessionId}/answer`, { pollId: choice.id, answer: { optionIds: [choice.options[2].id] } });
    check('polls: locked voting refuses a change', locked.status === 409, String(locked.status));
    await p.click('.startbar button[aria-label="Hide results"]');
    await wall.waitForSelector('text=Results are hidden', WAIT);
    const hidden = (await phoneApi(phones[2], 'GET', `/api/live/${sessionId}?t={t}`)).body;
    check('polls: hidden results are kept from phones and the big screen', hidden.active.tally === null && (await wall.$$('.bar')).length === 0);
    await p.click('.startbar button[aria-label="Show results"]');
    await p.waitForFunction(() => [...document.querySelectorAll('.dcard .opt .val')].map((e) => e.textContent).join() === '40%,40%,20%', null, WAIT);
    check('polls: the facilitator sees each option\'s share under it', true);
    await p.screenshot({ path: path.join(OUT, '07b-host-poll.png') });

    // ---- AI: the debrief of the poll, a follow-up written from it and launched, then taken out again
    await p.click('.ai button:has-text("Debrief")');
    await p.waitForSelector('section[aria-label="LearnBox Debrief"]', WAIT);
    const parts = await p.$$eval('.ai-part h4', (els) => els.map((e) => e.textContent));
    const happened = await p.textContent('.ai-part p');
    await p.click('button:has-text("Generate another")');
    await p.waitForSelector('.ai-card:has-text("2 / ")', WAIT);
    const cached = await api('GET', `/api/sessions/${sessionId}/ai?interaction=${choice.id}`);
    check('AI: the debrief has its four parts, is written from the poll\'s numbers, and a second one is counted',
      parts.join() === 'What happened,What to explore,Ask the room,Facilitator tip' && /5 people answered/.test(happened) && cached.body.debrief?.interactionId === choice.id && cached.body.usage.debrief.used === 2 && !/Never invent/.test(JSON.stringify(cached.body)),
      `${parts.join()} | ${happened}`);
    await p.screenshot({ path: path.join(OUT, '07c-host-debrief.png') });
    const tooFew = await api('POST', `/api/sessions/${sessionId}/ai`, { feature: 'debrief', interactionId: 'cloud-not-yet' });
    const noAnswers = await api('POST', `/api/sessions/${sessionId}/ai`, { feature: 'debrief', interactionId: host.interactions[1].id });
    const failed = await api('POST', `/api/sessions/${sessionId}/ai`, { feature: 'debrief', interactionId: choice.id, again: true }, { ...AUTH, 'x-ai-test': 'fail' });
    const otherAi = await api('POST', `/api/sessions/${sessionId}/ai`, { feature: 'debrief', interactionId: choice.id }, { authorization: 'Bearer dev:someone@else.com', 'content-type': 'application/json' });
    check('AI: too few answers, a failed model call and another account are each refused in their own way',
      tooFew.status === 404 && noAnswers.status === 409 && /Not enough responses yet/.test(noAnswers.body.error) && failed.status === 502 && /couldn.t generate this right now/.test(failed.body.error) && otherAi.status === 404,
      `${tooFew.status},${noAnswers.status},${failed.status},${otherAi.status}`);
    await p.click('.ai .chips button:has-text("Explore")');
    await p.waitForSelector('button:has-text("Launch this interaction")', WAIT);
    const proposed = await p.textContent('section[aria-label="Follow up with the room"] .sub .strong');
    await p.click('button:has-text("Launch this interaction")');
    await p.waitForSelector('.icard.selected.active', WAIT);
    for (const ph of phones) await ph.waitForSelector(`.poll-title:has-text("${proposed.slice(0, 30)}")`, WAIT);
    await phones[0].fill('textarea[aria-label="Your answer"]', 'Because it is close to the office');
    await phones[0].click('button:has-text("Send"):visible');
    await p.waitForSelector('.icard.selected:has-text("1 answered")', WAIT);
    check('AI: the follow-up is launched into the session with one click and takes answers like any poll', true, proposed);
    await p.screenshot({ path: path.join(OUT, '07d-host-followup.png') });
    await p.click('.startbar button:has-text("Stop")');
    await p.click('.icard.selected button[aria-label^="More for"]');
    await p.click('[role="menu"] button:has-text("Delete")');
    await p.click('[role="alertdialog"] button:has-text("Delete")');
    await p.waitForFunction(() => document.querySelectorAll('.hostlist .icard').length === 8, null, WAIT);

    // ---- Word cloud, rating, open text, ranking
    await p.click('button[aria-label="Start One word for this year"]');
    for (const ph of phones) await ph.waitForSelector('.poll-title:has-text("One word for this year")', WAIT);
    /* A poll that is no longer running still shows its results when opened. */
    await p.click('.icard:has-text("Where should we go?") button.title');
    await p.waitForFunction(() => [...document.querySelectorAll('.dcard .opt .val')].map((e) => e.textContent).join() === '40%,40%,20%', null, WAIT);
    check('polls: a poll that has stopped shows its stored results when opened', true);
    await p.click('.icard:has-text("One word for this year") button.title');
    const words = [['Growth', 'trust'], ['growth'], ['Trust.'], ['speed'], ['growth']];
    for (let i = 0; i < 5; i++) for (const w of words[i]) { await phones[i].fill('input[aria-label="Your word"]', w); await phones[i].click('button:has-text("Send"):visible'); await phones[i].waitForFunction(() => document.querySelector('input[aria-label="Your word"]')?.value === '', null, WAIT); }
    await wall.waitForSelector('.cloud span:has-text("speed")', WAIT);
    const cloud = await wall.$$eval('.cloud span', (s) => s.map((x) => x.textContent));
    check('word cloud: words are merged whatever their case and punctuation', cloud[0] === 'growth' && cloud.includes('trust') && cloud.length === 3, cloud.join(','));

    await p.click('button[aria-label="Start How was the quarter?"]');
    for (const ph of phones) await ph.waitForSelector('.poll-title:has-text("How was the quarter?")', WAIT);
    const ratings = [5, 4, 4, 3, 5];
    for (let i = 0; i < 5; i++) { await phones[i].click(`.scale button:text-is("${ratings[i]}")`); await phones[i].click('button:has-text("Send"):visible'); }
    await wall.waitForSelector('.average:has-text("4.2")', WAIT);
    check('rating: the average shows on the big screen', true);

    await p.click('button[aria-label="Start What should we change?"]');
    for (const ph of phones) await ph.waitForSelector('.poll-title:has-text("What should we change?")', WAIT);
    for (let i = 0; i < 3; i++) { await phones[i].fill('textarea[aria-label="Your answer"]', `Idea number ${i + 1}`); await phones[i].click('button:has-text("Send"):visible'); }
    await wall.waitForSelector('.texts > div >> nth=2', WAIT);
    const blocked = await phoneApi(phones[4], 'POST', `/api/live/${sessionId}/answer`, { pollId: 'open0001', answer: { text: 'this is shit' } });
    check('open text: answers show on the big screen, and a blocked word is refused', (await wall.$$('.texts > div')).length === 3 && blocked.status === 400, String(blocked.status));

    await p.click('button[aria-label="Start Order these priorities"]');
    for (const ph of phones) await ph.waitForSelector('.poll-title:has-text("Order these priorities")', WAIT);
    // Phones 0-2 move Quality to the top; phones 3-4 send the order as listed (Speed, Quality, Cost).
    for (let i = 0; i < 5; i++) {
      if (i < 3) await phones[i].click('.rank-row:has-text("Quality") button[aria-label="Move up"]');
      await phones[i].click('button:has-text("Send"):visible');
      await phones[i].waitForSelector('text=Sent', WAIT);
    }
    /* Wait for the last phone's order to reach the big screen, not only the first. */
    await wall.waitForFunction(() => document.querySelectorAll('.bar').length === 3 && /^1\.\s*Quality\s*13/.test(document.querySelector('.bar')?.textContent ?? ''), null, WAIT).catch(() => {});
    const order = await wall.$$eval('.bar', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
    check('ranking: the big screen shows the combined order with points', /1\. Quality\s?13.*2\. Speed\s?12.*3\. Cost\s?5/.test(order), order);
    await wall.screenshot({ path: path.join(OUT, '08-wall-ranking.png') });

    // ---- Survey: every question on one page, one Send
    await p.click('button[aria-label="Start Session feedback"]');
    for (const ph of phones) await ph.waitForSelector('.poll-title:has-text("Session feedback")', WAIT);
    for (let i = 0; i < 2; i++) {
      await phones[i].click('.scale button:text-is("4")');
      await phones[i].fill('textarea[aria-label="Your answer"]', `Shorter breaks ${i + 1}`);
      await phones[i].click('button:has-text("Send"):visible');
      await phones[i].waitForSelector('text=Sent', WAIT);
    }
    await phones[0].screenshot({ path: path.join(OUT, '09-phone-survey.png') });
    await p.waitForFunction(() => (document.body.textContent.match(/2 answered/g) ?? []).length >= 2, null, WAIT);
    check('survey: sent in one go and counted for the facilitator', true);

    // ---- Quiz: names, timed questions, reveal, leaderboard
    const [qq1] = quiz.questions;
    await p.click('button[aria-label="Start Planets"]');
    const NAMES = ['Asha', 'Rohan', 'Meera', 'Kabir', 'Dev'];
    for (let i = 0; i < 5; i++) {
      await phones[i].waitForSelector('.poll-label:has-text("Planets")', WAIT);
      if (i === 0) continue; // Asha gave her name with her question
      await phones[i].fill('label:has-text("Your name") input', NAMES[i]);
      await phones[i].click('button:has-text("Join quiz")');
      await phones[i].waitForSelector(`.notice:has-text("${NAMES[i]}")`, WAIT);
    }
    await wall.waitForSelector('.panel:has-text("Planets")', WAIT);
    const beforeStart = await phoneApi(phones[4], 'POST', `/api/live/${sessionId}/answer`, { pollId: qq1.id, answer: { optionId: qq1.correctId } });
    check('quiz: an answer before the first question is refused', beforeStart.status === 409, String(beforeStart.status));
    await p.click('button:has-text("First question")');
    for (const ph of phones) await ph.waitForSelector('.option:has-text("Jupiter"):not([disabled])', WAIT);
    const sent = (await phoneApi(phones[0], 'GET', `/api/live/${sessionId}?t={t}`)).body;
    check('quiz: the phone is not sent the correct answer', sent.active.question.correctId === '' && !sent.state.quiz.correct && !sent.active.tally);
    await phones[0].screenshot({ path: path.join(OUT, '10-phone-quiz.png') });
    await phones[0].click('.option:has-text("Jupiter")');
    await phones[1].waitForTimeout(1500);
    await phones[1].click('.option:has-text("Jupiter")');
    await phones[2].waitForTimeout(1500);
    await phones[2].click('.option:has-text("Jupiter")');
    await phones[3].click('.option:has-text("Mars")');
    await wall.waitForSelector('text=4 answered', WAIT);
    check('quiz: the big screen shows the countdown and no votes while the question is open', !!(await wall.$('.timer')) && (await wall.$$('.bar-fill')).length === 0);
    await wall.screenshot({ path: path.join(OUT, '11-wall-quiz-open.png') });
    const twice = await phoneApi(phones[0], 'POST', `/api/live/${sessionId}/answer`, { pollId: qq1.id, answer: { optionId: qq1.options[0].id } });
    check('quiz: a second answer from the same phone is refused', twice.status === 409, String(twice.status));
    await p.click('button:has-text("Reveal answer")');
    await wall.waitForSelector('.bar.correct:has-text("Jupiter")', WAIT);
    const spread = (await wall.textContent('.bars')).replace(/\s+/g, ' ');
    check('quiz: the reveal marks the correct answer and shows how people voted', /Jupiter ✓\s*3/.test(spread) && /Mars\s*1/.test(spread), spread);
    await wall.screenshot({ path: path.join(OUT, '12-wall-quiz-reveal.png') });
    await phones[0].waitForSelector('text=1 / 4', WAIT);
    await phones[1].waitForSelector('text=2 / 4', WAIT);
    await phones[3].waitForSelector('text=Incorrect', WAIT);
    await phones[4].waitForSelector('text=No answer', WAIT);
    const pts = async (ph) => Number(((await ph.textContent('.result-line')).match(/\+([\d,]+)/) || [])[1]?.replace(/,/g, '') ?? -1);
    const [a0, a1] = [await pts(phones[0]), await pts(phones[1])];
    check('quiz: a correct answer earns 500 to 1,000 points, more for the faster one', a0 > a1 && a1 >= 500 && a0 <= 1000, `${a0} > ${a1}`);
    await phones[0].screenshot({ path: path.join(OUT, '13-phone-quiz-result.png') });
    const late = await phoneApi(phones[4], 'POST', `/api/live/${sessionId}/answer`, { pollId: qq1.id, answer: { optionId: qq1.correctId } });
    check('quiz: an answer after the reveal is refused', late.status === 409, String(late.status));

    await p.click('button:has-text("Next question")');
    for (const ph of phones) await ph.waitForSelector('.option:has-text("Mercury"):not([disabled])', WAIT);
    await phones[1].click('.option:has-text("Mercury")');
    await phones[4].click('.option:has-text("Mercury")');
    await phones[0].click('.option:has-text("Venus")');
    await wall.waitForSelector('text=3 answered', WAIT);
    await p.click('button:has-text("Reveal answer")');
    await wall.waitForSelector('.bar.correct:has-text("Mercury")', WAIT);
    await p.click('button:has-text("Leaderboard")');
    await wall.waitForSelector('.board-row.first:has-text("Rohan")', WAIT);
    const board = await wall.$$eval('.board-row', (els) => els.map((e) => e.children[1].textContent).join(','));
    check('quiz: the final leaderboard is in points order', board.startsWith('Rohan,') && board.split(',').length === 5, board);
    await phones[1].waitForSelector('text=1 / 5', WAIT);
    check('quiz: a phone shows its own place', true);
    await wall.screenshot({ path: path.join(OUT, '14-wall-leaderboard.png') });
    await phones[1].screenshot({ path: path.join(OUT, '15-phone-leaderboard.png') });
    await p.screenshot({ path: path.join(OUT, '16-host-quiz.png') });
    const again = await api('PATCH', `/api/sessions/${sessionId}`, { action: 'quiz-next' });
    check('quiz: a finished quiz does not start again', again.status === 409, String(again.status));

    // ---- The ways around the rules that must be refused
    const other = { authorization: 'Bearer dev:someone@else.com', 'content-type': 'application/json' };
    const key = { 'x-display-key': host.displayKey, 'content-type': 'application/json' };
    const tries = [
      (await api('GET', `/api/sessions/${sessionId}`, undefined, other)).status,
      (await api('GET', `/api/sessions/${sessionId}/results`, undefined, other)).status,
      (await api('PATCH', `/api/sessions/${sessionId}`, { action: 'activate', id: null }, other)).status,
      (await api('PUT', `/api/sessions/${sessionId}`, { title: 'Taken' }, other)).status,
      (await api('DELETE', `/api/sessions/${sessionId}`, undefined, other)).status,
      (await api('PATCH', `/api/sessions/${sessionId}/qa/x`, { action: 'approve' }, other)).status,
    ];
    check('another account gets "not found" for this session, whatever it tries', tries.every((s) => s === 404), tries.join());
    const withKey = [
      (await api('GET', `/api/sessions/${sessionId}?view=wall`, undefined, key)).status,
      (await api('GET', `/api/sessions/${sessionId}`, undefined, key)).status,
      (await api('PATCH', `/api/sessions/${sessionId}`, { action: 'activate', id: null }, key)).status,
      (await api('GET', `/api/sessions/${sessionId}/results`, undefined, key)).status,
    ];
    check('the display key opens the big screen and nothing else', withKey.join() === '200,401,401,401', withKey.join());
    /* Same length as the real key, one character changed: refused, and never an error from the comparison. */
    const badKey = (await api('GET', `/api/sessions/${sessionId}?view=wall`, undefined, { 'x-display-key': `${host.displayKey.slice(0, -1)}!` })).status;
    check('a wrong display key is refused', badKey === 401, String(badKey));
    const hostNow = (await api('GET', `/api/sessions/${sessionId}`)).body;
    const staleEdit = await api('PUT', `/api/sessions/${sessionId}`, { title: 'From an old window', rev: hostNow.rev - 1 });
    check('an edit made from an older copy of the session is refused, not saved over the newer one', staleEdit.status === 409 && /another window/.test(staleEdit.body.error) && (await api('GET', `/api/sessions/${sessionId}`)).body.title === 'Team offsite', `${staleEdit.status}`);
    const wallData = JSON.stringify((await api('GET', `/api/sessions/${sessionId}?view=wall`, undefined, key)).body);
    check('the big screen is sent no display key, token or waiting question', !wallData.includes(host.displayKey) && !wallData.includes('token') && !wallData.includes('"pending"'));
    const forged = await phones[0].evaluate(async (sid) => (await fetch(`/api/live/${sid}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'x', pollId: 'y', answer: {} }) })).status, sessionId);
    const stranger = await phones[0].evaluate(async (sid) => (await fetch(`/api/live/${sid}/qa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'never-joined-0000000001', text: 'Hello?', anonymous: true }) })).status, sessionId);
    check('a made-up or unjoined phone is refused', forged === 400 && stranger === 403, `${forged},${stranger}`);

    // ---- Results and downloads
    await p.click('.startbar button:has-text("Stop")');
    await phones[2].waitForSelector('button[role="tab"][aria-selected="true"]:has-text("Q&A")', WAIT);
    check('when the quiz is stopped, a phone goes back to the Q&A', true);
    await p.waitForFunction(() => [...document.querySelectorAll('.dcard .sub .opt.correct .val')].map((e) => e.textContent).join() === '3,2', null, WAIT);
    check('quiz: once played, its questions show how people voted', true);
    await p.click('a[aria-label="Results"]');
    await p.waitForURL(/\/app\/session\/results\?id=/, FIRST);
    await p.waitForSelector('text=Download CSV', FIRST);
    await p.waitForSelector('h2:has-text("Leaderboard")', WAIT);
    await p.screenshot({ path: path.join(OUT, '17-results.png'), fullPage: true });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download CSV")')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check('CSV has every poll', /"Goa","2"/.test(csv) && /"Coorg","2"/.test(csv) && /"growth","3"/.test(csv) && /"Idea number 2"/.test(csv) && /"5","2"/.test(csv) && /"Quality","13"/.test(csv) && /"Part of","Session feedback"/.test(csv), csv.split('\r\n').slice(0, 4).join(' | '));
    check('CSV has the quiz, the leaderboard and the questions with their replies',
      csv.includes('"Jupiter","3","Yes"') && /"Leaderboard","Planets"\r\n"Rank","Name","Points"\r\n"1","Rohan","\d+"/.test(csv)
      && csv.includes(`"${Q1}","Asha","3","Answered","Targets stay as set in April."`) && csv.includes(`"${Q2}","Anonymous","1","Approved"`));
    const [xl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download Excel")')]);
    const xlsx = fs.readFileSync(await xl.path());
    check('Excel file downloads', xl.suggestedFilename().endsWith('.xlsx') && xlsx.length > 4000 && xlsx.subarray(0, 2).toString() === 'PK', `${xl.suggestedFilename()} ${xlsx.length} bytes`);
    const full = JSON.stringify((await api('GET', `/api/sessions/${sessionId}/results`)).body);
    check('results carry no phone tokens', !/"token"/.test(full));

    // ---- Duplicate, end, delete
    const copy = await api('POST', '/api/sessions', { from: sessionId });
    const copied = (await api('GET', `/api/sessions/${copy.body.session.id}`)).body;
    check('a duplicate has the same polls, a new code and no answers', copy.status === 201 && copied.interactions.length === 7 && copied.code !== code && Object.keys(copied.answered).length === 0 && copied.questions.length === 0);
    // ---- Reset results: a vote in the copy, cleared from the poll's menu
    const copyId = copy.body.session.id;
    const [copyPoll] = copied.interactions;
    await phoneApi(phones[1], 'POST', `/api/live/${copyId}`, {});
    await api('PATCH', `/api/sessions/${copyId}`, { action: 'activate', id: copyPoll.id });
    const copyVote = await phoneApi(phones[1], 'POST', `/api/live/${copyId}/answer`, { pollId: copyPoll.id, answer: { optionIds: [copyPoll.options[0].id] } });
    const whileRunning = await api('PATCH', `/api/sessions/${copyId}`, { action: 'reset', id: copyPoll.id });
    await api('PATCH', `/api/sessions/${copyId}`, { action: 'activate', id: null });
    const notMineReset = await api('PATCH', `/api/sessions/${copyId}`, { action: 'reset', id: copyPoll.id }, other);
    await p.goto(`${BASE}/app/session?id=${copyId}`, FIRST);
    await p.waitForSelector('.icard:has-text("Where should we go?"):has-text("1 answered")', FIRST);
    await p.click('button[aria-label="More for Where should we go?"]');
    await p.click('[role="menu"] button:has-text("Reset results")');
    await p.click('[role="alertdialog"] button:has-text("Reset results")');
    await p.waitForSelector('.icard:has-text("Where should we go?"):has-text("0 answered")', WAIT);
    const cleared = (await api('GET', `/api/sessions/${copyId}`)).body.answered[copyPoll.id] ?? 0;
    check('Reset results clears a stopped poll\'s answers; it is refused while the poll runs, and for another account',
      copyVote.status === 200 && whileRunning.status === 409 && notMineReset.status === 404 && cleared === 0, `${copyVote.status},${whileRunning.status},${notMineReset.status},${cleared}`);

    // ---- Feedback: the fixed questions plus one of the facilitator's own, answered during the session and after it has ended
    await p.click('button:has-text("Add feedback")');
    await p.waitForSelector('.dtitle:has-text("Feedback")', WAIT);
    const fixedShown = await p.$$eval('.dcard .sub .strong', (els) => els.map((e) => e.textContent));
    /* Two questions of the facilitator's own, the second moved above the first; the fixed ones stay put. */
    await p.selectOption('label:has-text("Add question") select', 'open');
    await p.fill('.dcard textarea[aria-label="Question"]', 'One thing to keep');
    await p.selectOption('label:has-text("Add question") select', 'rating');
    await (await p.$$('.dcard textarea[aria-label="Question"]'))[1].fill('Rate the trainer');
    await p.click('button[aria-label="Move question 4 up"]');
    await p.waitForFunction(() => /Rate the trainer/.test(document.querySelectorAll('.dcard .sub')[2]?.textContent ?? ''), null, WAIT);
    await p.click('button[aria-label="Remove question 4"]');
    await p.check('label.switch:has-text("Ask for names") input');
    await p.click('button:has-text("Start feedback")');
    await p.waitForSelector('button[aria-label="Stop Feedback"]', WAIT);
    const copyForm = (await api('GET', `/api/sessions/${copyId}`)).body.interactions.find((i) => i.type === 'feedback');
    check('feedback: the form opens with its two fixed questions, takes questions of the facilitator\'s own, and moves them',
      fixedShown.some((t) => /rate this session/.test(t)) && fixedShown.some((t) => /^Comments/.test(t)) && copyForm.polls.map((q) => q.type).join() === 'rating,open,rating' && copyForm.polls[2].title === 'Rate the trainer', `${fixedShown.join('|')} ${JSON.stringify(copyForm.polls.map((q) => q.type))}`);
    await phones[1].goto(`${BASE}/s?c=${copied.code}`);
    await phones[1].waitForSelector('.poll-label:has-text("Feedback")', FIRST);
    const scales = await phones[1].$$('.scale');
    await (await scales[0].$('button:text-is("5")')).click();
    await phones[1].fill('textarea[aria-label="Your answer"]', 'Good pace');
    await (await scales[1].$('button:text-is("4")')).click();
    /* Names are asked for: Send stays off until one is given. */
    const sendOff = await phones[1].$eval('button:has-text("Send"):visible', (b) => b.disabled);
    await phones[1].fill('label:has-text("Your name") input', 'Asha');
    await phones[1].click('button:has-text("Send"):visible');
    await phones[1].waitForSelector('text=Sent', WAIT);
    await phones[1].screenshot({ path: path.join(OUT, '17a-phone-feedback.png') });
    await api('PATCH', `/api/sessions/${copyId}`, { action: 'end' });
    /* Someone who left early opens the link after the end. */
    const joinAfter = await api('GET', `/api/join/${copied.code}`);
    const previewAfter = await (await fetch(`${BASE}/j/${copied.code}`)).text();
    await phones[2].goto(`${BASE}/s?c=${copied.code}`);
    await phones[2].waitForSelector('text=Session ended', FIRST);
    await phones[2].waitForSelector('.poll-label:has-text("Feedback")', WAIT);
    await (await (await phones[2].$$('.scale'))[0].$('button:text-is("3")')).click();
    const nameless = await phoneApi(phones[2], 'POST', `/api/live/${copyId}/answer`, { surveyId: copyForm.id, answers: { [copyForm.polls[0].id]: { value: 3 } } });
    await phones[2].fill('label:has-text("Your name") input', 'Dev');
    await phones[2].click('button:has-text("Send"):visible');
    await phones[2].waitForSelector('text=Sent', WAIT);
    const lateQuestion = await phoneApi(phones[2], 'POST', `/api/live/${copyId}/qa`, { text: 'After the end?', anonymous: true });
    check('feedback: after the session ends the code still opens it, a late phone joins and answers, and nothing else is open',
      joinAfter.status === 200 && /Feedback on Team offsite copy/.test(previewAfter) && lateQuestion.status === 409, `${joinAfter.status} ${lateQuestion.status}`);
    await p.reload();
    await p.waitForSelector('.icard:has(.title span:text-is("Feedback")):has-text("2 answered"):has-text("Open until")', FIRST);
    await p.click('.icard:has(.title span:text-is("Feedback"))');
    await p.waitForSelector('.dcard .average:has-text("4.0")', WAIT);
    await p.screenshot({ path: path.join(OUT, '17b-host-feedback.png') });
    const copyResults = (await api('GET', `/api/sessions/${copyId}/results`)).body;
    const feedbackItems = copyResults.items.filter((i) => i.group === 'Feedback');
    const table = copyResults.items.find((i) => i.kind === 'responses');
    const rowsShown = await p.$$eval('.dcard .rtable tbody tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent).join('|')));
    check('feedback: with names asked for, a nameless answer is refused and each person\'s row shows their name and answers',
      sendOff && nameless.status === 400 && rowsShown.join(';') === 'Asha|5|Good pace|4;Dev|3||' && table.rows.map((r) => r.name).join() === 'Asha,Dev', `${sendOff} ${nameless.status} ${rowsShown.join(';')}`);
    check('feedback: the facilitator sees the average and the comments; the big screen and phones see no results',
      feedbackItems.length === 3 && feedbackItems[0].tally.people === 2 && feedbackItems[1].answers.some((a) => a.answer.text === 'Good pace')
      && (await api('GET', `/api/sessions/${copyId}?view=wall`)).body.tally === null && !/tally|counts|Good pace/.test(JSON.stringify((await phoneApi(phones[2], 'GET', `/api/live/${copyId}?t={t}`)).body)),
      JSON.stringify(feedbackItems.map((i) => i.tally)));

    await p.goto(sessionUrl);
    await p.waitForSelector('input[aria-label="Session name"]', WAIT);
    await p.click('button[aria-label="More"]');
    await p.click('button:has-text("End session")');
    await p.click('[role="alertdialog"] button:has-text("End session")');
    await phones[0].click('button[role="tab"]:has-text("Q&A")');
    await phones[0].waitForSelector('text=Session ended', WAIT);
    await wall.waitForSelector('text=Session ended', WAIT);
    const afterEnd = [
      (await phoneApi(phones[0], 'POST', `/api/live/${sessionId}/qa`, { text: 'After the end?', anonymous: true })).status,
      (await phoneApi(phones[0], 'POST', `/api/live/${sessionId}/answer`, { pollId: choice.id, answer: { optionIds: [choice.options[0].id] } })).status,
      (await api('GET', `/api/join/${code}`)).status,
    ];
    check('an ended session takes no questions or answers, and its code is freed', afterEnd.join() === '409,409,404', afterEnd.join());

    /* The phone's menu: the code, and a way to another session. */
    await phones[0].click('button[aria-label="Menu"]');
    await phones[0].waitForSelector(`[role="dialog"]:has-text("# ${code.slice(0, 3)} ${code.slice(3)}")`, WAIT);
    await phones[0].check('label.switch:has-text("Dark mode") input');
    check('the phone\'s menu shows the code and switches the theme', (await phones[0].evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await phones[0].screenshot({ path: path.join(OUT, '17b-phone-menu.png') });
    await phones[0].click('[role="dialog"] button[aria-label^="Close"]');

    await p.goto(`${BASE}/app`);
    await p.waitForSelector('h1:has-text("Sessions")', FIRST);
    await p.waitForSelector('.srow', WAIT);
    await p.click('.chips button:has-text("Ended")');
    const endedRows = await p.$$eval('.srow', (els) => els.map((e) => e.textContent).join(' | '));
    check('the sessions list filters to the ended sessions, counting polls without the feedback form', (await p.$$('.srow')).length === 2 && /copy.*7 polls.*Team offsite.*7 polls/.test(endedRows), endedRows);
    await p.click('.chips button:has-text("All")');
    await p.screenshot({ path: path.join(OUT, '18-dashboard.png') });
    await p.goto(`${BASE}/app/account`, FIRST);
    await p.click('button:has-text("Delete account")');
    await p.waitForSelector('text=Its sessions and all their answers are removed.');
    await p.click('section:has-text("Delete this account?") button.danger');
    await p.waitForURL(`${BASE}/`, FIRST);
    const left = `${(await api('GET', '/api/sessions')).body.sessions.length},${(await api('GET', `/api/sessions/${sessionId}/results`)).status},${(await api('GET', '/api/account')).body.plan}`;
    check('deleting the account removes its sessions, their results and its plan', left === '0,404,free', left);
    await p.screenshot({ path: path.join(OUT, '19-front-page.png') });

    // ---- The site: its menus, its pages and the working example on a product page
    /* With reduced motion the example's made-up audience stays still, so its numbers can be checked. */
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.hover('.s-head button:has-text("Product")');
    await p.click('.s-drop a:has-text("Live polls")');
    await p.waitForURL(`${BASE}/features/polls`, FIRST);
    await p.waitForSelector('h1:has-text("Live polls")', WAIT);
    check('site: the Product menu opens a product page', (await p.$$('.s-drop')).length === 0);
    const shares = () => p.$$eval('.s-try-screen .mk-bar b', (els) => els.map((e) => e.textContent).join(' '));
    const before = await shares();
    await p.click('.s-try-phone [role="radio"]:has-text("Too fast")');
    await p.click('.s-try-phone button:has-text("Send")');
    const voted = await shares();
    await p.click('.s-try-phone button:has-text("Edit response")');
    await p.click('.s-try-phone [role="radio"]:has-text("About right")');
    await p.click('.s-try-phone button:has-text("Send")');
    const moved = await shares();
    check('site: a vote in the example moves the big screen, and a changed vote counts once', before === '16% 63% 21%' && voted === '15% 60% 25%' && moved === '15% 65% 20%', `${before} | ${voted} | ${moved}`);
    await p.screenshot({ path: path.join(OUT, '20-site-polls.png') });
    const bad = [];
    for (const u of ['/', '/product', '/features/qa', '/features/word-cloud', '/features/quizzes', '/features/surveys', '/features/results', '/use-cases', '/pricing']) {
      for (const width of [1366, 390]) {
        await p.setViewportSize({ width, height: 800 });
        const r = await p.goto(`${BASE}${u}`, FIRST);
        const sideways = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (!r || r.status() !== 200 || sideways > 0 || !(await p.$('h1'))) bad.push(`${u}@${width}`);
      }
    }
    const missing = (await api('GET', '/features/nope')).status;
    check('site: every page opens and fits a phone and a laptop; an unknown page is not found', bad.length === 0 && missing === 404, `${bad.join(' ')} ${missing}`);
    await p.setViewportSize({ width: 1366, height: 800 });
    await p.goto(`${BASE}/pricing`, FIRST);
    const cards = await p.$$eval('.s-plan', (els) => els.map((e) => `${e.querySelector('h2').textContent} ${e.querySelector('.price b').textContent} ${e.querySelector('a.btn').getAttribute('href')}`).join(' | '));
    const compared = await p.$$eval('.s-compare tbody tr:not(.group)', (rows) => rows.filter((r) => /^(People in a session|Surveys|Downloads)/.test(r.textContent)).map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
    check('site: Pricing shows Free and Pro with the price, and what differs',
      cards === 'Free ₹0 /sign-in?mode=up | Pro ₹49 /app/account' && /People in a session\s?100\s?1,000/.test(compared) && /Surveys.*not included.*included/.test(compared), `${cards} · ${compared}`);
    await p.screenshot({ path: path.join(OUT, '20b-site-pricing.png'), fullPage: true });
    await p.setViewportSize({ width: 390, height: 800 });
    await p.goto(`${BASE}/`, FIRST);
    await p.click('button[aria-label="Menu"]');
    await p.click('.s-drawer summary:has-text("Use cases")');
    await p.click('.s-drawer a:has-text("Classrooms")');
    await p.waitForURL(`${BASE}/use-cases#classrooms`, FIRST);
    check('site: on a phone the menu opens as a page and closes on a choice', (await p.$$('.s-drawer')).length === 0);
    await p.setViewportSize({ width: 1366, height: 800 });
    await p.goto(`${BASE}/`, FIRST);
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    await p.click('.s-scenes button:has-text("Quiz")');
    await p.waitForSelector('.hd .mk-board', WAIT);
    await p.screenshot({ path: path.join(OUT, '21-site-home.png') });
    check('site: the front page picture shows the scene chosen', true);
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('walk ran to the end', false, String(e).slice(0, 600));
    /* What each screen showed when the walk stopped: the facilitator, the big screen, then the phones. */
    let n = 0;
    for (const ctx of browser.contexts()) for (const pg of ctx.pages()) {
      n += 1;
      await pg.screenshot({ path: path.join(OUT, `fail-${n}.png`) }).catch(() => {});
      const alerts = await pg.$$eval('[role="alert"]', (els) => els.map((x) => x.textContent).join(' | ')).catch(() => '');
      if (alerts) console.log(`  screen ${n}: ${alerts}`);
    }
  }
  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
