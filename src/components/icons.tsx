/** The product's icons: one line style, drawn in the text colour. */
import type { InteractionType } from '@/lib/types';

const PATHS = {
  chat: 'M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  bars: 'M5 17V9M10 17V4M15 17v-6',
  user: 'M10 10a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3.5 17c.6-3 3.2-4.6 6.5-4.6s5.900 1.600 6.500 4.600',
  users: 'M7.500 9.500a2.800 2.800 0 1 0 0-5.600 2.800 2.800 0 0 0 0 5.600zM2 16.500c.5-2.600 2.700-4 5.500-4s5 1.400 5.500 4M13.500 9.400a2.500 2.500 0 1 0-.8-4.900M15 12.600c1.700.4 2.800 1.700 3.200 3.900',
  thumb: 'M6.500 9l3-6c1.200 0 2 .9 2 2v3h3.800a1.600 1.600 0 0 1 1.600 1.900l-1 5.400a2 2 0 0 1-2 1.700H6.500M6.500 9v8M6.500 9H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.500',
  lock: 'M5.500 9h9a1.500 1.500 0 0 1 1.500 1.500v5A1.500 1.500 0 0 1 14.500 17h-9A1.500 1.500 0 0 1 4 15.500v-5A1.500 1.500 0 0 1 5.500 9zM7 9V6.500a3 3 0 0 1 6 0V9',
  unlock: 'M5.500 9h9a1.500 1.500 0 0 1 1.500 1.500v5A1.500 1.500 0 0 1 14.500 17h-9A1.500 1.500 0 0 1 4 15.500v-5A1.500 1.500 0 0 1 5.500 9zM7 9V6.500a3 3 0 0 1 5.800-1',
  megaphone: 'M3 8.500v3a1 1 0 0 0 1 1h2l5 3.500v-12L6 7.500H4a1 1 0 0 0-1 1zM14 7.500a3.500 3.500 0 0 1 0 5M16 5.500a6.500 6.500 0 0 1 0 9',
  down: 'M5 7.500l5 5 5-5',
  up: 'M5 12.500l5-5 5 5',
  right: 'M4 10h12M11 5l5 5-5 5',
  left: 'M16 10H4M9 5l-5 5 5 5',
  play: 'M6.500 4.500l9 5.500-9 5.500z',
  stop: 'M5.500 5.500h9v9h-9z',
  plus: 'M10 4v12M4 10h12',
  trash: 'M4 6h12M8 6V4.500h4V6M5.500 6l.7 9.500a1.500 1.500 0 0 0 1.500 1.400h4.600a1.500 1.500 0 0 0 1.500-1.400L14.500 6M8.500 9v5M11.500 9v5',
  check: 'M4.500 10.500l3.500 3.500 7.500-8',
  reply: 'M4 4v5a3 3 0 0 0 3 3h9M12.500 8.500L16 12l-3.500 3.500',
  x: 'M5 5l10 10M15 5L5 15',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  morev: 'M10 5h.01M10 10h.01M10 15h.01',
  menu: 'M3.500 5.500h13M3.500 10h13M3.500 14.500h13',
  unpin: 'M5.500 4.500l4.500 4.500 4.500-4.500M5.500 9l4.500 4.500L14.500 9',
  restore: 'M4.500 10a5.500 5.500 0 1 0 1.800-4.100M4.500 3.500V6.500h3',
  send: 'M17 3L8.500 11.500M17 3l-5.500 14-3-5.500-5.500-3z',
  clock: 'M10 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM10 8v3l2 1.500M8 2.500h4',
  medal: 'M10 17.500a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM7 8.500L4.500 2.500h4L10 6l1.500-3.500h4L13 8.500M10 10.500v4M9 11.500l1-1',
  swap: 'M4 7h12M13 4l3 3-3 3M16 13H4M7 10l-3 3 3 3',
  moon: 'M16 11.500A6.500 6.500 0 1 1 8.500 4a5 5 0 0 0 7.500 7.500z',
  list: 'M4 4.500h12v11H4zM7 8.500h6M7 11.500h6',
  trend: 'M3 14l4.500-4.500 3 3L17 6M12.500 6H17v4.500',
  sliders: 'M3.500 6h6M13.500 6h3M3.500 14h3M10.500 14h6M11.500 4v4M8.500 12v4',
  share: 'M5.500 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14.500 8.500a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14.500 17.500a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7.300 10.100l5.400-2.700M7.300 11.900l5.400 2.700',
  phone: 'M6.500 3h7a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 14.500h2',
  search: 'M9 14.500a5.500 5.500 0 1 0 0-11 5.500 5.500 0 0 0 0 11zM13 13l4 4',
  sort: 'M6 4v12M6 16l-2.500-2.500M6 16l2.500-2.500M14 16V4M14 4l-2.500 2.500M14 4l2.500 2.500',
  screen: 'M3.500 4.500h13v9h-13zM7.500 17h5M10 13.500V17',
  download: 'M10 3.500v9M6 9l4 4 4-4M4 16.500h12',
  copy: 'M7.500 7.500h8v9h-8zM5 12.500H4.500v-9h8V4',
  eye: 'M2 10s3-5.500 8-5.500S18 10 18 10s-3 5.500-8 5.500S2 10 2 10zM10 12.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
  eyeoff: 'M3 3l14 14M8 5a8 8 0 0 1 2-.5c5 0 8 5.500 8 5.500a13 13 0 0 1-2.500 3M12.500 14.800a7 7 0 0 1-2.500.7c-5 0-8-5.500-8-5.500a13 13 0 0 1 3.200-3.600',
  pin: 'M5.500 11l4.500-4.500 4.500 4.500M5.500 15.500l4.500-4.500 4.500 4.500',
  choice: 'M4 4.500h12v11H4zM7 8l1 1 2-2M12.500 8h1M7 12h.01M9.500 12h4',
  cloud: 'M6 15.500a3.500 3.500 0 0 1-.6-6.950 5 5 0 0 1 9.600 1.200A3 3 0 0 1 14.500 15.500z',
  star: 'M10 3l2.100 4.500 4.900.6-3.600 3.400.9 4.900L10 14l-4.300 2.400.9-4.900L3 8.100l4.900-.6z',
  text: 'M4 5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3 2.500V14H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM6.500 8.500h7M6.500 11h4',
  ranking: 'M4 4.500h8M4 10h12M4 15.500h5',
  quiz: 'M6.500 3.500h7v4a3.500 3.500 0 0 1-7 0zM6.500 5H4v1a2.500 2.500 0 0 0 2.500 2.500M13.500 5H16v1a2.500 2.500 0 0 1-2.500 2.500M10 11v3M7 16.500h6',
  survey: 'M3.500 6h5l1.500 1.500h6.500v8.500h-13zM6.500 11h7M6.500 13.500h4',
  feedback: 'M4 4h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-3 2.500V14H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7.500 9.200l1.700 1.700 3.300-3.400',
  spark: 'M10 3c.600 3.600 2.400 5.400 6 6-3.600.600-5.400 2.400-6 6-.600-3.600-2.400-5.400-6-6 3.600-.600 5.400-2.400 6-6zM4 2.500v3M2.500 4h3M16 14.500v3M14.500 16h3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ width: size, height: size }}>
      <path d={PATHS[name]} />
    </svg>
  );
}

export const TYPE_ICON: Record<InteractionType, IconName> = { choice: 'choice', wordcloud: 'cloud', rating: 'star', open: 'text', ranking: 'ranking', quiz: 'quiz', survey: 'survey', feedback: 'feedback' };
export const TYPE_LABEL: Record<InteractionType, string> = { choice: 'Multiple choice', wordcloud: 'Word cloud', rating: 'Rating', open: 'Open text', ranking: 'Ranking', quiz: 'Quiz', survey: 'Survey', feedback: 'Feedback' };
