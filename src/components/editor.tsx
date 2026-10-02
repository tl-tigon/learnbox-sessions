'use client';
/**
 * The fields a facilitator fills in for a poll, a quiz or a survey. Each change hands back a new
 * copy. Given counts, each option shows its result under its own field.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon, TYPE_ICON, TYPE_LABEL } from './icons';
import { PollResults } from './results';
import { blankPoll, blankQuizQuestion, POLL_TYPES, QUIZ_SECONDS, shortId } from '@/lib/engine/polls';
import { LIMITS } from '@/lib/limits';
import type { ChoiceOption, Poll, PollType, Quiz, QuizQuestion, Survey, Tally } from '@/lib/types';

type Texts = { text: string }[];

/**
 * A whole number between two bounds. What is typed is kept as typed, so the field can be cleared
 * and retyped; the value is passed on when it is in range, and the field settles on the value when left.
 */
function NumberField({ value, min, max, onChange, disabled }: { value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input type="number" inputMode="numeric" min={min} max={max} value={text} disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setText(String(value))} />
  );
}

/** The question, or the name of a quiz or survey: one large field that wraps and stays a single line of text. */
function TitleField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  /* The stylesheet sizes the field to its text where the browser can; elsewhere its height is set here. */
  useEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [value]);
  return (
    <textarea ref={ref} className="qfield" rows={1} aria-label={label} placeholder={label} value={value} maxLength={LIMITS.titleChars} disabled={disabled}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))} />
  );
}

function Options({ options, max, onChange, disabled, correctId, onCorrect, name, tally, share }: {
  options: ChoiceOption[];
  max: number;
  onChange: (next: ChoiceOption[]) => void;
  disabled?: boolean;
  /** With these, each option gets a radio that marks it as the correct answer. */
  correctId?: string;
  onCorrect?: (id: string) => void;
  name?: string;
  /** With counts, each option shows a bar under its field. */
  tally?: Tally | null;
  /** The figure beside a bar: each option's share of the people who answered, or its count. */
  share?: boolean;
}) {
  const count = (id: string) => Math.max(0, tally?.counts[id] ?? 0);
  const most = Math.max(1, ...options.map((o) => count(o.id)));
  return (
    <div className="opts">
      {onCorrect && <span className="small muted">Correct · Option</span>}
      {options.map((o, i) => {
        const n = count(o.id);
        const part = share ? (tally?.people ? n / tally.people : 0) : n / most;
        return (
          <div className={`opt ${tally && onCorrect && correctId === o.id ? 'correct' : ''}`} key={o.id}>
            {onCorrect
              ? <input type="radio" name={name} checked={correctId === o.id} disabled={disabled} aria-label={`Option ${i + 1} is correct`} onChange={() => onCorrect(o.id)} />
              : <span className="idx num">{i + 1}.</span>}
            <input className="bare" aria-label={`Option ${i + 1}`} value={o.label} maxLength={LIMITS.optionChars} placeholder={`Option ${i + 1}`} disabled={disabled}
              onChange={(e) => onChange(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} />
            <button type="button" className="icon-btn ghost" aria-label={`Remove option ${i + 1}`} disabled={disabled || options.length <= 2}
              onClick={() => onChange(options.filter((x) => x.id !== o.id))}><Icon name="x" /></button>
            {tally && (
              <>
                <div className="track"><div className="fill" style={{ width: `${Math.min(1, part) * 100}%` }} /></div>
                <span className="val num">{share ? `${Math.round(part * 100)}%` : n}</span>
              </>
            )}
          </div>
        );
      })}
      {options.length < max && (
        <div><button type="button" className="ghost add-opt" disabled={disabled} onClick={() => onChange([...options, { id: shortId(), label: '' }])}><Icon name="plus" />Add option</button></div>
      )}
    </div>
  );
}

/** A poll's settings beyond its question and options: how many picks or entries, or the scale and its end labels. */
export function PollSettings({ poll, onChange, disabled }: { poll: Poll; onChange: (p: Poll) => void; disabled?: boolean }) {
  return (
    <>
      {poll.type === 'choice' && (
        <label>Picks per person
          <NumberField min={1} max={poll.options.length} value={poll.maxPicks} disabled={disabled} onChange={(maxPicks) => onChange({ ...poll, maxPicks })} />
        </label>
      )}
      {(poll.type === 'wordcloud' || poll.type === 'open') && (
        <label>{poll.type === 'wordcloud' ? 'Words per person' : 'Answers per person'}
          <NumberField min={1} max={LIMITS.entriesPerPerson} value={poll.maxEntries} disabled={disabled} onChange={(maxEntries) => onChange({ ...poll, maxEntries })} />
        </label>
      )}
      {poll.type === 'rating' && (
        <>
          <label>Scale
            <select value={poll.max} disabled={disabled} onChange={(e) => onChange({ ...poll, max: Number(e.target.value) })}>
              {[3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>1 to {n}</option>)}
            </select>
          </label>
          <div className="field-row">
            <label className="grow">Label for 1<input value={poll.lowLabel} maxLength={LIMITS.optionChars} disabled={disabled} onChange={(e) => onChange({ ...poll, lowLabel: e.target.value })} /></label>
            <label className="grow">Label for {poll.max}<input value={poll.highLabel} maxLength={LIMITS.optionChars} disabled={disabled} onChange={(e) => onChange({ ...poll, highLabel: e.target.value })} /></label>
          </div>
        </>
      )}
    </>
  );
}

/** Whether a poll has settings beyond its question and options. */
export const hasSettings = (poll: Poll) => poll.type !== 'ranking';

/** `settings` shows the poll's settings under its fields. `tally` and `texts` are its results so far. */
export function PollEditor({ poll, onChange, disabled, tally, texts, settings = true }: {
  poll: Poll;
  onChange: (p: Poll) => void;
  disabled?: boolean;
  tally?: Tally | null;
  texts?: Texts;
  settings?: boolean;
}) {
  return (
    <div className="stack">
      <TitleField label="Question" value={poll.title} disabled={disabled} onChange={(title) => onChange({ ...poll, title })} />
      {poll.type === 'choice' && (
        <Options options={poll.options} max={LIMITS.optionsPerChoice} disabled={disabled} tally={tally} share
          onChange={(options) => onChange({ ...poll, options, maxPicks: Math.min(poll.maxPicks, options.length) })} />
      )}
      {poll.type === 'ranking' && <Options options={poll.options} max={LIMITS.optionsPerChoice} disabled={disabled} tally={tally} onChange={(options) => onChange({ ...poll, options })} />}
      {poll.type !== 'choice' && poll.type !== 'ranking' && !!tally?.people && <PollResults poll={poll} tally={tally} texts={texts} />}
      {settings && <PollSettings poll={poll} onChange={onChange} disabled={disabled} />}
    </div>
  );
}

function QuestionEditor({ question, index, onChange, onRemove, disabled, tally }: { question: QuizQuestion; index: number; onChange: (q: QuizQuestion) => void; onRemove?: () => void; disabled?: boolean; tally?: Tally | null }) {
  return (
    <div className="sub">
      <div className="spread">
        <span className="row" style={{ flexWrap: 'nowrap' }}>
          <span className="qnum num">{index + 1}</span>
          <span className="stack" style={{ gap: 0 }}>
            <span className="strong">Question</span>
            <span className="row small muted">{tally && <span className="num">{tally.people} answered ·</span>}
              <select className="inline" aria-label="Time limit" value={question.seconds} disabled={disabled} onChange={(e) => onChange({ ...question, seconds: Number(e.target.value) })}>
                {QUIZ_SECONDS.map((n) => <option key={n} value={n}>{n} sec</option>)}
              </select>
            </span>
          </span>
        </span>
        {onRemove && <button type="button" className="icon-btn ghost" aria-label={`Remove question ${index + 1}`} disabled={disabled} onClick={onRemove}><Icon name="trash" /></button>}
      </div>
      <input aria-label={`Question ${index + 1}`} placeholder="Question" value={question.title} maxLength={LIMITS.titleChars} disabled={disabled} onChange={(e) => onChange({ ...question, title: e.target.value })} />
      <Options options={question.options} max={LIMITS.quizOptions} disabled={disabled} name={`correct-${question.id}`} correctId={question.correctId} tally={tally}
        onCorrect={(correctId) => onChange({ ...question, correctId })}
        onChange={(options) => onChange({ ...question, options, correctId: options.some((o) => o.id === question.correctId) ? question.correctId : options[0].id })} />
    </div>
  );
}

/** `tallies` are the counts of each question, by its id, once the quiz has been played. */
export function QuizEditor({ quiz, onChange, disabled, tallies }: { quiz: Quiz; onChange: (q: Quiz) => void; disabled?: boolean; tallies?: Record<string, Tally> }) {
  return (
    <div className="stack">
      <TitleField label="Quiz name" value={quiz.title} disabled={disabled} onChange={(title) => onChange({ ...quiz, title })} />
      {quiz.questions.map((q, i) => (
        <QuestionEditor key={q.id} question={q} index={i} disabled={disabled} tally={tallies?.[q.id]?.people ? tallies[q.id] : undefined}
          onChange={(next) => onChange({ ...quiz, questions: quiz.questions.map((x) => (x.id === q.id ? next : x)) })}
          onRemove={quiz.questions.length > 1 ? () => onChange({ ...quiz, questions: quiz.questions.filter((x) => x.id !== q.id) }) : undefined} />
      ))}
      {quiz.questions.length < LIMITS.itemsPerGroup && (
        <div><button type="button" disabled={disabled} onClick={() => onChange({ ...quiz, questions: [...quiz.questions, blankQuizQuestion()] })}><Icon name="plus" />Add question</button></div>
      )}
    </div>
  );
}

/** `tallies` and `texts` are the results of each poll in the survey, by its id. */
export function SurveyEditor({ survey, onChange, disabled, tallies, texts }: { survey: Survey; onChange: (s: Survey) => void; disabled?: boolean; tallies?: Record<string, Tally>; texts?: Record<string, Texts> }) {
  return (
    <div className="stack">
      <TitleField label="Survey name" value={survey.title} disabled={disabled} onChange={(title) => onChange({ ...survey, title })} />
      {survey.polls.map((p, i) => (
        <div key={p.id} className="sub">
          <div className="spread">
            <span className="row strong"><Icon name={TYPE_ICON[p.type]} />{TYPE_LABEL[p.type]} <span className="num faint">{i + 1}</span>{tallies?.[p.id] && <span className="count num">· {tallies[p.id].people} answered</span>}</span>
            <button type="button" className="icon-btn ghost" aria-label={`Remove question ${i + 1}`} disabled={disabled}
              onClick={() => onChange({ ...survey, polls: survey.polls.filter((x) => x.id !== p.id) })}><Icon name="trash" /></button>
          </div>
          <PollEditor poll={p} disabled={disabled} tally={tallies?.[p.id]?.people ? tallies[p.id] : undefined} texts={texts?.[p.id]}
            onChange={(next) => onChange({ ...survey, polls: survey.polls.map((x) => (x.id === p.id ? next : x)) })} />
        </div>
      ))}
      {survey.polls.length < LIMITS.itemsPerGroup && (
        <label>Add question
          <select value="" disabled={disabled} onChange={(e) => { if (e.target.value) onChange({ ...survey, polls: [...survey.polls, blankPoll(e.target.value as PollType)] }); }}>
            <option value="">Choose a type</option>
            {POLL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
