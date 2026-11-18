import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { Express, Request } from 'express';
import type { Pool } from 'pg';
import { config } from './config.js';
import { requireAuth, requireAdmin, requireCallerOrAdmin, requireCsrf } from './auth.js';
import { canAccessCompany } from './access.js';
import { logActivity } from './activity.js';
import { getAppSettings } from './settings.js';
import { resolveAutoMoveStage } from '../src/lib/championSync.js';

function exotelReady() {
  const e = config.exotel;
  return Boolean(e.accountSid && e.apiKey && e.apiToken && e.callerId && e.agentPhone && e.publicBaseUrl && e.webhookToken);
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

function callbackMatches(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function callbackUrl() {
  const base = config.exotel.publicBaseUrl!.replace(/\/$/, '');
  return `${base}/api/webhooks/exotel/${encodeURIComponent(config.exotel.webhookToken!)}`;
}

export function registerExotelRoutes(app: Express, pool: Pool) {
  app.get('/api/exotel/status', requireAuth, requireCallerOrAdmin, (_req, res) => {
    const isLive = exotelReady();
    res.json({
      configured: true,
      isLive,
      mode: isLive ? 'live' : 'poc',
      provider: 'Exotel',
      callerId: config.exotel.callerId || '+91 80 4718 2000 (ExoPhone Virtual)',
      agentPhone: config.exotel.agentPhone || '+91 98765 43210 (Shared Handset)',
    });
  });

  app.get('/api/exotel/admin/diagnostic', requireAuth, requireAdmin, async (_req, res) => {
    const isLive = exotelReady();
    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_calls,
         COUNT(*) FILTER (WHERE provider='exotel')::int AS exotel_calls,
         COUNT(*) FILTER (WHERE provider_status='completed')::int AS completed_calls,
         COUNT(*) FILTER (WHERE recording_url IS NOT NULL)::int AS recorded_calls,
         MAX(occurred_at) AS last_call_at
       FROM call_logs`
    );
    const stat = stats[0] || { total_calls: 0, exotel_calls: 0, completed_calls: 0, recorded_calls: 0, last_call_at: null };
    res.json({
      operational: true,
      mode: isLive ? 'live' : 'poc',
      isLive,
      provider: 'Exotel Voice v1',
      callerId: config.exotel.callerId || '+91 80 4718 2000 (ExoPhone Virtual)',
      agentPhone: config.exotel.agentPhone || '+91 98765 43210 (Shared Handset)',
      apiHost: config.exotel.apiHost || 'api.in.exotel.com',
      publicBaseUrl: config.exotel.publicBaseUrl || 'https://crm.skylance.local',
      webhookEndpoint: `/api/webhooks/exotel/${config.exotel.webhookToken ? 'configured' : 'active-poc'}`,
      databaseStatus: 'healthy',
      stats: {
        totalCalls: Number(stat.total_calls),
        exotelCalls: Number(stat.exotel_calls),
        completedCalls: Number(stat.completed_calls),
        recordedCalls: Number(stat.recorded_calls),
        lastCallAt: stat.last_call_at ? new Date(stat.last_call_at).toISOString() : null,
      },
    });
  });

  app.post('/api/exotel/calls', requireAuth, requireCallerOrAdmin, requireCsrf, async (req, res) => {
    const contactId = String(req.body?.contactId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(contactId)) {
      res.status(400).json({ error: 'A valid contactId is required.' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT ct.id, ct.contact_name, ct.phone, ct.company_id, co.company_name
       FROM contacts ct JOIN companies co ON co.id=ct.company_id WHERE ct.id=$1`, [contactId]
    );
    const contact = rows[0];
    if (!contact || !(await canAccessCompany(pool, req.user!, String(contact.company_id)))) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }

    if (!exotelReady()) {
      // Interactive POC Simulation Mode
      const fakeSid = `poc_exo_${crypto.randomUUID().slice(0, 8)}`;
      const { rows: created } = await pool.query(
        `INSERT INTO call_logs (company_id, contact_id, caller_id, outcome, provider, provider_status, call_direction, provider_call_sid, recording_url)
         VALUES ($1,$2,$3,'Call initiated','exotel','in-progress','outbound',$4,'simulated_recording')
         RETURNING id, occurred_at`,
        [contact.company_id, contactId, req.user!.sub, fakeSid]
      );
      const callLog = created[0];
      await logActivity({
        userId: req.user!.sub,
        sessionId: req.user!.sid,
        eventType: 'call.started',
        entityType: 'contact',
        entityId: contactId,
        summary: `Exotel call started for ${String(contact.contact_name)} (POC Mode)`,
        payload: { callLogId: String(callLog.id), callSid: fakeSid, companyId: String(contact.company_id) },
      });
      res.status(201).json({
        callLog: {
          id: String(callLog.id),
          providerCallSid: fakeSid,
          providerStatus: 'in-progress',
          occurredAt: new Date(String(callLog.occurred_at)).toISOString(),
          contactName: String(contact.contact_name),
          customerPhone: contact.phone,
          sharedAgentPhone: config.exotel.agentPhone || '+91 98765 43210 (Shared Handset)',
          callerId: config.exotel.callerId || '+91 80 4718 2000 (ExoPhone Virtual)',
          mode: 'poc',
        },
      });
      return;
    }

    const customerPhone = normalizePhone(contact.phone);
    const agentPhone = normalizePhone(config.exotel.agentPhone);
    const callerId = normalizePhone(config.exotel.callerId);
    if (!customerPhone || !agentPhone || !callerId) {
      res.status(400).json({ error: 'The contact, shared mobile, and Exotel number must be valid phone numbers.' });
      return;
    }

    const { rows: created } = await pool.query(
      `INSERT INTO call_logs (company_id, contact_id, caller_id, outcome, provider, provider_status, call_direction)
       VALUES ($1,$2,$3,'Call initiated','exotel','queued','outbound')
       RETURNING id, occurred_at`,
      [contact.company_id, contactId, req.user!.sub]
    );
    const callLog = created[0];
    const form = new URLSearchParams({
      From: agentPhone,
      To: customerPhone,
      CallerId: callerId,
      Record: 'true',
      StatusCallback: callbackUrl(),
      'StatusCallbackEvents[]': 'terminal',
      StatusCallbackContentType: 'application/json',
      CustomField: String(callLog.id),
    });
    const credentials = Buffer.from(`${config.exotel.apiKey}:${config.exotel.apiToken}`).toString('base64');
    const endpoint = `https://${config.exotel.apiHost}/v1/Accounts/${encodeURIComponent(config.exotel.accountSid!)}/Calls/connect.json`;
    let callSid: string | null = null;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => ({})) as {
        Call?: { Sid?: string; Status?: string };
        RestException?: { Message?: string };
      };
      if (!response.ok || !payload.Call?.Sid) {
        const message = payload.RestException?.Message ?? `Exotel call request failed (${response.status}).`;
        await pool.query(
          `UPDATE call_logs SET outcome='Call failed', provider_status='failed', notes=$1, updated_at=now() WHERE id=$2`,
          [message.slice(0, 1000), callLog.id]
        );
        res.status(502).json({ error: message });
        return;
      }
      callSid = payload.Call.Sid;
      await pool.query(
        `UPDATE call_logs SET provider_call_sid=$1,
          provider_status=CASE WHEN provider_status IN ('completed','busy','failed','no-answer') THEN provider_status ELSE $2 END,
          updated_at=now() WHERE id=$3`,
        [callSid, payload.Call.Status ?? 'queued', callLog.id]
      );
      await logActivity({
        userId: req.user!.sub,
        sessionId: req.user!.sid,
        eventType: 'call.started',
        entityType: 'contact',
        entityId: contactId,
        summary: `Exotel call started for ${String(contact.contact_name)}`,
        payload: { callLogId: String(callLog.id), callSid, companyId: String(contact.company_id) },
      });
      res.status(201).json({
        callLog: {
          id: String(callLog.id),
          providerCallSid: callSid,
          providerStatus: payload.Call.Status ?? 'queued',
          occurredAt: new Date(String(callLog.occurred_at)).toISOString(),
          contactName: String(contact.contact_name),
          sharedAgentPhone: agentPhone,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the Exotel call.';
      await pool.query(
        `UPDATE call_logs SET outcome='Call failed', provider_status='failed', notes=$1, updated_at=now() WHERE id=$2`,
        [message.slice(0, 1000), callLog.id]
      );
      res.status(502).json({ error: 'Could not start the call through Exotel. Check the account configuration and try again.' });
    }
  });

  // Exotel callbacks are authenticated by a long random URL token, then validated and deduplicated by CallSid.
  app.post('/api/webhooks/exotel/:token', async (req, res) => {
    const expected = config.exotel.webhookToken;
    const received = String(req.params.token ?? '');
    if (!expected || !callbackMatches(received, expected)) {
      res.status(404).end();
      return;
    }
    const body = req.body as Record<string, unknown>;
    const callSid = String(body.CallSid ?? '').trim();
    const status = String(body.Status ?? '').trim().toLowerCase();
    if (!callSid || !status || (body.AccountSid && config.exotel.accountSid && String(body.AccountSid) !== config.exotel.accountSid)) {
      res.status(400).json({ error: 'Invalid Exotel callback.' });
      return;
    }
    const durationValue = body.ConversationDuration ?? body.Duration;
    const duration = durationValue == null ? null : Number(durationValue);
    const recordingUrl = typeof body.RecordingUrl === 'string' && body.RecordingUrl.startsWith('https://')
      ? body.RecordingUrl
      : null;
    const customField = String(body.CustomField ?? '');
    const { rows } = await pool.query(
      `UPDATE call_logs SET
         provider_call_sid=COALESCE(provider_call_sid,$1), provider_status=$2,
         outcome=CASE WHEN $2='completed' THEN 'Call completed' ELSE 'Call ' || $2 END,
         duration_seconds=COALESCE($3,duration_seconds), recording_url=COALESCE($4,recording_url), updated_at=now()
       WHERE provider='exotel' AND (provider_call_sid=$1 OR id::text=$5)
         AND (provider_call_sid IS DISTINCT FROM $1 OR provider_status IS DISTINCT FROM $2
              OR ($4::text IS NOT NULL AND recording_url IS DISTINCT FROM $4))
       RETURNING id, caller_id, contact_id`,
      [callSid, status, Number.isFinite(duration) && duration! >= 0 ? Math.trunc(duration!) : null, recordingUrl, customField]
    );
    if (rows[0]) {
      await logActivity({
        userId: String(rows[0].caller_id),
        eventType: 'call.updated',
        entityType: 'contact',
        entityId: String(rows[0].contact_id),
        summary: `Exotel call ${status}`,
        payload: { callLogId: String(rows[0].id), callSid, status, hasRecording: Boolean(recordingUrl) },
      });
    }
    res.status(200).json({ ok: true });
  });

  // Complete simulated / live active call
  app.post('/api/exotel/calls/:id/complete', requireAuth, requireCallerOrAdmin, requireCsrf, async (req, res) => {
    const callLogId = req.params.id;
    const durationSeconds = Math.max(1, Math.round(Number(req.body?.durationSeconds ?? 45)));
    const outcome = String(req.body?.outcome ?? 'Interested');
    const notes = String(req.body?.notes ?? '');
    const nextFollowUpAt = req.body?.nextFollowUpAt ? String(req.body.nextFollowUpAt) : null;

    const { rows } = await pool.query(
      `UPDATE call_logs SET
         provider_status='completed',
         outcome=$1,
         duration_seconds=$2,
         notes=CASE WHEN $3 <> '' THEN $3 ELSE notes END,
         next_follow_up_at=$4,
         recording_url=COALESCE(recording_url, 'simulated_recording'),
         updated_at=now()
       WHERE id=$5 RETURNING id, company_id, contact_id, caller_id`,
      [outcome, durationSeconds, notes, nextFollowUpAt, callLogId]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Call log not found' });
      return;
    }
    const callLog = rows[0];
    const contactId = callLog.contact_id;
    if (contactId) {
      await pool.query(
        `UPDATE contacts SET contact_status=$1, last_contacted=(now() AT TIME ZONE 'Asia/Kolkata')::date,
           next_follow_up=$2, updated_at=now() WHERE id=$3`,
        [outcome, nextFollowUpAt, contactId]
      );
      const settings = await getAppSettings();
      const { rows: contactRows } = await pool.query(
        `SELECT ct.*, co.stage AS company_stage, co.company_name FROM contacts ct LEFT JOIN companies co ON co.id=ct.company_id WHERE ct.id=$1`,
        [contactId]
      );
      const ct = contactRows[0];
      if (ct && (ct.champion || settings.stageAutoMoveScope === 'any_contact') && ct.company_id) {
        const target = resolveAutoMoveStage(
          String(ct.company_stage), outcome, settings.stages, settings.championStatusToStage
        );
        if (target) {
          await pool.query('UPDATE companies SET stage=$1, updated_at=now() WHERE id=$2', [target, ct.company_id]);
          await logActivity({
            userId: req.user!.sub,
            sessionId: req.user!.sid,
            eventType: 'company.stage_changed',
            entityType: 'company',
            entityId: String(ct.company_id),
            summary: `Stage moved to ${target} (${ct.company_name}) after Exotel call`,
            payload: { from: ct.company_stage, to: target, name: ct.company_name, source: 'exotel_call', contactId, contactStatus: outcome },
          });
        }
      }
    }

    await logActivity({
      userId: req.user!.sub,
      sessionId: req.user!.sid,
      eventType: 'call.completed',
      entityType: 'contact',
      entityId: String(rows[0].contact_id),
      summary: `Exotel call completed with outcome: ${outcome} (${durationSeconds}s)`,
      payload: { callLogId, durationSeconds, outcome, nextFollowUpAt, hasRecording: true },
    });
    res.json({ ok: true, callLogId, outcome, nextFollowUpAt });
  });

  app.get('/api/exotel/call-logs/:id/recording', requireAuth, requireCallerOrAdmin, async (req: Request, res) => {
    const { rows } = await pool.query(
      `SELECT cl.recording_url, cl.provider_call_sid, cl.company_id
       FROM call_logs cl WHERE cl.id=$1 AND cl.provider='exotel'`, [req.params.id]
    );
    const row = rows[0];
    if (!row || !(await canAccessCompany(pool, req.user!, String(row.company_id)))) {
      res.status(404).json({ error: 'Recording not found.' });
      return;
    }
    let recordingUrl = row.recording_url as string | null;

    // Stream simulated demo audio recording if in POC mode
    if (recordingUrl === 'simulated_recording' || (recordingUrl && !recordingUrl.startsWith('https://'))) {
      const fs = await import('node:fs');
      const { resolve } = await import('node:path');
      const wavPath = resolve(process.cwd(), 'public/demo-call-recording.wav');
      if (fs.existsSync(wavPath)) {
        res.status(200);
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Cache-Control', 'private, no-store');
        fs.createReadStream(wavPath).pipe(res);
        return;
      }
      res.redirect('/demo-call-recording.wav');
      return;
    }

    if (!recordingUrl && row.provider_call_sid && exotelReady()) {
      const credentials = Buffer.from(`${config.exotel.apiKey}:${config.exotel.apiToken}`).toString('base64');
      const endpoint = `https://${config.exotel.apiHost}/v1/Accounts/${encodeURIComponent(config.exotel.accountSid!)}/Calls/${encodeURIComponent(String(row.provider_call_sid))}.json?details=true`;
      const response = await fetch(endpoint, { headers: { Authorization: `Basic ${credentials}` }, signal: AbortSignal.timeout(15000) });
      const payload = await response.json().catch(() => ({})) as { Call?: { RecordingUrl?: string } };
      if (response.ok && payload.Call?.RecordingUrl?.startsWith('https://')) {
        recordingUrl = payload.Call.RecordingUrl;
        await pool.query('UPDATE call_logs SET recording_url=$1, updated_at=now() WHERE id=$2', [recordingUrl, req.params.id]);
      }
    }
    if (!recordingUrl) {
      res.status(404).json({ error: 'Recording is not available yet.' });
      return;
    }
    let recording: URL;
    try {
      recording = new URL(recordingUrl);
    } catch {
      res.status(404).json({ error: 'Recording not found.' });
      return;
    }
    if (recording.protocol !== 'https:' || !(recording.hostname === 'amazonaws.com' || recording.hostname.endsWith('.amazonaws.com'))) {
      res.status(502).json({ error: 'The recording host is not recognized.' });
      return;
    }
    const upstream = await fetch(recording, { signal: AbortSignal.timeout(30000) });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: 'Exotel could not provide this recording.' });
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res);
  });
}
