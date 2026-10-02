/**
 * The site's pages: what the menus list and what each product page says.
 * Draft copy, kept to plain statements; the owner edits the wording. Numbers come from LIMITS,
 * PLANS and the price in `plans.ts`. What is on Pro only says so.
 */
import type { IconName } from '@/components/icons';
import { LIMITS, PLANS } from './limits';
import { PRO_OPTIONS, YEAR_PER_MONTH } from './plans';

/** A drawing of the product's screens (`src/components/site/mock.tsx`). */
export type VisualName =
  | 'poll' | 'cloud' | 'rating' | 'open' | 'ranking'
  | 'qa' | 'qa-ask' | 'qa-review' | 'qa-highlight' | 'qa-reply'
  | 'quiz-open' | 'quiz-reveal' | 'quiz-board'
  | 'survey' | 'results' | 'join' | 'host' | 'phone-poll';

/** A small drawing for a step card. */
export type ArtName = 'add' | 'code' | 'bars' | 'question' | 'highlight' | 'timer' | 'board' | 'words' | 'field' | 'survey' | 'download' | 'start';

export interface FeaturePage {
  slug: string;
  /** Its name in the menus. */
  nav: string;
  icon: IconName;
  /** One line for the menus and cards. */
  line: string;
  title: string;
  /** The heading of its section on the product tour. */
  tour: string;
  lead: string;
  points: string[];
  visual: VisualName;
  steps: { title: string; text: string; art: ArtName }[];
  /** A working example on the page: vote or ask on the phone, and the big screen follows. */
  demo?: 'poll' | 'qa';
  rows: { label: string; title: string; text: string; visual: VisualName }[];
  more: { icon: IconName; title: string; text: string }[];
  /** The heading over the last button. */
  closing: string;
}

const n = (v: number) => v.toLocaleString('en-US');

export const FEATURES: FeaturePage[] = [
  {
    slug: 'polls',
    nav: 'Live polls',
    icon: 'bars',
    line: 'Ask a question. The results build on the big screen as people answer.',
    title: 'Live polls',
    tour: 'Five poll types',
    lead: 'Ask your audience a question and show the answers as they arrive. Five poll types, started one at a time.',
    points: ['Answers from any phone or laptop', 'No app and no account for the audience', 'Results on the big screen as they arrive'],
    visual: 'poll',
    steps: [
      { title: '1. Add a poll', text: 'Pick a type, write the question and its options.', art: 'add' },
      { title: '2. Start it', text: 'It opens on every phone in the session.', art: 'start' },
      { title: '3. Show the results', text: 'The big screen updates with each answer.', art: 'bars' },
    ],
    demo: 'poll',
    rows: [
      { label: 'Multiple choice', title: 'One pick or several', text: 'Set how many options a person may pick. The leading option is marked as the votes arrive.', visual: 'poll' },
      { label: 'Word cloud', title: `Up to ${LIMITS.entriesPerPerson} words each`, text: 'A word sent by more people shows larger. Blocked words are refused.', visual: 'cloud' },
      { label: 'Rating', title: 'A scale of up to 10', text: 'Label the two ends of the scale. The screen shows the average and how the answers spread.', visual: 'rating' },
      { label: 'Open text', title: 'Short written answers', text: `Each answer is up to ${LIMITS.openChars} characters. The newest show on the big screen.`, visual: 'open' },
      { label: 'Ranking', title: 'Options put in order', text: 'Each person orders the options. The screen shows the combined order.', visual: 'ranking' },
    ],
    more: [
      { icon: 'eyeoff', title: 'Hide results', text: 'Keep the results back while people vote, then show them.' },
      { icon: 'lock', title: 'Close voting', text: 'Stop new answers and keep the results on screen.' },
      { icon: 'swap', title: 'Change an answer', text: 'On multiple choice, rating and ranking polls, a person can edit their response while voting is open.' },
      { icon: 'list', title: 'Edit while live', text: 'Add or edit polls while the session runs.' },
      { icon: 'copy', title: 'Duplicate', text: 'Copy a poll, or a whole session, to use it again.' },
      { icon: 'download', title: 'Export', text: 'On Pro, download every poll’s results as CSV or Excel.' },
    ],
    closing: 'Run a poll at your next meeting',
  },
  {
    slug: 'qa',
    nav: 'Live Q&A',
    icon: 'chat',
    line: 'The audience sends questions and upvotes the ones they want answered.',
    title: 'Live Q&A',
    tour: 'Questions, upvoted by the audience',
    lead: 'The audience sends questions and upvotes the ones they want answered. The most upvoted rise to the top.',
    points: ['With a name or anonymous', 'No app and no account for the audience', 'Open for the whole session'],
    visual: 'qa',
    steps: [
      { title: '1. Create a session', text: 'Its Q&A is open from the start. People join with the code.', art: 'code' },
      { title: '2. Collect questions', text: 'People send questions and upvote each other’s.', art: 'question' },
      { title: '3. Answer on screen', text: 'Highlight the question you are answering, then mark it answered.', art: 'highlight' },
    ],
    demo: 'qa',
    rows: [
      { label: 'Anonymity', title: 'Questions with or without a name', text: 'A question sent without a name shows as Anonymous. You choose whether to allow that.', visual: 'qa-ask' },
      { label: 'Upvoting', title: 'The audience sets the order', text: 'One upvote per person on each question. Sort by most upvoted or by newest.', visual: 'qa' },
      { label: 'Review', title: 'Approve questions before they show', text: 'With review on, a question waits until you approve it. Questions with blocked words are refused.', visual: 'qa-review' },
      { label: 'Big screen', title: 'Show which question is being answered', text: 'The highlighted question stands out on the big screen and on every phone.', visual: 'qa-highlight' },
      { label: 'Replies', title: 'Answer in writing', text: 'Reply to a question as the host. The reply shows under the question on every phone.', visual: 'qa-reply' },
    ],
    more: [
      { icon: 'restore', title: 'Withdraw', text: 'A person can take back their own question until it is answered.' },
      { icon: 'lock', title: 'Close and reopen', text: 'Close the Q&A to new questions and open it again when you are ready.' },
      { icon: 'megaphone', title: 'Announcement', text: 'Put a note above the questions on every phone.' },
      { icon: 'check', title: 'Mark as answered', text: 'Answered questions move to their own list.' },
      { icon: 'moon', title: 'Dark mode', text: 'Each person can switch their phone’s screen to dark.' },
      { icon: 'download', title: 'Export', text: 'On Pro, download all questions with their votes and replies as CSV or Excel.' },
    ],
    closing: 'Take questions at your next meeting',
  },
  {
    slug: 'word-cloud',
    nav: 'Word cloud',
    icon: 'cloud',
    line: `Each person sends up to ${LIMITS.entriesPerPerson} words. Repeated words grow.`,
    title: 'Word clouds',
    tour: 'Words that grow as they repeat',
    lead: `Each person sends up to ${LIMITS.entriesPerPerson} words. Words sent by more people grow on the big screen.`,
    points: ['Builds as the words arrive', 'Blocked words are refused', 'No app and no account for the audience'],
    visual: 'cloud',
    steps: [
      { title: '1. Add a word cloud', text: 'Write the question and set the words per person.', art: 'add' },
      { title: '2. Collect words', text: 'People type a word on their phones and send it.', art: 'field' },
      { title: '3. Show the cloud', text: 'The big screen updates with each word.', art: 'words' },
    ],
    rows: [
      { label: 'Live', title: 'The cloud builds as words arrive', text: 'The most sent word is the largest. The same word typed in capitals or lower case counts as one.', visual: 'cloud' },
      { label: 'Filter', title: 'Blocked words are refused', text: `A word is up to ${LIMITS.wordChars} characters. A word on the blocked list is turned away on the phone that sent it.`, visual: 'phone-poll' },
    ],
    more: [
      { icon: 'sliders', title: 'Words per person', text: `Set 1 to ${LIMITS.entriesPerPerson} words each.` },
      { icon: 'eyeoff', title: 'Hide results', text: 'Keep the cloud back while people answer, then show it.' },
      { icon: 'download', title: 'Export', text: 'On Pro, download every word with its count as CSV or Excel.' },
    ],
    closing: 'Run a word cloud at your next meeting',
  },
  {
    slug: 'quizzes',
    nav: 'Quizzes',
    icon: 'quiz',
    line: 'Timed questions, points for correct and fast answers, and a leaderboard.',
    title: 'Quizzes',
    tour: 'Timed questions and a leaderboard',
    lead: 'Timed questions with one correct answer. Points for correct and fast answers, and a leaderboard at the end.',
    points: ['A timer on every question', 'A leaderboard on the big screen', 'Each phone shows its own place'],
    visual: 'quiz-board',
    steps: [
      { title: '1. Write the questions', text: `Up to ${LIMITS.itemsPerGroup} questions, each with up to ${LIMITS.quizOptions} options and a time limit.`, art: 'add' },
      { title: '2. Run it live', text: 'Start each question. People answer on their phones before the time runs out.', art: 'timer' },
      { title: '3. Show the leaderboard', text: `The top ${LIMITS.boardSize} show on the big screen.`, art: 'board' },
    ],
    rows: [
      { label: 'Timer', title: '10, 20, 30 or 60 seconds', text: 'Set the time for each question. The clock is the same on every phone and on the big screen.', visual: 'quiz-open' },
      { label: 'Reveal', title: 'The votes, then the correct answer', text: 'When time is up the screen shows how people voted. You reveal the correct option.', visual: 'quiz-reveal' },
      { label: 'Points', title: `Up to ${n(LIMITS.quizPoints)} points a question`, text: 'Half for the correct answer and half for speed. The leaderboard adds them up.', visual: 'quiz-board' },
    ],
    more: [
      { icon: 'lock', title: 'Checked on the server', text: 'Answers are timed and scored on the server. A phone receives the correct option only after you reveal it.' },
      { icon: 'medal', title: 'Own place', text: 'Each phone shows its place, its points and the points from the last question.' },
      { icon: 'download', title: 'Export', text: 'On Pro, download each question’s votes and the full leaderboard as CSV or Excel.' },
    ],
    closing: 'Run a quiz at your next meeting',
  },
  {
    slug: 'surveys',
    nav: 'Surveys',
    icon: 'survey',
    line: 'Several questions on one page, answered at each person’s own pace. On Pro.',
    title: 'Surveys',
    tour: 'Feedback on one page',
    lead: 'Several questions on one page. Each person answers at their own pace and sends them together. Surveys are on Pro.',
    points: ['All five poll types', `Up to ${LIMITS.itemsPerGroup} questions`, 'Results for each question'],
    visual: 'survey',
    steps: [
      { title: '1. Add a survey', text: 'Add its questions: multiple choice, word cloud, rating, open text or ranking.', art: 'add' },
      { title: '2. Start it', text: 'It opens on every phone. People answer and send.', art: 'survey' },
      { title: '3. Read the results', text: 'Each question has its own results. Download them all.', art: 'download' },
    ],
    rows: [
      { label: 'One page', title: 'Answered at each person’s own pace', text: 'The big screen shows the survey’s name while people answer. Results stay with you.', visual: 'survey' },
      { label: 'Results', title: 'Every question, counted', text: 'The results page lists each question with its counts, average or written answers.', visual: 'results' },
    ],
    more: [
      { icon: 'swap', title: 'Edit response', text: 'A person can change their answers while the survey is open.' },
      { icon: 'lock', title: 'Close it', text: 'Stop the survey to stop new answers.' },
      { icon: 'download', title: 'Export', text: 'Download every answer as CSV or Excel.' },
    ],
    closing: 'Collect feedback at your next meeting',
  },
  {
    slug: 'results',
    nav: 'Results',
    icon: 'trend',
    line: 'Every answer and question, on one page and as a download.',
    title: 'Results',
    tour: 'Every answer, on one page and as a download',
    lead: 'Every answer and question stays with its session. Read the results on one page, or download them on Pro.',
    points: ['One page for a whole session', 'CSV and Excel on Pro', `Kept for ${LIMITS.keepDays} days`],
    visual: 'results',
    steps: [
      { title: '1. Run your session', text: 'Polls, quizzes, surveys and the Q&A are saved as they happen.', art: 'bars' },
      { title: '2. Open the results', text: 'One page lists every poll, each quiz’s leaderboard and all questions.', art: 'board' },
      { title: '3. Download', text: 'On Pro, the same results as a CSV file or an Excel workbook.', art: 'download' },
    ],
    rows: [
      { label: 'While it runs', title: 'Each option’s result under the option', text: 'On the facilitator’s screen, the open poll shows each option’s share under it as the votes arrive.', visual: 'host' },
      { label: 'After', title: 'One page for the whole session', text: 'Poll counts, rating averages, written answers, leaderboards and the audience’s questions.', visual: 'results' },
    ],
    more: [
      { icon: 'download', title: 'CSV and Excel', text: 'On Pro. The Excel workbook has a sheet for the summary, each question, each leaderboard and the Q&A.' },
      { icon: 'user', title: 'Names by choice', text: 'A name appears only where a person chose to give one.' },
      { icon: 'trash', title: 'Delete', text: 'Deleting a session deletes its answers and questions.' },
    ],
    closing: 'Keep the results of your next meeting',
  },
];

export const feature = (slug: string) => FEATURES.find((f) => f.slug === slug);
/** A feature's menu name as it reads inside a sentence. */
export const inSentence = (f: FeaturePage) => (f.slug === 'qa' ? 'live Q&A' : f.nav.toLowerCase());

export interface UseCase { id: string; nav: string; icon: IconName; line: string; title: string; points: string[]; visual: VisualName }

export const USE_CASES: UseCase[] = [
  {
    id: 'training', nav: 'Training sessions', icon: 'quiz',
    line: 'Check what people took in, and take their questions.',
    title: 'Training sessions',
    points: ['Run a quiz after each module to check what people took in.', 'Keep the Q&A open and answer the most upvoted questions at each break.', 'On Pro, end with a survey and download the answers.'],
    visual: 'quiz-open',
  },
  {
    id: 'team-meetings', nav: 'Team meetings', icon: 'users',
    line: 'Hear from everyone on the team, not only those who speak.',
    title: 'Team meetings',
    points: ['Open with a word cloud or a rating to see where people stand.', 'Decide between options with a multiple choice or ranking poll.', 'Take questions in writing from people who do not speak up.'],
    visual: 'cloud',
  },
  {
    id: 'all-hands', nav: 'All-hands meetings', icon: 'megaphone',
    line: 'Collect questions before and during the meeting.',
    title: 'All-hands meetings',
    points: [`A session’s code works for ${LIMITS.sessionDays} days, so questions can come in before the meeting.`, 'Turn on review to approve questions before they show.', 'Answer the most upvoted first and mark each one answered.'],
    visual: 'qa-highlight',
  },
  {
    id: 'events', nav: 'Conferences and events', icon: 'screen',
    line: `Up to ${n(PLANS.free.peoplePerSession)} people in a session, ${n(PLANS.pro.peoplePerSession)} on Pro.`,
    title: 'Conferences and events',
    points: [`Up to ${n(PLANS.free.peoplePerSession)} people can join one session, and ${n(PLANS.pro.peoplePerSession)} on Pro.`, 'The big screen shows the code and a QR code.', 'Highlight the question the speaker is answering.'],
    visual: 'qa',
  },
  {
    id: 'classrooms', nav: 'Classrooms', icon: 'text',
    line: 'Students join with a code and no account.',
    title: 'Classrooms',
    points: ['Run a quiz at the end of a lesson.', 'Ask an open text question and show the answers on the screen.', 'Students join with the code. They need no account.'],
    visual: 'open',
  },
];

export interface NavItem { href: string; label: string; icon: IconName; text: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    label: 'Product',
    items: [
      { href: '/product', label: 'Product tour', icon: 'list', text: 'Everything a session can hold, on one page.' },
      ...FEATURES.map((f) => ({ href: `/features/${f.slug}`, label: f.nav, icon: f.icon, text: f.line })),
    ],
  },
  {
    label: 'Use cases',
    items: USE_CASES.map((u) => ({ href: `/use-cases#${u.id}`, label: u.nav, icon: u.icon, text: u.line })),
  },
];

export interface PlanCard { name: string; price: string; per: string; note: string; intro: string; lines: string[]; action: string; href: string; pro?: boolean }

/** The two plans as the pricing page shows them. */
export const PLAN_CARDS: PlanCard[] = [
  {
    name: 'Free', price: '₹0', per: 'Free forever', note: 'No card needed',
    intro: 'Includes',
    lines: [
      `Up to ${n(PLANS.free.peoplePerSession)} people in a session`,
      `Up to ${PLANS.free.interactionsPerSession} polls and quizzes in a session`,
      'Q&A with upvotes, review and replies',
      'All five poll types, and quizzes',
      'The big screen, with the code and a QR code',
      'Results on one page',
    ],
    action: 'Create free account', href: '/sign-in?mode=up',
  },
  {
    name: 'Pro', price: `₹${YEAR_PER_MONTH}`, per: 'a month', note: `Paid as ₹${PRO_OPTIONS.year.rupees} for ${PRO_OPTIONS.year.months} months, or ₹${PRO_OPTIONS.month.rupees} for 1 month. It does not renew.`,
    intro: 'Everything in Free, and',
    lines: [
      `Up to ${n(PLANS.pro.peoplePerSession)} people in a session`,
      `Up to ${PLANS.pro.interactionsPerSession} polls, quizzes and surveys in a session`,
      'Surveys',
      'Results as CSV and Excel',
    ],
    action: 'Get Pro', href: '/app/account', pro: true,
  },
];

/** A cell of the comparison: a value, or true and false for included and not. */
type Cell = string | boolean;
export interface CompareGroup { title: string; rows: { label: string; free: Cell; pro: Cell }[] }
const both = (label: string, value: Cell = true) => ({ label, free: value, pro: value });

export const COMPARE: CompareGroup[] = [
  {
    title: 'Sessions',
    rows: [
      { label: 'People in a session', free: n(PLANS.free.peoplePerSession), pro: n(PLANS.pro.peoplePerSession) },
      { label: 'Polls, quizzes and surveys in a session', free: String(PLANS.free.interactionsPerSession), pro: String(PLANS.pro.interactionsPerSession) },
      both('Sessions in an account', String(LIMITS.sessionsPerAccount)),
      both('Sessions live at once', String(LIMITS.liveSessionsPerAccount)),
      both('A session’s code works for', `${LIMITS.sessionDays} days`),
      both('The big screen, with the code and a QR code'),
    ],
  },
  {
    title: 'Q&A',
    rows: [both('Questions and upvotes'), both('Review before a question shows'), both('Replies from the host'), both('Highlight, mark answered, announcement')],
  },
  {
    title: 'Polls',
    rows: [
      both('Multiple choice, word cloud, rating, open text, ranking'),
      both('Quizzes with a timer and a leaderboard'),
      { label: 'Surveys', free: false, pro: true },
    ],
  },
  {
    title: 'Results',
    rows: [
      both('Results page for each session'),
      { label: 'Downloads as CSV and Excel', free: false, pro: true },
      both('Results kept for', `${LIMITS.keepDays} days`),
    ],
  },
];
