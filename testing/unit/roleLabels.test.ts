import { describe, expect, it } from 'vitest';
import { displayRole } from '../../src/types';
import { navItemsForRole } from '../../src/lib/nav';

describe('Skylance role presentation', () => {
  it('shows legacy SDR accounts as Callers and developer accounts as Developers', () => {
    expect(displayRole('sdr')).toBe('Caller');
    expect(displayRole('developer')).toBe('Developer');
    expect(displayRole('founder')).toBe('Admin');
  });

  it('gives developers only their assigned-project workspace navigation', () => {
    expect(navItemsForRole('developer').map((item) => item.id)).toEqual(['projects']);
    expect(navItemsForRole('developer')[0]?.label).toBe('Assigned Projects');
  });

  it('renames caller navigation around lead work', () => {
    const callerItems = navItemsForRole('sdr');
    expect(callerItems.find((item) => item.id === 'pipeline')?.label).toBe('My Leads');
    expect(callerItems.find((item) => item.id === 'handoffs')?.label).toBe('My Handoffs');
    expect(callerItems.find((item) => item.id === 'projects')?.label).toBe('My Projects');
    expect(callerItems.some((item) => item.id === 'users')).toBe(false);
  });
});
