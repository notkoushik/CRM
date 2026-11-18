import { describe, expect, it } from 'vitest';
import { api, loginAsCookie, SEED } from './helpers';

/** Contact call log keeps every day's outcome; bootstrap exposes past statuses. */

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe('contact call log', () => {
  it('keeps the first call after the status is overwritten, for SDRs too', async () => {
    const founder = await loginAsCookie(SEED.founder);
    const sdr = await loginAsCookie(SEED.sdr);
    const u = uniq();
    const created = await api<{ id: string }>('/api/contacts', {
      body: {
        contactName: `Call Log ${u}`,
        email: `call.log.${u}@example.test`,
        contactStatus: 'Not Contacted',
        champion: false,
      },
      session: sdr,
    });
    expect(created.status).toBe(201);
    const id = created.data.id;

    const first = await api(`/api/contacts/${id}`, {
      method: 'PATCH',
      body: {
        contactStatus: 'Connected - Future Follow-up',
        nextFollowUp: '2030-01-02',
        notes: 'Busy, call tomorrow',
      },
      session: sdr,
    });
    expect(first.status).toBe(200);
    const second = await api(`/api/contacts/${id}`, {
      method: 'PATCH',
      body: { contactStatus: "Didn't Pick" },
      session: sdr,
    });
    expect(second.status).toBe(200);

    const log = await api<{
      events: Array<{ eventType: string; payload: Record<string, unknown>; userName: string }>;
    }>(`/api/contacts/${id}/call-log`, { method: 'GET', session: sdr });
    expect(log.status).toBe(200);
    const statuses = log.data.events
      .filter((e) => e.eventType === 'contact.status_changed')
      .map((e) => e.payload.to);
    expect(statuses).toEqual(['Connected - Future Follow-up', "Didn't Pick"]);
    expect(log.data.events.some((e) => e.eventType === 'contact.note_added')).toBe(true);
    expect(log.data.events.some((e) => e.eventType === 'contact.follow_up_set')).toBe(true);

    const boot = await api<{
      contacts: Array<{ id: string; statusHistory?: string[]; firstContactedAt?: string | null }>;
    }>('/api/bootstrap', { method: 'GET', session: sdr });
    const row = boot.data.contacts.find((c) => c.id === id)!;
    expect(row.statusHistory).toEqual(
      expect.arrayContaining(['Not Contacted', 'Connected - Future Follow-up', "Didn't Pick"])
    );
    expect(row.firstContactedAt).toBeTruthy();

    await api(`/api/contacts/${id}`, { method: 'DELETE', session: founder });
  });

  it('404s for an unknown contact', async () => {
    const session = await loginAsCookie(SEED.founder);
    const res = await api('/api/contacts/00000000-0000-4000-8000-000000000000/call-log', {
      method: 'GET',
      session,
    });
    expect(res.status).toBe(404);
  });

  it('runs the interactive Exotel POC telephony workflow end-to-end', async () => {
    const founder = await loginAsCookie(SEED.founder);
    const sdr = await loginAsCookie(SEED.sdr);

    // 1. Status check
    const statusRes = await api<{ configured: boolean; mode: string; provider: string }>(
      '/api/exotel/status',
      { method: 'GET', session: sdr }
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.data.configured).toBe(true);
    expect(statusRes.data.provider).toBe('Exotel');

    // 2. Create lead and contact
    const u = uniq();
    const compRes = await api<{ id: string }>('/api/companies', {
      body: { companyName: `Tel Co ${u}`, stage: 'Lead Added' },
      session: founder,
    });
    expect(compRes.status).toBe(201);
    const companyId = compRes.data.id;

    const contactRes = await api<{ id: string }>('/api/contacts', {
      body: {
        companyId,
        contactName: `Telephony Lead ${u}`,
        phone: '+919876543210',
        contactStatus: 'Not Contacted',
        champion: true,
      },
      session: founder,
    });
    expect(contactRes.status).toBe(201);
    const contactId = contactRes.data.id;

    // 3. Start Exotel call in POC mode
    const callRes = await api<{
      callLog: {
        id: string;
        providerCallSid: string;
        providerStatus: string;
        contactName: string;
      };
    }>('/api/exotel/calls', {
      method: 'POST',
      body: { contactId },
      session: founder,
    });
    expect(callRes.status).toBe(201);
    expect(callRes.data.callLog.id).toBeTruthy();
    expect(callRes.data.callLog.providerCallSid).toMatch(/^poc_exo_/);
    const callLogId = callRes.data.callLog.id;

    // 4. Complete active call with disposition & notes
    const completeRes = await api<{ ok: boolean; callLogId: string }>(
      `/api/exotel/calls/${callLogId}/complete`,
      {
        method: 'POST',
        body: {
          durationSeconds: 42,
          outcome: 'Interested',
          notes: 'Client confirmed budget and requested quotation document.',
          nextFollowUpAt: '2026-11-25',
        },
        session: founder,
      }
    );
    expect(completeRes.status).toBe(200);
    expect(completeRes.data.ok).toBe(true);

    // 5. Verify recording stream
    const recRes = await api(`/api/exotel/call-logs/${callLogId}/recording`, {
      method: 'GET',
      session: founder,
    });
    expect(recRes.status).toBe(200);

    // 6. Verify structured call log output
    const listRes = await api<{ callLogs: Array<{ id: string; outcome: string; hasRecording: boolean }> }>(
      `/api/call-logs?contactId=${contactId}`,
      { method: 'GET', session: founder }
    );
    expect(listRes.status).toBe(200);
    const saved = listRes.data.callLogs.find((c) => c.id === callLogId);
    expect(saved).toBeTruthy();
    expect(saved?.outcome).toBe('Interested');
    expect(saved?.hasRecording).toBe(true);

    // Cleanup
    await api(`/api/companies/${companyId}`, { method: 'DELETE', session: founder });
  });
});
