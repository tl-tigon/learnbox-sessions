/**
 * The product's model.
 *
 * A facilitator owns sessions. A session is an event the audience joins with a code: its Q&A is
 * open throughout, and it holds a list of interactions (polls, quizzes and surveys) that the
 * facilitator starts one at a time. Interactions can be added and edited while the session runs.
 */

export interface ChoiceOption { id: string; label: string }

interface PollBase {
  id: string;
  /** The question. */
  title: string;
}

export interface ChoicePoll extends PollBase {
  type: 'choice';
  options: ChoiceOption[];
  /** How many options one person may pick. 1 = single choice. */
  maxPicks: number;
}

export interface WordcloudPoll extends PollBase {
  type: 'wordcloud';
  /** Words one person may send. */
  maxEntries: number;
}

export interface RatingPoll extends PollBase {
  type: 'rating';
  /** The scale runs 1..max. */
  max: number;
  lowLabel: string;
  highLabel: string;
}

export interface OpenPoll extends PollBase {
  type: 'open';
  /** Answers one person may send. */
  maxEntries: number;
}

/** People put the options in order. First place earns the most. */
export interface RankingPoll extends PollBase {
  type: 'ranking';
  options: ChoiceOption[];
}

/** One question the audience answers. */
export type Poll = ChoicePoll | WordcloudPoll | RatingPoll | OpenPoll | RankingPoll;
export type PollType = Poll['type'];

/** A timed question with one correct option. Correct, fast answers earn points. */
export interface QuizQuestion {
  id: string;
  title: string;
  options: ChoiceOption[];
  /** Blank in the copy the audience receives; the session state carries it once revealed. */
  correctId: string;
  seconds: number;
}

/** A run of quiz questions with a leaderboard. */
export interface Quiz {
  id: string;
  type: 'quiz';
  title: string;
  questions: QuizQuestion[];
}

/** Several polls answered together, each person at their own pace. */
export interface Survey {
  id: string;
  type: 'survey';
  title: string;
  polls: Poll[];
}

/** What a facilitator can start: one poll, a quiz or a survey. */
export type Interaction = Poll | Quiz | Survey;
export type InteractionType = Interaction['type'];

export interface QaSettings {
  /** Questions wait for the facilitator's approval before anyone else sees them. */
  moderation: boolean;
  /** People may ask without their name. */
  anonymous: boolean;
}

/**
 * The quiz in play. `index` is the question; -1 is the lobby, where players give their names.
 * Times are the server's clock, in milliseconds.
 */
export interface QuizState {
  quizId: string;
  index: number;
  openedAt: number;
  /** Answers after this are refused. */
  closesAt: number;
  revealed: boolean;
  /** The correct option of the current question, present once revealed. */
  correct?: string;
  /** The leaderboard is up. */
  board: boolean;
}

export interface SessionState {
  /** The interaction the facilitator has started, if any. */
  active: string | null;
  /** Results of the active poll are visible on the big screen and on phones. */
  showResults: boolean;
  /** Voting is closed on the active poll. */
  locked: boolean;
  /** The audience can ask questions. */
  qaOpen: boolean;
  /** A note from the facilitator, shown at the top of the Q&A tab. */
  announcement: string;
  /** The question the facilitator is answering now. */
  highlight?: string | null;
  quiz?: QuizState | null;
  /** Quizzes that have been played to the end. Each is played once. */
  played?: string[];
  /** Rises on every change, so a late or repeated update is ignored. */
  seq: number;
}

export interface Session {
  id: string;
  code: string;
  ownerSub: string;
  title: string;
  interactions: Interaction[];
  qa: QaSettings;
  /** Rises with each saved edit, so an edit made from an older copy (another window) is refused instead of overwriting. */
  rev?: number;
  status: 'live' | 'ended';
  state: SessionState;
  /** Lets a screen that is not signed in (a projector PC) show the presenter view. */
  displayKey: string;
  createdAt: string;
  endedAt?: string;
  /** Epoch seconds; the session closes itself after this. */
  closesAt: number;
}

/** What a person sends. Shape depends on the poll type. */
export type Answer =
  | { type: 'choice'; optionIds: string[] }
  | { type: 'wordcloud'; text: string }
  | { type: 'rating'; value: number }
  | { type: 'open'; text: string }
  | { type: 'ranking'; order: string[] }
  | { type: 'quiz'; optionId: string };

/** Live counts for one poll or quiz question. */
export interface Tally {
  /** People who answered. */
  people: number;
  /** choice and quiz: option id -> picks. rating: "1".."max" -> votes. wordcloud: word -> times sent. ranking: option id -> points. */
  counts: Record<string, number>;
}

/** One player's points in one quiz. `last` is what the question `lastId` earned them. */
export interface Score {
  token: string;
  nickname: string;
  total: number;
  last: number;
  lastId: string;
}

/** pending: waiting for approval. live: everyone sees it. answered and hidden are set by the facilitator. */
export type QuestionStatus = 'pending' | 'live' | 'answered' | 'hidden';

/** The facilitator's written reply under a question. */
export interface Reply { id: string; text: string; at: string }

/** One question from the audience. The token stays on the server. */
export interface Question {
  id: string;
  token: string;
  text: string;
  /** The asker's name; empty when asked anonymously. */
  name: string;
  status: QuestionStatus;
  votes: number;
  at: string;
  replies: Reply[];
}
