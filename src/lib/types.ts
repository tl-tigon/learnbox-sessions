/**
 * The product's model.
 *
 * A facilitator owns presentations. A presentation is an ordered list of slides and can be run many
 * times. Each run is a session: it copies the slides when it starts, so editing the presentation
 * later never changes a session that already ran, and every answer belongs to the session.
 */

export type SlideType = 'choice' | 'wordcloud' | 'rating' | 'open' | 'content';

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

export interface ContentSlide extends SlideBase {
  type: 'content';
  body: string;
}

export type Slide = ChoiceSlide | WordcloudSlide | RatingSlide | OpenSlide | ContentSlide;

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

export interface SessionState {
  /** Index into `slides` that the presenter is on. Unused in survey mode. */
  current: number;
  /** Results visible on the big screen and on phones. */
  showResults: boolean;
  /** Answers closed on the current slide. */
  locked: boolean;
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
  | { type: 'open'; text: string };

/** Live counts for one slide. */
export interface Tally {
  /** People who answered. */
  people: number;
  /** choice: option id -> picks. rating: "1".."max" -> votes. wordcloud: word -> times sent. */
  counts: Record<string, number>;
}
