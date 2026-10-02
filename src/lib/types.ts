/**
 * The product's model.
 *
 * A facilitator owns presentations. A presentation is an ordered list of slides and can be run many
 * times. Each run is a session: it copies the slides when it starts, so editing the presentation
 * later never changes a session that already ran, and every answer belongs to the session.
 */

export type SlideType = 'choice' | 'wordcloud' | 'rating' | 'open' | 'qa' | 'quiz' | 'leaderboard' | 'content';

interface SlideBase {
  id: string;
  type: SlideType;
  /** The question, or the heading of a content slide. */
  title: string;
}

export interface ChoiceOption { id: string; label: string }

export interface ChoiceSlide extends SlideBase {
  type: 'choice';
  options: ChoiceOption[];
  /** How many options one person may pick. 1 = single choice. */
  maxPicks: number;
}

export interface WordcloudSlide extends SlideBase {
  type: 'wordcloud';
  /** Words one person may send. */
  maxEntries: number;
}

export interface RatingSlide extends SlideBase {
  type: 'rating';
  /** The scale runs 1..max. */
  max: number;
  lowLabel: string;
  highLabel: string;
}

export interface OpenSlide extends SlideBase {
  type: 'open';
  /** Answers one person may send. */
  maxEntries: number;
}

/** The audience asks questions and upvotes them. `title` is the slide's heading. */
export interface QaSlide extends SlideBase {
  type: 'qa';
  /** Questions wait for the facilitator's approval before anyone else sees them. */
  moderation: boolean;
  /** People may ask without their name. */
  anonymous: boolean;
}

/** A timed question with one correct option. Correct, fast answers earn points. */
export interface QuizSlide extends SlideBase {
  type: 'quiz';
  options: ChoiceOption[];
  /** Blank in the copy the audience receives; the session state carries it once revealed. */
  correctId: string;
  seconds: number;
}

/** The quiz standings so far. After the last quiz question it is the podium. */
export interface LeaderboardSlide extends SlideBase {
  type: 'leaderboard';
}

export interface ContentSlide extends SlideBase {
  type: 'content';
  body: string;
}

export type Slide = ChoiceSlide | WordcloudSlide | RatingSlide | OpenSlide | QaSlide | QuizSlide | LeaderboardSlide | ContentSlide;

export interface Presentation {
  id: string;
  ownerSub: string;
  title: string;
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
}

/** Who moves the slides: the presenter, or each person at their own pace (a survey). */
export type SessionMode = 'presenter' | 'survey';

/** The quiz question on the current slide. Times are the server's clock, in milliseconds. */
export interface QuizState {
  slideId: string;
  openedAt: number;
  /** Answers after this are refused. */
  closesAt: number;
  revealed: boolean;
  /** The correct option, present once revealed. */
  correct?: string;
}

export interface SessionState {
  /** Index into `slides` that the presenter is on. Unused in survey mode. */
  current: number;
  /** Results visible on the big screen and on phones. */
  showResults: boolean;
  /** Answers closed on the current slide. */
  locked: boolean;
  /** The question the presenter is answering now, on a Q&A slide. */
  highlight?: string | null;
  /** The quiz question in play on the current slide; absent until the presenter starts it. */
  quiz?: QuizState | null;
  /** Quiz slides already started. Each is played once. */
  played?: string[];
  /** Rises on every change, so a late or repeated update is ignored. */
  seq: number;
}

export interface Session {
  id: string;
  code: string;
  ownerSub: string;
  presentationId: string;
  title: string;
  slides: Slide[];
  mode: SessionMode;
  status: 'live' | 'ended';
  state: SessionState;
  /** Lets a screen that is not signed in (a projector PC) show the presenter view. */
  displayKey: string;
  createdAt: string;
  endedAt?: string;
  /** Epoch seconds; the session closes itself after this. */
  closesAt: number;
}

/** What a person sends. Shape depends on the slide type. */
export type Answer =
  | { type: 'choice'; optionIds: string[] }
  | { type: 'wordcloud'; text: string }
  | { type: 'rating'; value: number }
  | { type: 'open'; text: string }
  | { type: 'quiz'; optionId: string };

/** Live counts for one slide. */
export interface Tally {
  /** People who answered. */
  people: number;
  /** choice: option id -> picks. rating: "1".."max" -> votes. wordcloud: word -> times sent. */
  counts: Record<string, number>;
}

/** One player's quiz points. `last` is what `lastSlideId` earned them. */
export interface Score {
  token: string;
  nickname: string;
  total: number;
  last: number;
  lastSlideId: string;
}

/** pending: waiting for approval. live: everyone sees it. answered and hidden are set by the facilitator. */
export type QuestionStatus = 'pending' | 'live' | 'answered' | 'hidden';

/** One question on a Q&A slide. The token stays on the server. */
export interface Question {
  id: string;
  slideId: string;
  token: string;
  text: string;
  /** The asker's name; empty when asked anonymously. */
  name: string;
  status: QuestionStatus;
  votes: number;
  at: string;
}
