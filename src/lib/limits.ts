/**
 * Fair-use limits. The product is free, so these are what keep one account from running up the bill.
 * Each is one number; raise it here.
 */
export const LIMITS = {
  peoplePerSession: 1000,
  liveSessionsPerAccount: 5,
  sessionsPerAccount: 100,
  interactionsPerSession: 50,
  /** The most a session's polls, quizzes and surveys may take up when stored, in bytes. One database row holds them. */
  sessionBytes: 300_000,
  /** Questions in one quiz, and polls in one survey. */
  itemsPerGroup: 20,
  optionsPerChoice: 10,
  entriesPerPerson: 3,
  titleChars: 200,
  optionChars: 80,
  wordChars: 25,
  openChars: 280,
  announcementChars: 500,
  nicknameChars: 24,
  questionChars: 280,
  replyChars: 500,
  questionsPerPerson: 20,
  questionsPerSession: 1000,
  repliesPerQuestion: 10,
  quizOptions: 4,
  /** The most one quiz answer can earn: half for being right, half for speed. */
  quizPoints: 1000,
  /** Rows on the big screen's leaderboard. */
  boardSize: 5,
  /** A session's code works this long after the session is made, unless it is ended sooner. */
  sessionDays: 7,
  /** A session's rows (people, answers, questions, scores) are deleted this long after they are written. */
  keepDays: 365,
} as const;
