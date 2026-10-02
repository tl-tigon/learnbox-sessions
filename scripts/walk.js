/* Walk on the in-memory dev server: a facilitator builds a deck in the editor, presents it, five
   phones join by code and answer every slide type, the big screen and control view show live
   counts, a moderated Q&A runs (ask, approve, upvote, highlight, answered, hide), the session
   ends and the CSV downloads. Then a survey run. */
const fs = require('fs'), path = require('path');
const { chromium } = require('C:/Users/tejas/OneDrive/Documents/Workspace/LMS/Trust Sim/capture-tool/node_modules/playwright-core');
const BASE = 'http://localhost:3200';
const OUT = path.join(__dirname, 'live-walk'); fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  Â· ' + detail : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const fac = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const p = await fac.newPage(); p.setDefaultTimeout(20000);
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));

    // Sign up (dev) and make a deck in the editor
    await p.goto(`${BASE}/sign-in`);
    await p.fill('input[type="email"]', 'walk@example.com');
    await p.click('button:has-text("Continue")');
    await p.waitForURL(/\/app$/);
    await p.click('button:has-text("New presentation")');
    await p.waitForURL(/\/app\/p\//);
    await p.fill('input[aria-label="Presentation title"]', 'Team offsite');
    await p.fill('label:has-text("Question") input', 'Where should we go?');
    await p.fill('input[aria-label="Option 1"]', 'Goa');
    await p.fill('input[aria-label="Option 2"]', 'Coorg');
    await p.click('button:has-text("Add option")');
    await p.fill('input[aria-label="Option 3"]', 'Lonavala');
    for (const [type, title] of [['wordcloud', 'One word for this year'], ['rating', 'How was the quarter?'], ['open', 'What should we change?'], ['qa', 'Questions for the team'], ['content', 'Thank you']]) {
      await p.selectOption('label:has-text("Add slide") select', type);
      await p.fill(type === 'content' ? 'label:has-text("Heading") input' : type === 'qa' ? 'label:has-text("Title") input' : 'label:has-text("Question") input', title);
      if (type === 'qa') await p.check('label:has-text("Approve questions") input');
    }
    await p.waitForSelector('text=Saved');
    await p.waitForTimeout(900);
    await p.waitForSelector('text=Saved');
    await p.screenshot({ path: path.join(OUT, '01-editor.png') });
    const presId = p.url().split('/').pop();
    const saved = await p.evaluate(async (id) => (await (await fetch(`/api/presentations/${id}`, { headers: { authorization: 'Bearer dev:walk@example.com' } })).json()).presentation, presId);
    check('editor saved 6 slides in order', saved.slides.map((s) => s.type).join(',') === 'choice,wordcloud,rating,open,qa,content', saved.slides.map((s) => s.type).join(','));
    check('editor saved the Q&A settings', saved.slides[4].moderation === true && saved.slides[4].anonymous === true);

    // Present
    await p.click('button:has-text("Present")');
    await p.waitForURL(/\/control\//);
    await p.waitForSelector('text=/Code \\d{6}/');
    const code = (await p.textContent('text=/Code \\d{6}/')).match(/\d{6}/)[0];
    const sessionId = p.url().split('/').pop();
    /* The big screen is a projector that is not signed in: its own browser, opened with the
       display key. Its own context also keeps it in the foreground, so it never stops polling. */
    const displayKey = await p.evaluate(async (id) => (await (await fetch(`/api/sessions/${id}`, { headers: { authorization: 'Bearer dev:walk@example.com' } })).json()).displayKey, sessionId);
    const projector = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const screen = await projector.newPage(); screen.setDefaultTimeout(20000);
    screen.on('pageerror', (e) => errs.push('screen: ' + e));
    await screen.goto(`${BASE}/present/${sessionId}#k=${displayKey}`);
    await screen.waitForSelector('text=Where should we go?', { timeout: 90000 }); // the dev server compiles this page on first load

    // Five phones
    const phones = [];
    for (let i = 0; i < 5; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const ph = await ctx.newPage(); ph.setDefaultTimeout(20000);
      ph.on('pageerror', (e) => errs.push('phone: ' + e));
      await ph.goto(`${BASE}/`);
      await ph.fill('#code', code);
      await ph.click('button:has-text("Join")');
      await ph.waitForSelector('text=Where should we go?');
      phones.push(ph);
    }
    await phones[0].screenshot({ path: path.join(OUT, '02-phone-choice.png') });

    // Slide 1: choice
    const picks = ['Goa', 'Goa', 'Coorg', 'Goa', 'Lonavala'];
    for (let i = 0; i < 5; i++) { await phones[i].click(`button:has-text("${picks[i]}")`); await phones[i].click('button:has-text("Submit")'); await phones[i].waitForSelector('text=Sent'); }
    await screen.waitForSelector('text=5 answered', { timeout: 8000 });
    const scr1 = await screen.textContent('main');
    check('big screen: choice counts live', /Goa\s*3\D+60%/.test(scr1) && /Coorg\s*1\D+20%/.test(scr1), scr1.slice(0, 200));
    check('big screen: 5 joined', /5 joined/.test(scr1));
    await screen.screenshot({ path: path.join(OUT, '03-screen-choice.png') });
    // A second submit from the same phone is refused by the server
    const dup = await phones[0].evaluate(async ({ sid, slideId }) => {
      const r = await fetch(`/api/live/${sid}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: localStorage.getItem('la-token'), slideId, answer: { optionIds: [] } }) });
      return r.status;
    }, { sid: sessionId, slideId: saved.slides[0].id });
    check('duplicate or empty answer refused', dup === 400 || dup === 409, String(dup));

    // Slide 2: word cloud (via the control view's Next)
    await p.click('button:has-text("Next")');
    for (const ph of phones) await ph.waitForSelector('text=One word for this year');
    const words = [['Growth', 'trust'], ['growth'], ['Trust.'], ['speed'], ['growth']];
    for (let i = 0; i < 5; i++) for (const w of words[i]) { await phones[i].fill('input[aria-label="Your word"]', w); await phones[i].click('button:has-text("Submit")'); await phones[i].waitForTimeout(250); }
    await screen.waitForSelector('.cloud span:has-text("speed")');
    const cloud = await screen.$$eval('.cloud span', (s) => s.map((x) => x.textContent));
    check('word cloud merges case and punctuation', cloud[0] === 'growth' && cloud.includes('trust') && cloud.length === 3, cloud.join(','));
    await screen.screenshot({ path: path.join(OUT, '04-screen-cloud.png') });

    // Slide 3: rating, with results hidden then shown
    await p.click('button:has-text("Next")');
    await p.click('button:has-text("Results shown")');
    for (const ph of phones) await ph.waitForSelector('text=How was the quarter?');
    const ratings = [5, 4, 4, 3, 5];
    for (let i = 0; i < 5; i++) { await phones[i].click(`form button.num:text-is("${ratings[i]}")`); await phones[i].click('button:has-text("Submit")'); }
    await phones[0].waitForSelector('text=Sent');
    const hiddenOnPhone = await phones[0].$('.bars');
    check('results hidden: phones see no results', !hiddenOnPhone);
    await p.click('button:has-text("Results hidden")');
    await screen.waitForSelector('text=4.2');
    check('rating average on the big screen', true);
    await phones[1].waitForSelector('.bars', { timeout: 8000 }).catch(() => {});
    check('results shown again: phones see them', !!(await phones[1].$('.bars')));
    await screen.screenshot({ path: path.join(OUT, '05-screen-rating.png') });

    // Slide 4: open text, then lock
    await p.click('button:has-text("Next")');
    for (const ph of phones) await ph.waitForSelector('text=What should we change?');
    for (let i = 0; i < 3; i++) { await phones[i].fill('textarea', `Idea number ${i + 1}`); await phones[i].click('button:has-text("Submit")'); }
    await p.click('button:has-text("Close answers")');
    await phones[4].waitForSelector('text=Answers closed', { timeout: 8000 });
    check('locking closes answers on phones', true);
    await screen.waitForSelector('.texts > div >> nth=2');
    check('open answers on the big screen', (await screen.$$('.texts > div')).length === 3);
    await screen.screenshot({ path: path.join(OUT, '06-screen-open.png') });
    await phones[4].screenshot({ path: path.join(OUT, '07-phone-locked.png') });

    // Slide 5: Q&A with moderation
    await p.click('button:has-text("Next")');
    for (const ph of phones) await ph.waitForSelector('text=Questions for the team');
    const Q1 = 'Will targets change mid-year?', Q2 = 'When is the new CRM live?';
    await phones[0].fill('textarea[aria-label="Your question"]', Q1);
    await phones[0].fill('label:has-text("Name") input', 'Asha');
    await phones[0].click('button:text-is("Ask")');
    await phones[0].waitForSelector('text=Waiting for approval');
    await phones[1].fill('textarea[aria-label="Your question"]', Q2);
    await phones[1].check('label:has-text("Ask anonymously") input');
    await phones[1].click('button:text-is("Ask")');
    await phones[1].waitForSelector('text=Waiting for approval');
    await p.waitForSelector(`section[aria-label="Waiting"] .question:has-text("${Q2}")`, { timeout: 8000 });
    check('Q&A: waiting questions reach the control view only', (await p.$$('section[aria-label="Waiting"] .question')).length === 2 && (await phones[2].$$('.question')).length === 0 && (await screen.$$('.question')).length === 0);
    await p.screenshot({ path: path.join(OUT, '10-control-qa-waiting.png') });
    await p.click(`section[aria-label="Waiting"] .question:has-text("${Q1}") button:has-text("Approve")`);
    await p.click(`section[aria-label="Waiting"] .question:has-text("${Q2}") button:has-text("Approve")`);
    for (const ph of phones) await ph.waitForSelector(`.question:has-text("${Q2}")`, { timeout: 8000 });
    const names = await phones[3].$$eval('.question .muted', (els) => els.map((e) => e.textContent.trim()).sort().join('|'));
    check('Q&A: approved questions show the name or Anonymous', names === 'Anonymous|Asha', names);
    for (const i of [2, 3, 4]) await phones[i].click(`.question:has-text("${Q1}") button`);
    await phones[2].click(`.question:has-text("${Q2}") button`);
    await screen.waitForSelector(`.question:has-text("${Q1}") >> text=▲ 3`, { timeout: 8000 });
    check('Q&A: upvotes counted on the big screen', true);
    const dupVote = await phones[2].evaluate(async ({ sid, slideId }) => {
      const token = localStorage.getItem('la-token');
      const list = (await (await fetch(`/api/live/${sid}/qa/${slideId}?t=${token}`)).json()).questions;
      const top = list.sort((a, b) => b.votes - a.votes)[0];
      const r = await fetch(`/api/live/${sid}/qa/${slideId}/${top.id}/vote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      return `${r.status}:${top.votes}`;
    }, { sid: sessionId, slideId: saved.slides[4].id });
    check('Q&A: a second upvote from the same phone is refused', dupVote === '409:3', dupVote);
    await p.click(`section[aria-label="Approved"] .question:has-text("${Q1}") button:has-text("Highlight")`);
    await screen.waitForSelector(`.qa-now:has-text("${Q1}")`, { timeout: 8000 });
    await phones[4].waitForSelector('text=Answering now', { timeout: 8000 });
    check('Q&A: the highlighted question is large on the screen and marked on phones', true);
    await screen.screenshot({ path: path.join(OUT, '11-screen-qa.png') });
    await phones[4].screenshot({ path: path.join(OUT, '12-phone-qa.png') });
    await p.click(`section[aria-label="Approved"] .question:has-text("${Q1}") button:has-text("Mark answered")`);
    await phones[4].waitForSelector('text=Answered', { timeout: 8000 });
    await screen.waitForSelector('.qa-now', { state: 'detached', timeout: 8000 });
    check('Q&A: marking answered clears the highlight', true);
    await p.click(`section[aria-label="Approved"] .question:has-text("${Q2}") button:has-text("Hide")`);
    await phones[3].waitForSelector(`.question:has-text("${Q2}")`, { state: 'detached', timeout: 8000 });
    check('Q&A: a hidden question leaves the phones', (await phones[3].$$('.question')).length === 1);
    const asOther = await p.evaluate(async ({ sid, slideId }) => (await fetch(`/api/sessions/${sid}/qa/${slideId}/x`, { method: 'PATCH', headers: { authorization: 'Bearer dev:someone@else.com', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })).status, { sid: sessionId, slideId: saved.slides[4].id });
    check('Q&A: another account cannot moderate', asOther === 404, String(asOther));

    // Slide 6 and end
    await p.click('button:has-text("Next")');
    await screen.waitForSelector('h1:has-text("Thank you")');
    p.once('dialog', (d) => d.accept());
    await p.click('button:has-text("End session")');
    await p.waitForURL(/\/app\/sessions\//);
    await phones[0].waitForSelector('text=Session ended', { timeout: 8000 });
    check('phones see the session end', true);
    await p.waitForSelector('text=Download CSV');
    await p.bringToFront();
    await p.screenshot({ path: path.join(OUT, '08-results.png'), timeout: 60000 });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download CSV")')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check('CSV has every slide', /"Goa","3"/.test(csv) && /"growth","3"/.test(csv) && /"Idea number 2"/.test(csv) && /"5","2"/.test(csv), csv.split('\r\n').slice(0, 4).join(' | '));
    check('CSV has the questions', csv.includes('"Will targets change mid-year?","Asha","3","Answered"') && csv.includes('"When is the new CRM live?","Anonymous","1","Hidden"'));
    const codeAfter = await phones[0].evaluate(async (c) => (await fetch(`/api/join/${c}`)).status, code);
    check('code freed after the end', codeAfter === 404, String(codeAfter));

    // Survey run
    await p.goto(`${BASE}/app/p/${presId}`);
    await p.click('button:has-text("Run as survey")');
    await p.waitForURL(/\/control\//);
    const code2 = (await p.textContent('text=/Code \\d{6}/')).match(/\d{6}/)[0];
    const sp = phones[2];
    await sp.goto(`${BASE}/s/${code2}`);
    await sp.waitForSelector('text=Where should we go?');
    await sp.click('button:has-text("Coorg")'); await sp.click('button:has-text("Submit")'); await sp.waitForSelector('text=Sent');
    await sp.click('button:has-text("Next")');
    await sp.click('button:has-text("Next")');
    await sp.click('form button.num:text-is("2")'); await sp.click('button:has-text("Submit")'); await sp.waitForSelector('text=Sent');
    await sp.click('button:has-text("Back")'); await sp.click('button:has-text("Back")');
    check('survey: answered slide shows as sent when going back', !!(await sp.$('text=Sent')));
    await sp.screenshot({ path: path.join(OUT, '09-phone-survey.png') });
    const res = await p.evaluate(async (id) => (await (await fetch(`/api/sessions/${id}/results`, { headers: { authorization: 'Bearer dev:walk@example.com' } })).json()), p.url().split('/').pop());
    check('survey results recorded', res.rows[0].tally.counts[saved.slides[0].options[1].id] === 1 && res.rows[2].tally.counts['2'] === 1);

    // Someone else's session is hidden
    const other = await p.evaluate(async (id) => (await fetch(`/api/sessions/${id}/results`, { headers: { authorization: 'Bearer dev:someone@else.com' } })).status, sessionId);
    check("another account cannot read this session's results", other === 404, String(other));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { check('walk ran to the end', false, String(e).slice(0, 500)); }
  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

