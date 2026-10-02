/**
 * Where each screen lives. The app builds to plain files, so a screen's id travels in the query
 * string rather than in the path. The join link people share goes through the API (`/j/<code>`),
 * which gives chat apps a preview and sends the phone on to the join page.
 */
/** The site's address, for the files that must name it in full (robots.txt, the sitemap). */
export const SITE = 'https://sessions.learnbox.one';
export const joinPath =(code: string) => `/s?c=${encodeURIComponent(code)}`;
export const shareLink = (origin: string, code: string) => `${origin}/j/${code}`;
export const sessionPath = (id: string) => `/app/session?id=${encodeURIComponent(id)}`;
export const resultsPath = (id: string) => `/app/session/results?id=${encodeURIComponent(id)}`;
export const presentPath = (id: string, displayKey?: string) => `/present?id=${encodeURIComponent(id)}${displayKey ? `#k=${displayKey}` : ''}`;
