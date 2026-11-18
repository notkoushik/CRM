/**
 * Neutral product defaults. Instance overrides live in `app_settings` (DB)
 * and optional env (`BRAND_NAME`, `ALLOWED_EMAIL_DOMAIN`, etc.).
 */

export const DEFAULT_BRAND_NAME = 'Skylance Tek';

export const DEFAULT_BRAND_TAGLINE = 'Work. The Smarter Way.';

export const DEFAULT_LOGO_URL = '/skylance-icon.png';

export const DEFAULT_STAGES = [
  'New Lead',
  'Contacted',
  'Follow-up',
  'Qualified',
  'Handoff Submitted',
  'Converted',
  'Not Interested',
] as const;

export const DEFAULT_CONTACT_STATUSES = [
  'Not Contacted',
  'No Answer',
  'Connected',
  'Interested',
  'Follow-up Required',
  'Not Interested',
  'Wrong Number',
] as const;

/**
 * Whose status change auto-moves the company: only the champion, or any contact
 * (the company then sits at the furthest stage any of its contacts has reached).
 */
export type StageAutoMoveScope = 'champion' | 'any_contact';

export const DEFAULT_STAGE_AUTO_MOVE_SCOPE: StageAutoMoveScope = 'champion';

export function asStageAutoMoveScope(value: unknown): StageAutoMoveScope {
  return value === 'any_contact' ? 'any_contact' : 'champion';
}

/** Champion contact status → pipeline stage (forward-only auto-move). */
export const DEFAULT_CHAMPION_STATUS_TO_STAGE: Record<string, string | null> = {
  'Not Contacted': null,
  'No Answer': null,
  Connected: 'Contacted',
  Interested: 'Qualified',
  'Not Interested': 'Not Interested',
  'Wrong Number': null,
  'Follow-up Required': 'Follow-up',
};

/** Instance discovery questionnaire. Empty = hide Discovery section. */
export type DiscoveryInputType = 'text' | 'textarea' | 'number';

export interface DiscoveryQuestion {
  id: string;
  section: string;
  prompt: string;
  input: DiscoveryInputType;
}

export const DEFAULT_DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [];
