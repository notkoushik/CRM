import type { Express, Request } from 'express';
import type { Pool } from 'pg';
import { requireAuth, requireCallerOrAdmin, requireCsrf } from './auth.js';
import { canAccessCompany } from './access.js';
import { logActivity } from './activity.js';
import { getAppSettings, isAllowedContactStatus } from './settings.js';
import { resolveAutoMoveStage } from '../src/lib/championSync.js';

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function accessible(req: Request, assignedTo: unknown) {
  return req.user!.role === 'admin' || req.user!.role === 'founder' ||
    (req.user!.role === 'sdr' && String(assignedTo ?? '') === req.user!.sub);
}

export function registerCallLogRoutes(app: Express, pool: Pool) {
  app.get('/api/call-logs', requireAuth, requireCallerOrAdmin, async (req, res) => {
    const rawContactId = req.query.contactId;
    const contactId = typeof rawContactId === 'string' && rawContactId.trim() ? rawContactId.trim() : null;
    if (contactId && !/^[0-9a-f-]{36}$/i.test(contactId)) {
      res.status(400).json({ error: 'A valid contactId is required.' });
      return;
    }

    if (contactId) {
      const contact = await pool.query(
        `SELECT ct.id, co.assigned_to FROM contacts ct LEFT JOIN companies co ON co.id=ct.company_id WHERE ct.id=$1`, [contactId]
      );
      if (!contact.rows[0] || !accessible(req, contact.rows[0].assigned_to)) {
        res.status(404).json({ error: 'Call history not found.' });
        return;
      }
      const { rows } = await pool.query(
        `SELECT cl.*, u.name AS caller_name, co.assigned_to, co.company_name, ct.contact_name, ct.phone AS contact_phone
         FROM call_logs cl
         JOIN users u ON u.id=cl.caller_id
         JOIN companies co ON co.id=cl.company_id
         LEFT JOIN contacts ct ON ct.id=cl.contact_id
         WHERE cl.contact_id=$1
         ORDER BY cl.occurred_at DESC, cl.created_at DESC`, [contactId]
      );
      res.json({
        callLogs: rows.map((r) => ({
          id: String(r.id),
          leadId: String(r.company_id),
          companyName: String(r.company_name ?? ''),
          contactId: String(r.contact_id),
          contactName: String(r.contact_name ?? ''),
          contactPhone: String(r.contact_phone ?? ''),
          callerId: String(r.caller_id),
          callerName: String(r.caller_name),
          occurredAt: new Date(String(r.occurred_at)).toISOString(),
          durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
          outcome: String(r.outcome),
          notes: String(r.notes ?? ''),
          nextFollowUpAt: r.next_follow_up_at == null ? null : String(r.next_follow_up_at).slice(0, 10),
          provider: String(r.provider ?? 'manual'),
          providerStatus: r.provider_status == null ? null : String(r.provider_status),
          providerCallSid: r.provider_call_sid == null ? null : String(r.provider_call_sid),
          hasRecording: Boolean(r.recording_url),
        })),
      });
      return;
    }

    // Recent calls feed (for Call Desk & Admin Activity)
    const isElevated = req.user!.role === 'admin' || req.user!.role === 'founder';
    const filterUserId = isElevated && typeof req.query.userId === 'string' && req.query.userId !== 'all' && /^[0-9a-f-]{36}$/i.test(req.query.userId) ? req.query.userId : null;
    const filterFrom = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
    const filterTo = typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : null;
    const filterQ = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().toLowerCase() : null;

    const params: unknown[] = [];
    const conditions: string[] = [];

    if (!isElevated) {
      params.push(req.user!.sub);
      conditions.push(`(co.assigned_to = $${params.length} OR cl.caller_id = $${params.length})`);
    } else if (filterUserId) {
      params.push(filterUserId);
      conditions.push(`cl.caller_id = $${params.length}`);
    }

    if (filterFrom) {
      params.push(filterFrom);
      conditions.push(`(cl.occurred_at AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}::date`);
    }

    if (filterTo) {
      params.push(filterTo);
      conditions.push(`(cl.occurred_at AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}::date`);
    }

    if (filterQ) {
      params.push(`%${filterQ}%`);
      conditions.push(`(LOWER(co.company_name) LIKE $${params.length} OR LOWER(COALESCE(ct.contact_name,'')) LIKE $${params.length} OR LOWER(COALESCE(ct.phone,'')) LIKE $${params.length} OR LOWER(COALESCE(cl.notes,'')) LIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT cl.*, u.name AS caller_name, co.assigned_to, co.company_name, ct.contact_name, ct.phone AS contact_phone
       FROM call_logs cl
       JOIN users u ON u.id=cl.caller_id
       JOIN companies co ON co.id=cl.company_id
       LEFT JOIN contacts ct ON ct.id=cl.contact_id
       ${whereClause}
       ORDER BY cl.occurred_at DESC, cl.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({
      callLogs: rows.map((r) => ({
        id: String(r.id),
        leadId: String(r.company_id),
        companyName: String(r.company_name ?? ''),
        contactId: String(r.contact_id),
        contactName: String(r.contact_name ?? ''),
        contactPhone: String(r.contact_phone ?? ''),
        callerId: String(r.caller_id),
        callerName: String(r.caller_name),
        occurredAt: new Date(String(r.occurred_at)).toISOString(),
        durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
        outcome: String(r.outcome),
        notes: String(r.notes ?? ''),
        nextFollowUpAt: r.next_follow_up_at == null ? null : String(r.next_follow_up_at).slice(0, 10),
        provider: String(r.provider ?? 'manual'),
        providerStatus: r.provider_status == null ? null : String(r.provider_status),
        providerCallSid: r.provider_call_sid == null ? null : String(r.provider_call_sid),
        hasRecording: Boolean(r.recording_url),
      })),
    });
  });

  app.patch('/api/call-logs/:id', requireAuth, requireCallerOrAdmin, requireCsrf, async (req, res) => {
    const id = String(req.params.id ?? '');
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 8000) : null;
    if (!/^[0-9a-f-]{36}$/i.test(id) || notes === null) {
      res.status(400).json({ error: 'A valid call id and notes are required.' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT cl.id, cl.contact_id, cl.company_id
       FROM call_logs cl JOIN companies co ON co.id=cl.company_id WHERE cl.id=$1`, [id]
    );
    const call = rows[0];
    if (!call || !(await canAccessCompany(pool, req.user!, String(call.company_id)))) {
      res.status(404).json({ error: 'Call history not found.' });
      return;
    }
    await pool.query('UPDATE call_logs SET notes=$1, updated_at=now() WHERE id=$2', [notes, id]);
    await logActivity({
      userId: req.user!.sub,
      sessionId: req.user!.sid,
      eventType: 'call.notes_updated',
      entityType: 'contact',
      entityId: String(call.contact_id),
      summary: 'Updated call notes',
      payload: { callLogId: id, companyId: String(call.company_id) },
    });
    res.json({ ok: true });
  });

  app.post('/api/call-logs', requireAuth, requireCallerOrAdmin, requireCsrf, async (req, res) => {
    const contactId = String(req.body?.contactId ?? '');
    const outcome = String(req.body?.outcome ?? '').trim();
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 8000) : '';
    const durationRaw = req.body?.durationSeconds;
    const duration = durationRaw == null || durationRaw === '' ? null : Number(durationRaw);
    const followUp = req.body?.nextFollowUpAt == null || req.body.nextFollowUpAt === ''
      ? null
      : req.body.nextFollowUpAt;
    if (!/^[0-9a-f-]{36}$/i.test(contactId) || !outcome ||
      (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 86400)) ||
      (followUp !== null && !validDate(followUp))) {
      res.status(400).json({ error: 'Contact, outcome, duration, or follow-up date is invalid.' });
      return;
    }
    const { rows: contacts } = await pool.query(
      `SELECT ct.*, co.stage AS company_stage, co.company_name, co.assigned_to
       FROM contacts ct LEFT JOIN companies co ON co.id=ct.company_id WHERE ct.id=$1`, [contactId]
    );
    const contact = contacts[0];
    if (!contact || !contact.company_id || !(await canAccessCompany(pool, req.user!, String(contact.company_id)))) {
      res.status(404).json({ error: 'Contact not found.' });
      return;
    }
    const settings = await getAppSettings();
    if (!isAllowedContactStatus(settings, outcome)) {
      res.status(400).json({ error: `Invalid call outcome. Allowed: ${settings.contactStatuses.join(', ')}.` });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO call_logs (
           company_id, contact_id, caller_id, duration_seconds, outcome, notes, next_follow_up_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, occurred_at`,
        [contact.company_id, contactId, req.user!.sub, duration, outcome, notes, followUp]
      );
      const call = rows[0];
      await client.query(
        `UPDATE contacts SET contact_status=$1, last_contacted=(now() AT TIME ZONE 'Asia/Kolkata')::date,
           next_follow_up=$2, updated_at=now() WHERE id=$3`,
        [outcome, followUp, contactId]
      );
      const name = String(contact.contact_name);
      if (outcome !== contact.contact_status) {
        await logActivity({
          userId: req.user!.sub, sessionId: req.user!.sid,
          eventType: 'contact.status_changed', entityType: 'contact', entityId: contactId,
          summary: `Call outcome: ${outcome} (${name})`,
          payload: { from: contact.contact_status, to: outcome, name },
        }, client);
      }
      const previousFollowUp = contact.next_follow_up ? String(contact.next_follow_up).slice(0, 10) : null;
      if (String(previousFollowUp ?? '') !== String(followUp ?? '')) {
        await logActivity({
          userId: req.user!.sub, sessionId: req.user!.sid,
          eventType: 'contact.follow_up_set', entityType: 'contact', entityId: contactId,
          summary: `Follow-up set (${name})`,
          payload: { from: previousFollowUp, to: followUp, nextFollowUp: followUp, name },
        }, client);
      }
      if ((contact.champion || settings.stageAutoMoveScope === 'any_contact') && contact.company_id) {
        const target = resolveAutoMoveStage(
          String(contact.company_stage), outcome, settings.stages, settings.championStatusToStage
        );
        if (target) {
          await client.query('UPDATE companies SET stage=$1, updated_at=now() WHERE id=$2', [target, contact.company_id]);
          await logActivity({
            userId: req.user!.sub, sessionId: req.user!.sid,
            eventType: 'company.stage_changed', entityType: 'company', entityId: String(contact.company_id),
            summary: `Stage moved to ${target} (${contact.company_name}) after call outcome`,
            payload: { from: contact.company_stage, to: target, name: contact.company_name, source: 'champion_contact', contactId, contactName: name, contactStatus: outcome },
          }, client);
        }
      }
      await logActivity({
        userId: req.user!.sub, sessionId: req.user!.sid,
        eventType: 'call.logged', entityType: 'contact', entityId: contactId,
        summary: `Call logged: ${outcome} (${name})`,
        payload: { name, outcome, notes, durationSeconds: duration, nextFollowUpAt: followUp, leadId: String(contact.company_id), callLogId: String(call.id) },
      }, client);
      await client.query('COMMIT');
      res.status(201).json({
        callLog: {
          id: String(call.id), leadId: String(contact.company_id), contactId,
          callerId: req.user!.sub, callerName: req.user!.name,
          occurredAt: new Date(String(call.occurred_at)).toISOString(),
          durationSeconds: duration, outcome, notes, nextFollowUpAt: followUp,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}
