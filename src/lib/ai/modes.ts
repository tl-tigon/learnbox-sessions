/** The follow-up modes, as the facilitator picks them. Shared with the browser; the prompts stay on the server. */
export const MODE_LABEL = { explore: 'Explore', probe: 'Probe', challenge: 'Challenge', apply: 'Apply', check: 'Check understanding' } as const;
export type FollowUpMode = keyof typeof MODE_LABEL;
export const MODES = Object.keys(MODE_LABEL) as FollowUpMode[];
export const isMode = (v: unknown): v is FollowUpMode => typeof v === 'string' && v in MODE_LABEL;
