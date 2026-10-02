'use client';
/** The fields a facilitator fills in for a poll, a quiz or a survey. Each change hands back a new copy. */
import { useEffect, useState } from 'react';
import { Icon, TYPE_ICON, TYPE_LABEL } from './icons';
import { blankPoll, blankQuizQuestion, POLL_TYPES, QUIZ_SECONDS, shortId } from '@/lib/engine/polls';
import { LIMITS } from '@/lib/limits';
import type { ChoiceOption, Poll, PollType, Quiz, QuizQuestion, Survey } from '@/lib/types';

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

function Options({ options, max, onChange, disabled, correctId, onCorrect, name }: {
  options: ChoiceOption[];
  max: number;
  onChange: (next: ChoiceOption[]) => void;
  disabled?: boolean;
  /** With these, each option gets a radio that marks it as the correct answer. */
  correctId?: string;
  onCorrect?: (id: string) => void;
  name?: string;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {onCorrect && <span className="small muted">Correct · Option</span>}
      {options.map((o, i) => (
        <div className="field-row" key={o.id}>
          {onCorrect && <input type="radio" name={name} checked={correctId === o.id} disabled={disabled} aria-label={`Option ${i + 1} is correct`} onChange={() => onCorrect(o.id)} />}
          <input aria-label={`Option ${i + 1}`} value={o.label} maxLength={LIMITS.optionChars} placeholder={`Option ${i + 1}`} disabled={disabled}
            onChange={(e) => onChange(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} />
          <button type="button" className="icon-btn ghost" aria-label={`Remove option ${i + 1}`} disabled={disabled || options.length <= 2}
            onClick={() => onChange(options.filter((x) => x.id !== o.id))}><Icon name="x" /></button>
        </div>
      ))}
      {options.length < max && (
        <div><button type="button" disabled={disabled} onClick={() => onChange([...options, { id: shortId(), label: '' }])}><Icon name="plus" />Add option</button></div>
      )}
    </div>
  );
}

export function PollEditor({ poll, onChange, disabled }: { poll: Poll; onChange: (p: Poll) => void; disabled?: boolean }) {
  return (
    <div className="stack">
      <label>Question
        <input value={poll.title} maxLength={LIMITS.titleChars} disabled={disabled} onChange={(e) => onChange({ ...poll, title: e.target.value })} />
      </label>
      {poll.type === 'choice' && (
        <>
          <Options options={poll.options} max={LIMITS.optionsPerChoice} disabled={disabled}
            onChange={(options) => onChange({ ...poll, options, maxPicks: Math.min(poll.maxPicks, options.length) })} />
          <label>Picks per person
            <NumberField min={1} max={poll.options.length} value={poll.maxPicks} disabled={disabled} onChange={(maxPicks) => onChange({ ...poll, maxPicks })} />
          </label>
        </>
      )}
      {poll.type === 'ranking' && <Options options={poll.options} max={LIMITS.optionsPerChoice} disabled={disabled} onChange={(options) => onChange({ ...poll, options })} />}
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
    </div>
  );
}

function QuestionEditor({ question, index, onChange, onRemove, disabled }: { question: QuizQuestion; index: number; onChange: (q: QuizQuestion) => void; onRemove?: () => void; disabled?: boolean }) {
  return (
    <div className="sub">
      <div className="spread">
        <span className="strong">Question <span className="num">{index + 1}</span></span>
        {onRemove && <button type="button" className="icon-btn ghost" aria-label={`Remove question ${index + 1}`} disabled={disabled} onClick={onRemove}><Icon name="trash" /></button>}
      </div>
      <input aria-label={`Question ${index + 1}`} value={question.title} maxLength={LIMITS.titleChars} disabled={disabled} onChange={(e) => onChange({ ...question, title: e.target.value })} />
      <Options options={question.options} max={LIMITS.quizOptions} disabled={disabled} name={`correct-${question.id}`} correctId={question.correctId}
        onCorrect={(correctId) => onChange({ ...question, correctId })}
        onChange={(options) => onChange({ ...question, options, correctId: options.some((o) => o.id === question.correctId) ? question.correctId : options[0].id })} />
      <label>Time limit
        <select value={question.seconds} disabled={disabled} onChange={(e) => onChange({ ...question, seconds: Number(e.target.value) })}>
          {QUIZ_SECONDS.map((n) => <option key={n} value={n}>{n} seconds</option>)}
        </select>
      </label>
    </div>
  );
}

export function QuizEditor({ quiz, onChange, disabled }: { quiz: Quiz; onChange: (q: Quiz) => void; disabled?: boolean }) {
  return (
    <div className="stack">
      <label>Quiz name
        <input value={quiz.title} maxLength={LIMITS.titleChars} disabled={disabled} onChange={(e) => onChange({ ...quiz, title: e.target.value })} />
      </label>
      {quiz.questions.map((q, i) => (
        <QuestionEditor key={q.id} question={q} index={i} disabled={disabled}
          onChange={(next) => onChange({ ...quiz, questions: quiz.questions.map((x) => (x.id === q.id ? next : x)) })}
          onRemove={quiz.questions.length > 1 ? () => onChange({ ...quiz, questions: quiz.questions.filter((x) => x.id !== q.id) }) : undefined} />
      ))}
      {quiz.questions.length < LIMITS.itemsPerGroup && (
        <div><button type="button" disabled={disabled} onClick={() => onChange({ ...quiz, questions: [...quiz.questions, blankQuizQuestion()] })}><Icon name="plus" />Add question</button></div>
      )}
    </div>
  );
}

export function SurveyEditor({ survey, onChange, disabled }: { survey: Survey; onChange: (s: Survey) => void; disabled?: boolean }) {
  return (
    <div className="stack">
      <label>Survey name
        <input value={survey.title} maxLength={LIMITS.titleChars} disabled={disabled} onChange={(e) => onChange({ ...survey, title: e.target.value })} />
      </label>
      {survey.polls.map((p, i) => (
        <div key={p.id} className="sub">
          <div className="spread">
            <span className="row strong"><Icon name={TYPE_ICON[p.type]} />{TYPE_LABEL[p.type]} <span className="num faint">{i + 1}</span></span>
            <button type="button" className="icon-btn ghost" aria-label={`Remove question ${i + 1}`} disabled={disabled}
              onClick={() => onChange({ ...survey, polls: survey.polls.filter((x) => x.id !== p.id) })}><Icon name="trash" /></button>
          </div>
          <PollEditor poll={p} disabled={disabled} onChange={(next) => onChange({ ...survey, polls: survey.polls.map((x) => (x.id === p.id ? next : x)) })} />
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
