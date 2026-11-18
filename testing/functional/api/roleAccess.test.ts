import { afterAll, describe, expect, it } from 'vitest';
import { api, loginAsCookie, SEED } from './helpers';

describe('Skylance role and lead boundaries', () => {
  const createdCompanyIds: string[] = [];
  const createdContactIds: string[] = [];

  afterAll(async () => {
    const admin = await loginAsCookie(SEED.founder);
    for (const id of createdContactIds) {
      await api(`/api/contacts/${id}`, { method: 'DELETE', session: admin });
    }
    for (const id of createdCompanyIds) {
      await api(`/api/companies/${id}`, { method: 'DELETE', session: admin });
    }
  });

  it('keeps callers to their own leads and excludes lead access from developers', async () => {
    const callerA = await loginAsCookie(SEED.sdr);
    const callerB = await loginAsCookie(SEED.sdrB);
    const developer = await loginAsCookie(SEED.developer);
    const admin = await loginAsCookie(SEED.founder);
    const suffix = Date.now();

    const created = await api<{ id: string }>('/api/companies', {
      session: callerA,
      body: { companyName: `Caller-owned ${suffix}`, stage: 'Lead Added' },
    });
    expect(created.status).toBe(201);
    createdCompanyIds.push(created.data.id);
    const contact = await api<{ id: string }>('/api/contacts', {
      session: callerA,
      body: {
        companyId: created.data.id,
        contactName: `Caller-owned contact ${suffix}`,
        email: `caller-owned-${suffix}@example.test`,
      },
    });
    expect(contact.status).toBe(201);
    createdContactIds.push(contact.data.id);

    const own = await api<{ companies: { id: string; offeredPrice?: number | null }[] }>(
      '/api/bootstrap',
      { session: callerA }
    );
    expect(own.status).toBe(200);
    expect(own.data.companies.some((company) => company.id === created.data.id)).toBe(true);

    const other = await api<{ companies: { id: string }[] }>('/api/bootstrap', {
      session: callerB,
    });
    expect(other.status).toBe(200);
    expect(other.data.companies.some((company) => company.id === created.data.id)).toBe(false);
    expect((await api(`/api/contacts/${contact.data.id}/call-log`, { session: callerB })).status).toBe(404);
    expect(
      (await api(`/api/activity/company/${created.data.id}/history`, { session: callerB })).status
    ).toBe(404);
    expect(
      (await api(`/api/contacts/${contact.data.id}`, {
        method: 'PATCH',
        session: callerB,
        body: { contactName: 'Tampered contact' },
      })).status
    ).toBe(404);

    expect(
      (await api(`/api/companies/${created.data.id}`, {
        method: 'PATCH',
        session: callerB,
        body: { companyName: `Tampered ${suffix}` },
      })).status
    ).toBe(404);

    const developerBootstrap = await api<{ companies: unknown[]; contacts: unknown[] }>(
      '/api/bootstrap',
      { session: developer }
    );
    expect(developerBootstrap.status).toBe(200);
    expect(developerBootstrap.data.companies).toEqual([]);
    expect(developerBootstrap.data.contacts).toEqual([]);
    expect(
      (await api('/api/companies', { session: developer, body: { companyName: 'Forbidden' } }))
        .status
    ).toBe(403);

    const all = await api<{ companies: { id: string }[] }>('/api/bootstrap', { session: admin });
    expect(all.status).toBe(200);
    expect(all.data.companies.some((company) => company.id === created.data.id)).toBe(true);
  });

  it('shows the new Developer role and labels legacy SDR as Caller', async () => {
    const admin = await loginAsCookie(SEED.founder);
    const roles = await api<{ roles: string[] }>('/api/users/roles', { session: admin });
    expect(roles.status).toBe(200);
    expect(roles.data.roles).toContain('developer');
    expect(roles.data.roles).toContain('sdr');
  });
});
