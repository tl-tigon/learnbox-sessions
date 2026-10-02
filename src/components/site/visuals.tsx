/** The site's pictures, by name: drawings of the product's screens, and the small drawings on step cards. */
import { Icon, TYPE_ICON, TYPE_LABEL } from '@/components/icons';
import type { ArtName, VisualName } from '@/lib/site';
import {
  AskRow, Bars, barRows, Board, BOARD, Btn, Cloud, CODE, Duo, Field, Options, Panel, People, Phone, PhoneBoard, PhoneQuestion, PhoneVoted,
  PLabel, POLL, QUESTIONS, QUIZ, Screen, Sent, Sheet, Solo, WallQuestions, WORDS,
} from './mock';

const LABEL: Record<VisualName, string> = {
  poll: 'A multiple choice poll on the big screen and on a phone',
  cloud: 'A word cloud on the big screen, and the word field on a phone',
  rating: 'A rating poll on the big screen and on a phone',
  open: 'Written answers on the big screen, and the answer field on a phone',
  ranking: 'A ranking poll on the big screen and on a phone',
  qa: 'The audience’s questions on the big screen and on a phone',
  'qa-ask': 'The sheet for asking a question on a phone',
  'qa-review': 'Questions waiting for the facilitator’s review',
  'qa-highlight': 'A highlighted question on the big screen and on a phone',
  'qa-reply': 'A question with the host’s reply on a phone',
  'quiz-open': 'A quiz question with its timer on the big screen and on a phone',
  'quiz-reveal': 'A quiz question’s votes with the correct option marked',
  'quiz-board': 'A quiz’s leaderboard on the big screen, and a person’s place on a phone',
  survey: 'A survey on a phone, and its name on the big screen',
  results: 'A session’s results page with its downloads',
  join: 'The join code on the big screen, and the code field on a phone',
  host: 'The facilitator’s screen with a poll running',
  'phone-poll': 'A word cloud’s field on a phone',
};

const HI = QUESTIONS.map((q, i) => ({ ...q, hi: i === 0 }));
const TEXTS = ['Shorter stand-ups', 'One planning day a month', 'Fewer tools', 'Clearer hand-offs'];
const RANK = { title: 'Order these priorities', options: ['Quality', 'Speed', 'Cost'], points: [52, 41, 27] };
const RATING = { title: 'How useful was this session?', counts: [0, 1, 3, 11, 9] };

function drawing(name: VisualName) {
  switch (name) {
    case 'poll':
      return <Duo screen={<Screen icon="choice" label="Multiple choice" count={24}><Panel title={POLL.title}><Bars rows={barRows(POLL.options, POLL.counts)} /></Panel></Screen>} phone={<Phone><PhoneVoted /></Phone>} />;
    case 'cloud':
      return (
        <Duo
          screen={<Screen icon="cloud" label="Word cloud" count={24}><Panel title="One word for this quarter"><Cloud words={WORDS} /></Panel></Screen>}
          phone={<Phone><PLabel icon="cloud" label="Word cloud" right={<People n={24} />} /><b className="mk-ptitle">One word for this quarter</b><Field>focused</Field><Btn primary>Send</Btn><small className="mk-note num">1 / 3</small></Phone>}
        />
      );
    case 'rating':
      return (
        <Duo
          screen={(
            <Screen icon="star" label="Rating" count={24}>
              <Panel title={RATING.title}>
                <div className="mk-avg num">4.2 <small>/ 5</small></div>
                <Bars rows={RATING.counts.map((c, i) => ({ key: String(i), label: <span className="num">{i + 1}</span>, value: String(c), share: c / 11 }))} />
              </Panel>
            </Screen>
          )}
          phone={<Phone><PLabel icon="star" label="Rating" right={<People n={24} />} /><b className="mk-ptitle">{RATING.title}</b><div className="mk-scale num">{[1, 2, 3, 4, 5].map((v) => <i key={v} className={v === 4 ? 'on' : ''}>{v}</i>)}</div><Sent /><Btn>Edit response</Btn></Phone>}
        />
      );
    case 'open':
      return (
        <Duo
          screen={<Screen icon="text" label="Open text" count={18}><Panel title="What should we change?"><div className="mk-texts">{TEXTS.map((t) => <span key={t}>{t}</span>)}</div></Panel></Screen>}
          phone={<Phone><PLabel icon="text" label="Open text" right={<People n={18} />} /><b className="mk-ptitle">What should we change?</b><Field>Clearer hand-offs</Field><Btn primary>Send</Btn></Phone>}
        />
      );
    case 'ranking':
      return (
        <Duo
          screen={(
            <Screen icon="ranking" label="Ranking" count={20}>
              <Panel title={RANK.title}><Bars rows={RANK.options.map((o, i) => ({ key: o, label: <><span className="num">{i + 1}.</span> {o}</>, value: String(RANK.points[i]), share: RANK.points[i] / RANK.points[0], lead: i === 0 }))} /></Panel>
            </Screen>
          )}
          phone={(
            <Phone>
              <PLabel icon="ranking" label="Ranking" right={<People n={20} />} /><b className="mk-ptitle">{RANK.title}</b>
              <div className="mk-opts">{RANK.options.map((o, i) => <span key={o} className="mk-opt"><b className="num">{i + 1}</b>{o}<i className="mk-arrows"><Icon name="up" /><Icon name="down" /></i></span>)}</div>
              <Btn primary>Send</Btn>
            </Phone>
          )}
        />
      );
    case 'qa':
      return (
        <Duo
          screen={<Screen icon="chat" label="Q&A" count={3} countIcon="chat"><WallQuestions items={QUESTIONS} /></Screen>}
          phone={<Phone tab="qa" fab><AskRow /><PhoneQuestion q={{ ...QUESTIONS[0], voted: true }} /><PhoneQuestion q={QUESTIONS[1]} /></Phone>}
        />
      );
    case 'qa-highlight':
      return (
        <Duo
          screen={<Screen icon="chat" label="Q&A" count={3} countIcon="chat"><WallQuestions items={HI} /></Screen>}
          phone={<Phone tab="qa" fab><AskRow /><PhoneQuestion q={HI[0]} /><PhoneQuestion q={HI[1]} /></Phone>}
        />
      );
    case 'qa-ask':
      return (
        <Solo>
          <Phone tab="qa">
            <div className="mk-sheetbox">
              <div className="mk-label"><b>Ask</b><Icon name="x" /></div>
              <Field>How many people are we hiring this year?</Field>
              <small className="mk-note num">241</small>
              <Field empty><Icon name="user" />Your name (optional)</Field>
              <Btn primary>Send</Btn>
            </div>
          </Phone>
        </Solo>
      );
    case 'qa-reply':
      return <Solo><Phone tab="qa" fab><AskRow /><PhoneQuestion q={{ ...QUESTIONS[0], voted: true, reply: 'It stays as planned until June.' }} /><PhoneQuestion q={QUESTIONS[2]} /></Phone></Solo>;
    case 'qa-review':
      return (
        <Sheet>
          <div className="mk-chips"><span className="on">In review<i className="num">2</i></span><span>Live<i className="num">3</i></span><span>Answered<i className="num">1</i></span></div>
          {[QUESTIONS[1], { ...QUESTIONS[2], text: 'Can we see the survey results?' }].map((q) => (
            <div key={q.id} className="mk-qrow">
              <small><i className="mk-dot">{q.name ? q.name[0] : <Icon name="user" />}</i>{q.name || 'Anonymous'} · 10:42</small>
              <p>{q.text}</p>
              <span className="tools"><i className="fill"><Icon name="check" /></i><i><Icon name="eyeoff" /></i></span>
            </div>
          ))}
        </Sheet>
      );
    case 'quiz-open':
      return (
        <Duo
          screen={(
            <Screen icon="quiz" label="Quiz" count={24}>
              <Panel title={QUIZ.title} side={<b className="mk-timer num">12</b>}>
                <div className="mk-letters">{QUIZ.options.map((o, i) => <span key={o}><i className="mk-letter">{'ABCD'[i]}</i>{o}</span>)}</div>
                <small className="mk-note num">2 / 5 · 18 answered</small>
              </Panel>
            </Screen>
          )}
          phone={(
            <Phone>
              <PLabel icon="quiz" label={QUIZ.name} right="2 / 5" /><b className="mk-ptitle">{QUIZ.title}</b>
              <div className="mk-timerline num"><Icon name="clock" />12<i><b style={{ width: '60%' }} /></i></div>
              <Options options={QUIZ.options} letters picked={1} />
            </Phone>
          )}
        />
      );
    case 'quiz-reveal':
      return (
        <Screen icon="quiz" label="Quiz" count={24}>
          <Panel title={QUIZ.title}>
            <Bars rows={QUIZ.options.map((o, i) => ({ key: o, label: <><i className="mk-letter">{'ABCD'[i]}</i> {o}{i === 1 && ' ✓'}</>, value: String([3, 16, 1, 4][i]), share: [3, 16, 1, 4][i] / 16, lead: i === 1 }))} />
            <small className="mk-note num">2 / 5 · 24 answered</small>
          </Panel>
        </Screen>
      );
    case 'quiz-board':
      return <Duo screen={<Screen icon="quiz" label="Quiz" count={24}><Panel title={QUIZ.name}><Board rows={BOARD} /></Panel></Screen>} phone={<Phone><PhoneBoard /></Phone>} />;
    case 'survey':
      return (
        <Duo
          screen={<Screen icon="survey" label="Survey" count={24}><Panel title="Session feedback"><small className="mk-note num">3 questions</small></Panel></Screen>}
          phone={(
            <Phone>
              <PLabel icon="survey" label="Survey" right="3 questions" /><b className="mk-ptitle">Session feedback</b>
              <span className="mk-sq"><span className="num">1.</span> Overall</span>
              <div className="mk-scale num">{[1, 2, 3, 4, 5].map((v) => <i key={v} className={v === 4 ? 'on' : ''}>{v}</i>)}</div>
              <span className="mk-sq"><span className="num">2.</span> One thing to improve</span>
              <Field>Shorter breaks</Field>
              <span className="mk-sq"><span className="num">3.</span> Would you attend again?</span>
              <Options options={['Yes', 'No']} picked={0} />
            </Phone>
          )}
        />
      );
    case 'results':
      return (
        <Sheet>
          <div className="mk-rhead"><b>Quarterly review</b><span><Btn><Icon name="download" />Download Excel</Btn><Btn primary><Icon name="download" />Download CSV</Btn></span></div>
          <div className="mk-block"><PLabel icon="choice" label="Multiple choice" right="24 answered" /><b><span className="num">1.</span> {POLL.title}</b><Bars rows={barRows(POLL.options, POLL.counts)} /></div>
          <div className="mk-block"><PLabel icon="cloud" label="Word cloud" right="24 answered" /><b><span className="num">2.</span> One word for this quarter</b><Cloud words={WORDS.slice(1, 5)} /></div>
        </Sheet>
      );
    case 'join':
      return (
        <Duo
          screen={<Screen icon="chat" label="Q&A" count={0} countIcon="chat" people={1}><div className="mk-none"><Icon name="chat" />No questions yet</div></Screen>}
          phone={<div className="mk-phone"><div className="mk-body"><div className="mk-joinpage"><b className="mk-wm">LearnBox Sessions</b><span className="mk-pill num"><b>#</b>{CODE}<i><Icon name="right" /></i></span></div></div></div>}
        />
      );
    case 'host':
      return (
        <Sheet>
          <div className="mk-dhead"><Icon name="choice" /><span><b>Multiple choice</b><small className="num live">24 answered</small></span></div>
          <span className="mk-qfield">{POLL.title}</span>
          <div className="mk-hopts">
            {POLL.options.map((o, i) => (
              <div key={o}><small className="num">{i + 1}.</small><span>{o}</span><i><b style={{ width: `${Math.round((POLL.counts[i] / 24) * 100)}%` }} /></i><b className="num">{Math.round((POLL.counts[i] / 24) * 100)}%</b></div>
            ))}
          </div>
          <div className="mk-startbar"><Btn><Icon name="stop" />Stop</Btn><i><Icon name="eyeoff" /></i><i><Icon name="lock" /></i><span>Next<Icon name="right" /></span></div>
        </Sheet>
      );
    case 'phone-poll':
      return (
        <Solo>
          <Phone>
            <PLabel icon="cloud" label="Word cloud" right={<People n={24} />} /><b className="mk-ptitle">One word for this quarter</b>
            <Field>focused</Field><Btn primary>Send</Btn><small className="mk-note num">1 / 3</small>
          </Phone>
        </Solo>
      );
  }
}

/** A drawing of the product's screens. It reads as one image. */
export function Visual({ name }: { name: VisualName }) {
  return <div className="s-visual" role="img" aria-label={LABEL[name]}>{drawing(name)}</div>;
}

function art(name: ArtName) {
  switch (name) {
    case 'add':
      return <div className="a-types">{(['choice', 'wordcloud', 'rating', 'open', 'ranking', 'quiz'] as const).map((t) => <span key={t}><Icon name={TYPE_ICON[t]} />{TYPE_LABEL[t]}</span>)}</div>;
    case 'code':
      return <div className="a-code"><small>Join at</small><b>sessions.learnbox.one</b><b className="num big"># {CODE}</b></div>;
    case 'bars':
      return <div className="a-card"><Bars rows={barRows(POLL.options, POLL.counts)} /></div>;
    case 'question':
      return <div className="a-stack"><PhoneQuestion q={{ ...QUESTIONS[0], voted: true }} /></div>;
    case 'highlight':
      return <div className="a-stack"><WallQuestions items={[{ ...HI[0], text: 'Will the roadmap change?' }, { ...HI[2], text: 'When does the new office open?' }]} /></div>;
    case 'timer':
      return <div className="a-card"><div className="mk-timerline num"><Icon name="clock" />12<i><b style={{ width: '60%' }} /></i></div><Options options={QUIZ.options.slice(0, 2)} letters picked={1} /></div>;
    case 'board':
      return <div className="a-card"><Board rows={BOARD.slice(0, 3)} /></div>;
    case 'words':
      return <div className="a-card"><Cloud words={WORDS.slice(1, 6)} /></div>;
    case 'field':
      return <div className="a-card"><Field>focused</Field><Btn primary>Send</Btn></div>;
    case 'survey':
      return <div className="a-card"><span className="mk-sq"><span className="num">1.</span> Overall</span><div className="mk-scale num">{[1, 2, 3, 4, 5].map((v) => <i key={v} className={v === 4 ? 'on' : ''}>{v}</i>)}</div><span className="mk-sq"><span className="num">2.</span> One thing to improve</span><Field>Shorter breaks</Field></div>;
    case 'download':
      return <div className="a-row"><Btn><Icon name="download" />Download Excel</Btn><Btn primary><Icon name="download" />Download CSV</Btn></div>;
    case 'start':
      return <div className="a-card a-start"><span><b>{POLL.title}</b><small><Icon name="choice" />Multiple choice</small></span><i><Icon name="play" /></i></div>;
  }
}

/** The small drawing on a step card. */
export function Art({ name }: { name: ArtName }) {
  return <div className="s-art" aria-hidden><div>{art(name)}</div></div>;
}
