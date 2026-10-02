/**
 * Fair-use limits. The product is free, so these are what keep one account from running up the bill.
 * Each is one number; raise it here.
 */
export const LIMITS = {
  peoplePerSession: 1000,
  liveSessionsPerAccount: 3,
  presentationsPerAccount: 50,
  slidesPerPresentation: 50,
  optionsPerChoice: 10,
  entriesPerPerson: 3,
  titleChars: 200,
  optionChars: 80,
  wordChars: 25,
  openChars: 280,
  contentChars: 1000,
  nicknameChars: 24,
  questionChars: 280,
  questionsPerPerson: 10,
  questionsPerSlide: 500,
  /** A session closes itself this long after it starts. */
  sessionHours: 24,
} as const;
