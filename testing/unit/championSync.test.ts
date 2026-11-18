import { describe, expect, it } from 'vitest';
import { CHAMPION_STATUS_TO_STAGE, resolveAutoMoveStage } from '../../src/lib/championSync';
import { CONTACT_STATUSES } from '../../src/types';
import type { ContactStatus, Stage } from '../../src/types';

// Locked mapping for Skylance CRM
const EXPECTED: Record<ContactStatus, Stage | null> = {
  'Not Contacted': null,
  'No Answer': null,
  Connected: 'Contacted',
  Interested: 'Qualified',
  'Follow-up Required': 'Follow-up',
  'Not Interested': 'Not Interested',
  'Wrong Number': null,
};

describe('CHAMPION_STATUS_TO_STAGE', () => {
  it('maps every champion status exactly as the contract specifies', () => {
    expect(CHAMPION_STATUS_TO_STAGE).toEqual(EXPECTED);
  });

  it('has an entry for every ContactStatus (no missing keys)', () => {
    for (const status of CONTACT_STATUSES) {
      expect(status in CHAMPION_STATUS_TO_STAGE).toBe(true);
    }
  });
});

describe('resolveAutoMoveStage', () => {
  it('returns null for the no-move statuses regardless of current stage', () => {
    for (const status of ['Not Contacted', 'No Answer', 'Wrong Number'] as ContactStatus[]) {
      expect(resolveAutoMoveStage('New Lead', status)).toBeNull();
    }
  });

  it('moves forward to the mapped stage', () => {
    expect(resolveAutoMoveStage('New Lead', 'Connected')).toBe('Contacted');
    expect(resolveAutoMoveStage('New Lead', 'Follow-up Required')).toBe('Follow-up');
    expect(resolveAutoMoveStage('New Lead', 'Interested')).toBe('Qualified');
    expect(resolveAutoMoveStage('New Lead', 'Not Interested')).toBe('Not Interested');
  });

  it('never moves backward (mapped target behind current stage)', () => {
    // 'Contacted' sits behind 'Qualified' in STAGES order.
    expect(resolveAutoMoveStage('Qualified', 'Connected')).toBeNull();
    // 'Follow-up' sits behind 'Converted'.
    expect(resolveAutoMoveStage('Converted', 'Follow-up Required')).toBeNull();
  });

  it('does not move when the mapped target equals the current stage (strictly forward only)', () => {
    expect(resolveAutoMoveStage('Contacted', 'Connected')).toBeNull();
    expect(resolveAutoMoveStage('Follow-up', 'Follow-up Required')).toBeNull();
  });

  it('never auto-moves a closed company', () => {
    expect(resolveAutoMoveStage('Converted', 'Interested')).toBeNull();
    expect(resolveAutoMoveStage('Not Interested', 'Connected')).toBeNull();
  });

  it('leaves companies at Handoff Submitted or later to manual moves', () => {
    expect(resolveAutoMoveStage('Handoff Submitted', 'Not Interested')).toBeNull();
    expect(resolveAutoMoveStage('Converted', 'Not Interested')).toBeNull();
    // Without a terminal guard stage the custom map applies.
    expect(
      resolveAutoMoveStage('Qualified', 'Not Interested', ['New', 'Qualified', 'Lost'], {
        'Not Interested': 'Lost',
      })
    ).toBe('Lost');
  });

  it('puts a company at the furthest stage whatever order the calls happen in', () => {
    const stages = ['New Lead', 'Contacted', 'Follow-up', 'Qualified'];
    const map = { Connected: 'Contacted', 'Follow-up Required': 'Follow-up' };
    expect(resolveAutoMoveStage('New Lead', 'Connected', stages, map)).toBe('Contacted');
    expect(resolveAutoMoveStage('Contacted', 'Follow-up Required', stages, map)).toBe('Follow-up');
    expect(resolveAutoMoveStage('Follow-up', 'Connected', stages, map)).toBeNull();
  });

  it('moves Not Interested from an active mid stage', () => {
    expect(resolveAutoMoveStage('Follow-up', 'Not Interested')).toBe('Not Interested');
  });
});
