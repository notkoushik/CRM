import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import express, { type Express, type Request } from 'express';
import type { Pool, PoolClient } from 'pg';
import { isAdminRole, requireAdmin, requireAuth, requireCallerOrAdmin, requireCsrf } from './auth.js';
import { canAccessCompany } from './access.js';
import { config } from './config.js';
import { logActivity } from './activity.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOC_TYPES = new Set([
  'quotation',
  'project_brief',
  'client_reference',
  'technical',
  'deliverable',
  'other',
]);
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const PROJECT_SELECT = `
  SELECT p.*, co.company_name, co.stage AS lead_stage,
         ct.contact_name, ct.phone AS client_phone, ct.email AS client_email,
         d.name AS developer_name, h.expected_budget, h.submitted_by,
         caller.name AS caller_name, caller.id AS caller_id
  FROM projects p
  JOIN companies co ON co.id = p.company_id
  LEFT JOIN LATERAL (
    SELECT contact_name, phone, email
    FROM contacts
    WHERE company_id = co.id
    ORDER BY champion DESC, created_at ASC
    LIMIT 1
  ) ct ON TRUE
  LEFT JOIN users d ON d.id = p.assigned_developer_id
  LEFT JOIN project_handoffs h ON h.id = p.handoff_id
  LEFT JOIN users caller ON caller.id = COALESCE(h.submitted_by, co.assigned_to, p.created_by)
`;
const HANDOFF_SELECT = `
  SELECT h.*, co.company_name, co.stage AS lead_stage,
         ct.contact_name, ct.phone AS client_phone, ct.email AS client_email,
         submitter.name AS submitter_name, p.id AS project_id
  FROM project_handoffs h
  JOIN companies co ON co.id = h.company_id
  LEFT JOIN LATERAL (
    SELECT contact_name, phone, email
    FROM contacts
    WHERE company_id = co.id
    ORDER BY champion DESC, created_at ASC
    LIMIT 1
  ) ct ON TRUE
  JOIN users submitter ON submitter.id = h.submitted_by
  LEFT JOIN projects p ON p.handoff_id = h.id
`;

function text(value: unknown, max = 8000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function projectDto(row: Record<string, unknown>, role: string) {
  const result: Record<string, unknown> = {
    id: String(row.id),
    handoffId: row.handoff_id ? String(row.handoff_id) : null,
    leadId: String(row.company_id),
    clientBusiness: String(row.company_name ?? ''),
    leadStage: String(row.lead_stage ?? ''),
    clientContact: String(row.contact_name ?? ''),
    clientPhone: String(row.client_phone ?? ''),
    clientEmail: String(row.client_email ?? ''),
    title: String(row.project_title),
    projectType: String(row.project_type),
    description: String(row.description ?? ''),
    functionalRequirements: String(row.functional_requirements ?? ''),
    preferredTechnology: String(row.preferred_technology ?? ''),
    expectedTimeline: String(row.expected_timeline ?? ''),
    status: String(row.status),
    developerId: row.assigned_developer_id ? String(row.assigned_developer_id) : null,
    developerName: String(row.developer_name ?? ''),
    callerId: row.caller_id ? String(row.caller_id) : null,
    callerName: String(row.caller_name ?? 'A caller'),
    githubRepoUrl: String(row.github_repo_url ?? ''),
    liveUrl: String(row.live_url ?? ''),
    databaseEngine: String(row.database_engine ?? ''),
    techStack: String(row.tech_stack ?? ''),
    architectureNotes: String(row.architecture_notes ?? ''),
    developmentMilestone: String(row.development_milestone ?? 'planning'),
    repoMetadata: typeof row.repo_metadata === 'object' && row.repo_metadata !== null ? row.repo_metadata : {},
    serviceTopology: typeof row.service_topology === 'object' && row.service_topology !== null ? row.service_topology : {},
    rfcSpec: typeof row.rfc_spec === 'object' && row.rfc_spec !== null ? row.rfc_spec : {},
    dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
  if (isAdminRole(role) || role === 'sdr') result.expectedBudget = String(row.expected_budget ?? '');
  return result;
}

function handoffDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    leadId: String(row.company_id),
    clientBusiness: String(row.company_name ?? ''),
    leadStage: String(row.lead_stage ?? ''),
    clientContact: String(row.contact_name ?? ''),
    clientPhone: String(row.client_phone ?? ''),
    clientEmail: String(row.client_email ?? ''),
    submittedBy: String(row.submitted_by),
    submitterName: String(row.submitter_name),
    title: String(row.project_title),
    projectType: String(row.project_type),
    description: String(row.description ?? ''),
    functionalRequirements: String(row.functional_requirements ?? ''),
    preferredTechnology: String(row.preferred_technology ?? ''),
    expectedBudget: String(row.expected_budget ?? ''),
    expectedTimeline: String(row.expected_timeline ?? ''),
    additionalComments: String(row.additional_comments ?? ''),
    status: String(row.status),
    decisionReason: String(row.decision_reason ?? ''),
    projectId: row.project_id ? String(row.project_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function loadProject(pool: Pick<Pool, 'query'>, id: string) {
  const { rows } = await pool.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] as Record<string, unknown> | undefined;
}

async function canAccessProject(pool: Pick<Pool, 'query'>, user: NonNullable<Request['user']>, id: string) {
  if (isAdminRole(user.role)) return true;
  const { rows } = await pool.query(
    `SELECT p.assigned_developer_id, co.assigned_to, h.submitted_by
     FROM projects p
     JOIN companies co ON co.id = p.company_id
     LEFT JOIN project_handoffs h ON h.id = p.handoff_id
     WHERE p.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return false;
  if (user.role === 'developer') return Boolean(row.assigned_developer_id) && String(row.assigned_developer_id) === user.sub;
  return user.role === 'sdr' &&
    (String(row.assigned_to ?? '') === user.sub || String(row.submitted_by ?? '') === user.sub);
}

async function canAccessHandoff(pool: Pick<Pool, 'query'>, user: NonNullable<Request['user']>, id: string) {
  if (isAdminRole(user.role)) return true;
  if (user.role !== 'sdr') return false;
  const { rows } = await pool.query(
    `SELECT h.submitted_by, co.assigned_to
     FROM project_handoffs h JOIN companies co ON co.id = h.company_id WHERE h.id = $1`,
    [id]
  );
  return !!rows[0] &&
    (String(rows[0].submitted_by) === user.sub || String(rows[0].assigned_to ?? '') === user.sub);
}

async function validDeveloper(pool: Pick<Pool, 'query'>, developerId: string) {
  const { rows } = await pool.query("SELECT id FROM users WHERE id = $1 AND role = 'developer'", [developerId]);
  return rows.length > 0;
}

async function logWorkflow(
  executor: Pool | PoolClient,
  userId: string,
  sessionId: string | undefined,
  eventType: string,
  summary: string,
  entityId: string,
  payload: Record<string, unknown> = {}
) {
  await logActivity({
    userId,
    sessionId,
    eventType,
    entityType: 'system',
    entityId,
    summary,
    payload,
  }, executor);
}

async function listDocuments(pool: Pick<Pool, 'query'>, user: NonNullable<Request['user']>, parent: 'project' | 'handoff' | 'lead', id: string) {
  const values: unknown[] = [id];
  let scope = '';
  if (user.role === 'developer') {
    if (parent !== 'project') return null;
    values.push(user.sub);
    scope = `AND p.assigned_developer_id = $2`;
  } else if (!isAdminRole(user.role)) {
    if (user.role !== 'sdr') return null;
    values.push(user.sub);
    scope = `AND (co.assigned_to = $2 OR h.submitted_by = $2 OR d.uploaded_by = $2)`;
  }
  let parentWhere = '';
  if (parent === 'project') {
    parentWhere = '(d.project_id = $1 OR d.handoff_id = (SELECT p2.handoff_id FROM projects p2 WHERE p2.id = $1) OR d.company_id = (SELECT p3.company_id FROM projects p3 WHERE p3.id = $1))';
  } else if (parent === 'handoff') {
    parentWhere = '(d.handoff_id = $1 OR d.company_id = (SELECT h2.company_id FROM project_handoffs h2 WHERE h2.id = $1))';
  } else {
    parentWhere = '(d.company_id = $1 OR d.handoff_id IN (SELECT h3.id FROM project_handoffs h3 WHERE h3.company_id = $1) OR d.project_id IN (SELECT p4.id FROM projects p4 WHERE p4.company_id = $1))';
  }
  const { rows } = await pool.query(
    `SELECT DISTINCT d.id, d.document_type, d.original_filename, d.content_type,
            d.size_bytes, d.developer_visible, d.uploaded_at, d.created_at, d.uploaded_by
     FROM project_documents d
     LEFT JOIN project_handoffs h ON h.id = d.handoff_id OR h.id = (SELECT p2.handoff_id FROM projects p2 WHERE p2.id = d.project_id)
     LEFT JOIN projects p ON p.id = CASE WHEN d.project_id IS NULL THEN (SELECT p2.id FROM projects p2 WHERE p2.handoff_id = h.id) ELSE d.project_id END
     LEFT JOIN companies co ON co.id = COALESCE(d.company_id, p.company_id, h.company_id)
     WHERE ${parentWhere}
       AND d.deleted_at IS NULL AND d.uploaded_at IS NOT NULL ${scope}
     ORDER BY d.created_at DESC`,
    values
  );
  return rows.map((r) => ({
    id: String(r.id),
    type: String(r.document_type),
    filename: String(r.original_filename),
    contentType: String(r.content_type),
    sizeBytes: Number(r.size_bytes),
    developerVisible: Boolean(r.developer_visible),
    uploadedAt: new Date(String(r.uploaded_at)).toISOString(),
    uploadedBy: String(r.uploaded_by),
  }));
}

export function registerProjectRoutes(app: Express, pool: Pool) {
  app.get('/api/handoffs', requireAuth, async (req, res) => {
    if (!isAdminRole(req.user!.role) && req.user!.role !== 'sdr') {
      res.status(403).json({ error: 'Caller or Admin access required.' });
      return;
    }
    const values: string[] = [];
    const scope = isAdminRole(req.user!.role) ? '' : (
      values.push(req.user!.sub),
      'WHERE (h.submitted_by = $1 OR co.assigned_to = $1)'
    );
    const { rows } = await pool.query(
      `${HANDOFF_SELECT} ${scope} ORDER BY h.created_at DESC`,
      values
    );
    res.json({ handoffs: rows.map(handoffDto) });
  });

  app.get('/api/handoffs/:id', requireAuth, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessHandoff(pool, req.user!, id))) {
      res.status(404).json({ error: 'Handoff not found.' });
      return;
    }
    const { rows } = await pool.query(`${HANDOFF_SELECT} WHERE h.id = $1`, [id]);
    res.json({ handoff: handoffDto(rows[0]) });
  });

  app.post('/api/handoffs', requireAuth, requireCallerOrAdmin, requireCsrf, async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const leadId = String(body.leadId ?? '');
    const title = text(body.title, 240);
    if (!validId(leadId) || !title) {
      res.status(400).json({ error: 'A valid lead and project title are required.' });
      return;
    }
    if (!(await canAccessCompany(pool, req.user!, leadId))) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO project_handoffs (
         company_id, submitted_by, project_title, project_type, description,
         functional_requirements, preferred_technology, expected_budget,
         expected_timeline, additional_comments
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        leadId,
        req.user!.sub,
        title,
        text(body.projectType, 120) || 'Other',
        text(body.description),
        text(body.functionalRequirements),
        text(body.preferredTechnology, 2000),
        text(body.expectedBudget, 300),
        text(body.expectedTimeline, 300),
        text(body.additionalComments),
      ]
    );
    const id = String(rows[0].id);
    await pool.query(
      "UPDATE companies SET stage = 'Handoff Submitted', updated_at = now() WHERE id = $1 AND stage <> 'Handoff Submitted'",
      [leadId]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'handoff.submitted', 'Project handoff submitted', id, { leadId });
    const { rows: full } = await pool.query(`${HANDOFF_SELECT} WHERE h.id = $1`, [id]);
    res.status(201).json({ handoff: handoffDto(full[0]) });
  });

  app.patch('/api/handoffs/:id', requireAuth, requireCallerOrAdmin, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessHandoff(pool, req.user!, id))) {
      res.status(404).json({ error: 'Handoff not found.' });
      return;
    }
    const { rows } = await pool.query('SELECT status, submitted_by FROM project_handoffs WHERE id = $1', [id]);
    if (req.user!.role === 'sdr' && String(rows[0]?.submitted_by ?? '') !== req.user!.sub) {
      res.status(404).json({ error: 'Handoff not found.' });
      return;
    }
    if (rows[0]?.status !== 'needs_clarification') {
      res.status(409).json({ error: 'Only handoffs returned for clarification can be edited.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const title = text(b.title, 240);
    if (!title) {
      res.status(400).json({ error: 'Project title is required.' });
      return;
    }
    await pool.query(
      `UPDATE project_handoffs SET project_title=$1, project_type=$2, description=$3,
         functional_requirements=$4, preferred_technology=$5, expected_budget=$6,
         expected_timeline=$7, additional_comments=$8, status='submitted',
         decision_reason=NULL, reviewed_by=NULL, reviewed_at=NULL, updated_at=now()
       WHERE id=$9`,
      [title, text(b.projectType, 120) || 'Other', text(b.description), text(b.functionalRequirements),
        text(b.preferredTechnology, 2000), text(b.expectedBudget, 300), text(b.expectedTimeline, 300),
        text(b.additionalComments), id]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'handoff.resubmitted', 'Project handoff updated and resubmitted', id);
    const { rows: full } = await pool.query(`${HANDOFF_SELECT} WHERE h.id = $1`, [id]);
    res.json({ handoff: handoffDto(full[0]) });
  });

  app.patch('/api/handoffs/:id/review', requireAuth, requireAdmin, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const b = req.body as Record<string, unknown>;
    const decision = text(b.decision, 40);
    const reason = text(b.reason, 4000);
    if (!validId(id) || !['approve', 'reject', 'needs_clarification'].includes(decision)) {
      res.status(400).json({ error: 'A valid handoff decision is required.' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT * FROM project_handoffs WHERE id=$1 FOR UPDATE', [id]);
      const h = rows[0];
      if (!h || !['submitted', 'needs_clarification'].includes(String(h.status))) {
        await client.query('ROLLBACK');
        res.status(h ? 409 : 404).json({ error: h ? 'Handoff is no longer reviewable.' : 'Handoff not found.' });
        return;
      }
      if (decision !== 'approve') {
        if (!reason) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: 'Add a reason for this decision.' });
          return;
        }
        const status = decision === 'reject' ? 'rejected' : 'needs_clarification';
        await client.query(
          `UPDATE project_handoffs SET status=$1, decision_reason=$2, reviewed_by=$3,
             reviewed_at=now(), updated_at=now() WHERE id=$4`,
          [status, reason, req.user!.sub, id]
        );
        await logWorkflow(client, req.user!.sub, req.user!.sid, `handoff.${status}`, `Handoff ${status.replace('_', ' ')}`, id, { reason });
        await client.query('COMMIT');
        res.json({ status });
        return;
      }
      const developerId = String(b.developerId ?? '');
      if (!validId(developerId) || !(await validDeveloper(client, developerId))) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Choose an active Developer to assign this project.' });
        return;
      }
      const { rows: projectRows } = await client.query(
        `INSERT INTO projects (
           handoff_id, company_id, created_by, assigned_developer_id, project_title,
           project_type, description, functional_requirements, preferred_technology, expected_timeline, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'assigned') RETURNING id`,
        [id, h.company_id, req.user!.sub, developerId, h.project_title, h.project_type,
          h.description, h.functional_requirements, h.preferred_technology, h.expected_timeline]
      );
      const projectId = String(projectRows[0].id);
      await client.query(
        `UPDATE project_handoffs SET status='converted', decision_reason=NULL,
           reviewed_by=$1, reviewed_at=now(), updated_at=now() WHERE id=$2`,
        [req.user!.sub, id]
      );
      await client.query(
        `UPDATE project_documents SET project_id=$1, handoff_id=NULL
         WHERE handoff_id=$2 AND document_type <> 'quotation'`,
        [projectId, id]
      );
      await client.query(
        `INSERT INTO project_updates (project_id, author_id, update_type, body)
         VALUES ($1,$2,'assignment','Project created from approved lead handoff.')`,
        [projectId, req.user!.sub]
      );
      await logWorkflow(client, req.user!.sub, req.user!.sid, 'handoff.converted', 'Handoff approved and assigned', id, { projectId, developerId });
      await client.query('COMMIT');
      const project = await loadProject(pool, projectId);
      res.json({ status: 'converted', project: project ? projectDto(project, req.user!.role) : null });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/api/projects', requireAuth, async (req, res) => {
    const role = req.user!.role;
    const values: string[] = [];
    let scope = '';
    if (role === 'developer') {
      values.push(req.user!.sub);
      scope = 'WHERE p.assigned_developer_id = $1';
    } else if (role === 'sdr') {
      values.push(req.user!.sub);
      scope = 'WHERE (co.assigned_to = $1 OR h.submitted_by = $1)';
    } else if (!isAdminRole(role)) {
      res.status(403).json({ error: 'Project access required.' });
      return;
    }
    const { rows } = await pool.query(`${PROJECT_SELECT} ${scope} ORDER BY p.updated_at DESC`, values);
    res.json({ projects: rows.map((r) => projectDto(r, role)) });
  });

  app.get('/api/projects/:id', requireAuth, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const row = await loadProject(pool, id);
    if (!row) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const [{ rows: updates }, { rows: evaluations }] = await Promise.all([
      pool.query(
        `SELECT pu.id, pu.author_id, u.name AS author_name, pu.update_type, pu.body,
                pu.progress_percent, pu.created_at
         FROM project_updates pu JOIN users u ON u.id=pu.author_id
         WHERE pu.project_id=$1 ORDER BY pu.created_at DESC`, [id]),
      pool.query(
        `SELECT pe.id, pe.developer_id, u.name AS developer_name, pe.feasibility,
                pe.suggested_technology, pe.database_engine, pe.github_repo_url, pe.live_url,
                pe.tech_stack, pe.estimated_effort, pe.technical_requirements,
                pe.clarification_questions, pe.notes, pe.review_status, pe.review_reason,
                pe.created_at
         FROM project_evaluations pe JOIN users u ON u.id=pe.developer_id
         WHERE pe.project_id=$1 ORDER BY pe.created_at DESC`, [id]),
    ]);
    res.json({
      project: projectDto(row, req.user!.role),
      updates: updates.map((u) => ({
        id: String(u.id), authorId: String(u.author_id), authorName: String(u.author_name),
        type: String(u.update_type), body: String(u.body), progressPercent: u.progress_percent,
        createdAt: new Date(String(u.created_at)).toISOString(),
      })),
      evaluations: evaluations.map((e) => ({
        id: String(e.id), developerId: String(e.developer_id), developerName: String(e.developer_name),
        feasibility: String(e.feasibility), suggestedTechnology: String(e.suggested_technology),
        databaseEngine: String(e.database_engine ?? ''),
        githubRepoUrl: String(e.github_repo_url ?? ''),
        liveUrl: String(e.live_url ?? ''),
        techStack: String(e.tech_stack ?? ''),
        estimatedEffort: String(e.estimated_effort), technicalRequirements: String(e.technical_requirements),
        clarificationQuestions: String(e.clarification_questions), notes: String(e.notes),
        reviewStatus: String(e.review_status), reviewReason: String(e.review_reason ?? ''),
        createdAt: new Date(String(e.created_at)).toISOString(),
      })),
    });
  });

  app.post('/api/projects', requireAuth, requireAdmin, requireCsrf, async (req, res) => {
    const b = req.body as Record<string, unknown>;
    const leadId = String(b.leadId ?? '');
    const developerId = String(b.developerId ?? '');
    const title = text(b.title, 240);
    const dueAt = b.dueAt ? new Date(String(b.dueAt)) : null;
    if (!validId(leadId) || !validId(developerId) || !title ||
      (dueAt != null && Number.isNaN(dueAt.getTime())) || !(await validDeveloper(pool, developerId))) {
      res.status(400).json({ error: 'Choose a lead, project title, and active Developer.' });
      return;
    }
    const { rows: leads } = await pool.query('SELECT id FROM companies WHERE id=$1', [leadId]);
    if (!leads[0]) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO projects (
         company_id, created_by, assigned_developer_id, project_title, project_type,
         description, functional_requirements, preferred_technology, expected_timeline, due_at, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'assigned') RETURNING id`,
      [leadId, req.user!.sub, developerId, title, text(b.projectType, 120) || 'Other',
        text(b.description), text(b.functionalRequirements), text(b.preferredTechnology, 2000),
        text(b.expectedTimeline, 300), dueAt]
    );
    const id = String(rows[0].id);
    await pool.query(
      `INSERT INTO project_updates (project_id, author_id, update_type, body)
       VALUES ($1,$2,'assignment','Project created and assigned by Admin.')`, [id, req.user!.sub]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.created', 'Project created and assigned', id, { leadId, developerId });
    const project = await loadProject(pool, id);
    res.status(201).json({ project: project ? projectDto(project, req.user!.role) : null });
  });

  app.patch('/api/projects/:id/assignment', requireAuth, requireAdmin, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const developerId = String(req.body?.developerId ?? '');
    if (!validId(id) || !validId(developerId) || !(await validDeveloper(pool, developerId))) {
      res.status(400).json({ error: 'Choose a valid Developer.' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE projects
         SET assigned_developer_id=$1,
             status = CASE WHEN status = 'awaiting_assignment' THEN 'assigned' ELSE status END,
             updated_at=now()
         WHERE id=$2
         RETURNING id, status`,
        [developerId, id]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      const { rows: devRows } = await client.query('SELECT name FROM users WHERE id = $1', [developerId]);
      const devName = devRows[0]?.name ? String(devRows[0].name) : 'Developer';
      await client.query(
        'INSERT INTO project_updates (project_id, author_id, update_type, body) VALUES ($1,$2,\'assignment\',$3)',
        [id, req.user!.sub, `Project assigned to Developer ${devName}.`]
      );
      await logWorkflow(client, req.user!.sub, req.user!.sid, 'project.reassigned', `Project assigned to Developer ${devName}`, id, { developerId, developerName: devName });
      await client.query('COMMIT');
      const project = await loadProject(pool, id);
      res.json({ ok: true, project: project ? projectDto(project, req.user!.role) : null });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch('/api/projects/:id/status', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const status = text(req.body?.status, 40);
    if (!validId(id) || !['awaiting_assignment', 'assigned', 'in_evaluation', 'awaiting_admin_review', 'clarification_required', 'approved', 'declined', 'in_progress', 'completed'].includes(status)) {
      res.status(400).json({ error: 'Choose a valid project status.' });
      return;
    }
    const row = await loadProject(pool, id);
    if (!row || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    if (req.user!.role === 'developer') {
      if (status !== 'in_evaluation' || String(row.status) !== 'assigned') {
        res.status(403).json({ error: 'Developers can only start evaluation on assigned projects.' });
        return;
      }
    } else if (!isAdminRole(req.user!.role)) {
      res.status(403).json({ error: 'Admin access required to change project status.' });
      return;
    }
    await pool.query(
      `UPDATE projects SET status=$1, updated_at=now(),
       started_at=CASE WHEN $1='in_progress' THEN COALESCE(started_at, now()) ELSE started_at END,
       completed_at=CASE WHEN $1='completed' THEN now() WHEN $1 <> 'completed' THEN NULL ELSE completed_at END
       WHERE id=$2`, [status, id]
    );
    await pool.query(
      `INSERT INTO project_updates (project_id, author_id, update_type, body)
       VALUES ($1,$2,'admin_decision',$3)`, [id, req.user!.sub, `Project status changed to ${status.replaceAll('_', ' ')}.`]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.status_changed', `Project status changed to ${status}`, id, { status });
    res.json({ ok: true, status });
  });

  app.post('/api/projects/:id/updates', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const body = text(req.body?.body, 8000);
    const progress = req.body?.progressPercent == null ? null : Number(req.body.progressPercent);
    const type = text(req.body?.type, 40) || 'progress';
    if (!validId(id) || !body || (progress !== null && (!Number.isInteger(progress) || progress < 0 || progress > 100)) || !['progress', 'clarification'].includes(type)) {
      res.status(400).json({ error: 'Enter an update and a progress value from 0 to 100.' });
      return;
    }
    if (!(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO project_updates (project_id, author_id, update_type, body, progress_percent)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`, [id, req.user!.sub, type, body, progress]
    );
    await pool.query('UPDATE projects SET updated_at=now() WHERE id=$1', [id]);
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.update_added', 'Project update added', id, { updateId: rows[0].id, type });
    res.status(201).json({ id: String(rows[0].id), createdAt: new Date(String(rows[0].created_at)).toISOString() });
  });

  app.post('/api/projects/:id/evaluations', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const b = req.body as Record<string, unknown>;
    const feasibility = text(b.feasibility, 40);
    if (!validId(id) || !['feasible', 'not_feasible', 'needs_clarification'].includes(feasibility)) {
      res.status(400).json({ error: 'Choose a technical feasibility decision.' });
      return;
    }
    const project = await loadProject(pool, id);
    if (!project || req.user!.role !== 'developer' || String(project.assigned_developer_id) !== req.user!.sub) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    if (!['assigned', 'in_evaluation', 'clarification_required'].includes(String(project.status))) {
      res.status(409).json({ error: 'This project is not accepting a technical evaluation.' });
      return;
    }
    const databaseEngine = text(b.databaseEngine, 100);
    const githubRepoUrl = text(b.githubRepoUrl, 500);
    const liveUrl = text(b.liveUrl, 500);
    const techStack = text(b.techStack, 2000);
    const suggestedTechnology = text(b.suggestedTechnology, 2000);
    const estimatedEffort = text(b.estimatedEffort, 500);
    const technicalRequirements = text(b.technicalRequirements);
    const clarificationQuestions = text(b.clarificationQuestions);
    const notes = text(b.notes);

    const { rows } = await pool.query(
      `INSERT INTO project_evaluations (
         project_id, developer_id, feasibility, suggested_technology, estimated_effort,
         technical_requirements, clarification_questions, notes,
         database_engine, github_repo_url, live_url, tech_stack
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [id, req.user!.sub, feasibility, suggestedTechnology, estimatedEffort,
        technicalRequirements, clarificationQuestions, notes,
        databaseEngine, githubRepoUrl, liveUrl, techStack]
    );
    await pool.query(
      `UPDATE projects SET
         status = 'awaiting_admin_review',
         database_engine = CASE WHEN $2 <> '' THEN $2 ELSE database_engine END,
         github_repo_url = CASE WHEN $3 <> '' THEN $3 ELSE github_repo_url END,
         live_url = CASE WHEN $4 <> '' THEN $4 ELSE live_url END,
         tech_stack = CASE WHEN $5 <> '' THEN $5 ELSE tech_stack END,
         preferred_technology = CASE WHEN $6 <> '' THEN $6 ELSE preferred_technology END,
         updated_at = now()
       WHERE id = $1`,
      [id, databaseEngine, githubRepoUrl, liveUrl, techStack, suggestedTechnology]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.evaluation_submitted', 'Developer submitted technical evaluation', id, { evaluationId: rows[0].id });
    res.status(201).json({ id: String(rows[0].id), status: 'awaiting_admin_review' });
  });

  app.patch('/api/projects/:id/tech-specs', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id)) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const project = await loadProject(pool, id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const isDev = req.user!.role === 'developer' && String(project.assigned_developer_id) === req.user!.sub;
    const isAdmin = isAdminRole(req.user!.role);
    if (!isDev && !isAdmin) {
      res.status(403).json({ error: 'Only assigned Developer or Admin can update technical specifications.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const githubRepoUrl = text(b.githubRepoUrl, 500);
    const liveUrl = text(b.liveUrl, 500);
    const databaseEngine = text(b.databaseEngine, 100);
    const techStack = text(b.techStack, 2000);
    const architectureNotes = text(b.architectureNotes, 8000);
    const milestone = text(b.developmentMilestone, 50);

    await pool.query(
      `UPDATE projects SET
         github_repo_url = $1,
         live_url = $2,
         database_engine = $3,
         tech_stack = $4,
         architecture_notes = $5,
         development_milestone = CASE WHEN $6 <> '' THEN $6 ELSE development_milestone END,
         updated_at = now()
       WHERE id = $7`,
      [githubRepoUrl, liveUrl, databaseEngine, techStack, architectureNotes, milestone, id]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.tech_specs_updated', 'Updated project development tech specs and repository links', id, {
      githubRepoUrl, liveUrl, databaseEngine, techStack, milestone
    });
    const updated = await loadProject(pool, id);
    res.json({ ok: true, project: updated ? projectDto(updated, req.user!.role) : null });
  });

  // ─── Engineering Tasks / WBS ───────────────────────────────────────────────
  app.get('/api/projects/:id/tasks', requireAuth, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT t.*, u.name AS assignee_name
       FROM project_tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.project_id = $1
       ORDER BY t.sort_order ASC, t.created_at ASC`,
      [id]
    );
    res.json({
      tasks: rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        title: String(r.title),
        description: String(r.description ?? ''),
        category: String(r.category),
        priority: String(r.priority),
        status: String(r.status),
        estimatedHours: Number(r.estimated_hours ?? 0),
        actualHours: Number(r.actual_hours ?? 0),
        assignedTo: r.assigned_to ? String(r.assigned_to) : null,
        assigneeName: r.assignee_name ? String(r.assignee_name) : null,
        sortOrder: Number(r.sort_order ?? 0),
        createdAt: new Date(String(r.created_at)).toISOString(),
        updatedAt: new Date(String(r.updated_at)).toISOString(),
      })),
    });
  });

  app.post('/api/projects/:id/tasks', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const title = text(b.title, 255);
    if (!title) {
      res.status(400).json({ error: 'Task title is required.' });
      return;
    }
    const description = text(b.description, 4000);
    const category = text(b.category, 50) || 'backend';
    const priority = text(b.priority, 10) || 'p2';
    const estimatedHours = Math.max(0, Number(b.estimatedHours) || 0);
    const assignedTo = validId(b.assignedTo) ? b.assignedTo : null;

    const { rows } = await pool.query(
      `INSERT INTO project_tasks (project_id, title, description, category, priority, status, estimated_hours, assigned_to)
       VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7)
       RETURNING *`,
      [id, title, description, category, priority, estimatedHours, assignedTo]
    );
    const created = rows[0];
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.task_created', `Created engineering ticket: ${title}`, id, { taskId: created.id, title, category, priority });
    res.status(201).json({
      task: {
        id: String(created.id),
        projectId: String(created.project_id),
        title: String(created.title),
        description: String(created.description ?? ''),
        category: String(created.category),
        priority: String(created.priority),
        status: String(created.status),
        estimatedHours: Number(created.estimated_hours ?? 0),
        actualHours: Number(created.actual_hours ?? 0),
        assignedTo: created.assigned_to ? String(created.assigned_to) : null,
        sortOrder: Number(created.sort_order ?? 0),
        createdAt: new Date(String(created.created_at)).toISOString(),
        updatedAt: new Date(String(created.updated_at)).toISOString(),
      },
    });
  });

  app.patch('/api/projects/:id/tasks/:taskId', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const taskId = String(req.params.taskId);
    if (!validId(id) || !validId(taskId) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [taskId, id];
    let idx = 3;

    if (typeof b.status === 'string' && ['todo', 'in_progress', 'in_review', 'completed'].includes(b.status)) {
      updates.push(`status = $${idx++}`);
      values.push(b.status);
    }
    if (typeof b.title === 'string' && b.title.trim()) {
      updates.push(`title = $${idx++}`);
      values.push(text(b.title, 255));
    }
    if (typeof b.description === 'string') {
      updates.push(`description = $${idx++}`);
      values.push(text(b.description, 4000));
    }
    if (typeof b.priority === 'string' && ['p0', 'p1', 'p2', 'p3'].includes(b.priority)) {
      updates.push(`priority = $${idx++}`);
      values.push(b.priority);
    }
    if (typeof b.category === 'string') {
      updates.push(`category = $${idx++}`);
      values.push(text(b.category, 50));
    }
    if (b.actualHours !== undefined) {
      updates.push(`actual_hours = $${idx++}`);
      values.push(Math.max(0, Number(b.actualHours) || 0));
    }
    if (b.estimatedHours !== undefined) {
      updates.push(`estimated_hours = $${idx++}`);
      values.push(Math.max(0, Number(b.estimatedHours) || 0));
    }

    if (!updates.length) {
      res.json({ ok: true });
      return;
    }

    updates.push('updated_at = now()');
    const { rows } = await pool.query(
      `UPDATE project_tasks SET ${updates.join(', ')} WHERE id = $1 AND project_id = $2 RETURNING *`,
      values
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    // Auto-update project progress % based on completed vs total tasks
    const { rows: taskStats } = await pool.query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS completed
       FROM project_tasks WHERE project_id = $1`,
      [id]
    );
    if (taskStats[0] && Number(taskStats[0].total) > 0) {
      const calcProgress = Math.round((Number(taskStats[0].completed) / Number(taskStats[0].total)) * 100);
      await pool.query(
        `INSERT INTO project_updates (project_id, author_id, update_type, body, progress_percent)
         VALUES ($1, $2, 'progress', $3, $4)`,
        [id, req.user!.sub, `Task "${rows[0].title}" updated to ${rows[0].status.replace('_', ' ')} (${calcProgress}% sprint complete)`, calcProgress]
      );
    }

    res.json({ ok: true, task: rows[0] });
  });

  app.delete('/api/projects/:id/tasks/:taskId', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const taskId = String(req.params.taskId);
    if (!validId(id) || !validId(taskId) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }
    await pool.query('DELETE FROM project_tasks WHERE id = $1 AND project_id = $2', [taskId, id]);
    res.json({ ok: true });
  });

  // ─── Multi-Environment Topology ───────────────────────────────────────────
  app.get('/api/projects/:id/environments', requireAuth, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const { rows } = await pool.query(
      'SELECT * FROM project_environments WHERE project_id = $1 ORDER BY created_at ASC',
      [id]
    );
    if (!rows.length) {
      const project = await loadProject(pool, id);
      const live = String(project?.live_url ?? '');
      const defaults = [
        { envType: 'local', label: 'Local Dev', url: 'http://localhost:3000', branch: 'dev', port: 3000, healthStatus: 'healthy', notes: 'Run: npm run dev:web' },
        { envType: 'staging', label: 'Staging Preview', url: live ? `https://staging.${live.replace(/^https?:\/\//, '')}` : 'https://staging.agency.dev', branch: 'dev', port: 443, healthStatus: 'healthy', notes: 'Continuous deployment from dev' },
        { envType: 'production', label: 'Production', url: live || 'https://app.client.com', branch: 'main', port: 443, healthStatus: live ? 'healthy' : 'unknown', notes: 'Live client release' },
      ];
      for (const d of defaults) {
        await pool.query(
          `INSERT INTO project_environments (project_id, env_type, label, url, branch, port, health_status, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, d.envType, d.label, d.url, d.branch, d.port, d.healthStatus, d.notes]
        );
      }
      const { rows: seeded } = await pool.query(
        'SELECT * FROM project_environments WHERE project_id = $1 ORDER BY created_at ASC',
        [id]
      );
      res.json({ environments: seeded });
      return;
    }
    res.json({ environments: rows });
  });

  app.post('/api/projects/:id/environments', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const envType = text(b.envType, 50) || 'custom';
    const label = text(b.label, 100) || 'Environment';
    const url = text(b.url, 500);
    const branch = text(b.branch, 100) || 'main';
    const port = Number.isInteger(Number(b.port)) ? Number(b.port) : null;
    const notes = text(b.notes, 1000);

    const { rows } = await pool.query(
      `INSERT INTO project_environments (project_id, env_type, label, url, branch, port, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, envType, label, url, branch, port, notes]
    );
    res.status(201).json({ environment: rows[0] });
  });

  app.patch('/api/projects/:id/environments/:envId', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const envId = String(req.params.envId);
    if (!validId(id) || !validId(envId) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Environment not found.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const { rows } = await pool.query(
      `UPDATE project_environments SET
         label = COALESCE(NULLIF($1, ''), label),
         url = COALESCE(NULLIF($2, ''), url),
         branch = COALESCE(NULLIF($3, ''), branch),
         health_status = COALESCE(NULLIF($4, ''), health_status),
         notes = COALESCE(NULLIF($5, ''), notes),
         updated_at = now()
       WHERE id = $6 AND project_id = $7 RETURNING *`,
      [text(b.label, 100), text(b.url, 500), text(b.branch, 100), text(b.healthStatus, 50), text(b.notes, 1000), envId, id]
    );
    res.json({ ok: true, environment: rows[0] });
  });

  app.delete('/api/projects/:id/environments/:envId', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const envId = String(req.params.envId);
    if (!validId(id) || !validId(envId) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Environment not found.' });
      return;
    }
    await pool.query('DELETE FROM project_environments WHERE id = $1 AND project_id = $2', [envId, id]);
    res.json({ ok: true });
  });

  // ─── Service Topology & Git Repo Command Center ───────────────────────────
  app.patch('/api/projects/:id/topology', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const repoMetadata = typeof b.repoMetadata === 'object' && b.repoMetadata !== null ? b.repoMetadata : null;
    const serviceTopology = typeof b.serviceTopology === 'object' && b.serviceTopology !== null ? b.serviceTopology : null;

    const { rows } = await pool.query(
      `UPDATE projects SET
         repo_metadata = COALESCE($1::jsonb, repo_metadata),
         service_topology = COALESCE($2::jsonb, service_topology),
         updated_at = now()
       WHERE id = $3 RETURNING *`,
      [repoMetadata ? JSON.stringify(repoMetadata) : null, serviceTopology ? JSON.stringify(serviceTopology) : null, id]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.topology_updated', 'Updated service topology and Git repository metadata', id);
    res.json({ ok: true, project: projectDto(rows[0], req.user!.role) });
  });

  // ─── Technical RFC Proposal ────────────────────────────────────────────────
  app.patch('/api/projects/:id/rfc', requireAuth, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || !(await canAccessProject(pool, req.user!, id))) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const rfcSpec = typeof b.rfcSpec === 'object' && b.rfcSpec !== null ? b.rfcSpec : null;

    const { rows } = await pool.query(
      `UPDATE projects SET
         rfc_spec = COALESCE($1::jsonb, rfc_spec),
         updated_at = now()
       WHERE id = $2 RETURNING *`,
      [rfcSpec ? JSON.stringify(rfcSpec) : null, id]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.rfc_updated', 'Updated technical RFC proposal and effort hours matrix', id);
    res.json({ ok: true, project: projectDto(rows[0], req.user!.role) });
  });

  app.patch('/api/projects/:id/evaluations/:evaluationId/review', requireAuth, requireAdmin, requireCsrf, async (req, res) => {
    const projectId = String(req.params.id);
    const evaluationId = String(req.params.evaluationId);
    const b = req.body as Record<string, unknown>;
    const decision = text(b.decision, 40);
    const reason = text(b.reason, 4000);
    if (!validId(projectId) || !validId(evaluationId) || !['approved', 'rejected', 'needs_clarification'].includes(decision)) {
      res.status(400).json({ error: 'Choose an evaluation decision.' });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE project_evaluations SET review_status=$1, review_reason=$2, reviewed_by=$3, reviewed_at=now()
       WHERE id=$4 AND project_id=$5 AND review_status='pending' RETURNING id`,
      [decision, reason, req.user!.sub, evaluationId, projectId]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Pending evaluation not found.' });
      return;
    }
    const projectStatus = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'declined' : 'clarification_required';
    await pool.query('UPDATE projects SET status=$1, updated_at=now() WHERE id=$2', [projectStatus, projectId]);
    await pool.query(
      `INSERT INTO project_updates (project_id, author_id, update_type, body)
       VALUES ($1,$2,'admin_decision',$3)`, [projectId, req.user!.sub, `Technical evaluation ${decision.replaceAll('_', ' ')}${reason ? `: ${reason}` : ''}`]
    );
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.evaluation_reviewed', `Technical evaluation ${decision}`, projectId, { evaluationId, decision, reason });
    res.json({ ok: true, status: projectStatus });
  });

  app.get('/api/projects/:id/settlement', requireAuth, requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    if (!validId(id)) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const { rows } = await pool.query('SELECT * FROM project_settlements WHERE project_id=$1', [id]);
    const s = rows[0];
    res.json({ settlement: s ? {
      id: String(s.id), projectId: String(s.project_id), agreedAmount: Number(s.agreed_amount),
      amountReceived: Number(s.amount_received), currency: String(s.currency),
      paymentStatus: String(s.payment_status), notes: String(s.notes),
      updatedAt: new Date(String(s.updated_at)).toISOString(),
    } : null });
  });

  app.put('/api/projects/:id/settlement', requireAuth, requireAdmin, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const b = req.body as Record<string, unknown>;
    const agreed = Number(b.agreedAmount);
    const received = Number(b.amountReceived);
    const currency = text(b.currency, 3).toUpperCase() || 'INR';
    const status = text(b.paymentStatus, 20);
    const paymentStateMatches =
      (status === 'unpaid' && received === 0) ||
      (status === 'partial' && received > 0 && received < agreed) ||
      (status === 'paid' && agreed > 0 && received === agreed);
    if (!validId(id) || !Number.isFinite(agreed) || !Number.isFinite(received) || agreed < 0 || received < 0 || received > agreed || !/^[A-Z]{3}$/.test(currency) || !paymentStateMatches) {
      res.status(400).json({ error: 'Enter valid amounts, currency, and payment status.' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: projects } = await client.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [id]);
      if (!projects[0]) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      const { rows } = await client.query(
        `INSERT INTO project_settlements (project_id, agreed_amount, amount_received, currency, payment_status, notes, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (project_id) DO UPDATE SET agreed_amount=EXCLUDED.agreed_amount,
           amount_received=EXCLUDED.amount_received, currency=EXCLUDED.currency,
           payment_status=EXCLUDED.payment_status, notes=EXCLUDED.notes,
           updated_by=EXCLUDED.updated_by, updated_at=now()
         RETURNING id, updated_at`,
        [id, agreed, received, currency, status, text(b.notes), req.user!.sub]
      );
      await logWorkflow(client, req.user!.sub, req.user!.sid, 'project.settlement_updated', 'Project settlement updated', id, { paymentStatus: status });
      await client.query('COMMIT');
      res.json({ ok: true, id: String(rows[0].id), updatedAt: new Date(String(rows[0].updated_at)).toISOString() });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.get('/api/project-documents', requireAuth, async (req, res) => {
    const projectId = req.query.projectId ? String(req.query.projectId) : '';
    const handoffId = req.query.handoffId ? String(req.query.handoffId) : '';
    const leadId = req.query.leadId ? String(req.query.leadId) : '';
    const provided = [projectId, handoffId, leadId].filter(Boolean);
    if (provided.length !== 1 || !validId(provided[0])) {
      res.status(400).json({ error: 'Provide one valid projectId, handoffId, or leadId.' });
      return;
    }
    const parent = projectId ? 'project' : handoffId ? 'handoff' : 'lead';
    const id = provided[0];
    const allowed = parent === 'project'
      ? await canAccessProject(pool, req.user!, id)
      : parent === 'handoff'
      ? await canAccessHandoff(pool, req.user!, id)
      : await canAccessCompany(pool, req.user!, id);
    if (!allowed) {
      res.status(404).json({ error: 'Documents not found.' });
      return;
    }
    const documents = await listDocuments(pool, req.user!, parent, id);
    if (documents === null) {
      res.status(403).json({ error: 'Document access denied.' });
      return;
    }
    res.json({ documents });
  });

  app.post('/api/project-documents', requireAuth, requireCsrf, async (req, res) => {
    const b = req.body as Record<string, unknown>;
    const projectId = String(b.projectId ?? '');
    const handoffId = String(b.handoffId ?? '');
    const leadId = String(b.leadId ?? '');
    const provided = [projectId, handoffId, leadId].filter(Boolean);
    const parentType = projectId ? 'project' : handoffId ? 'handoff' : 'lead';
    const parentId = provided[0];
    const type = text(b.type, 40);
    const filename = Array.from(basename(text(b.filename, 255)))
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .trim();
    const contentType = text(b.contentType, 120) || 'application/octet-stream';
    const size = Number(b.sizeBytes);
    if (provided.length !== 1 || !validId(parentId) || !DOC_TYPES.has(type) || !filename || !Number.isInteger(size) || size < 1 || size > MAX_DOCUMENT_BYTES) {
      res.status(400).json({ error: 'Document details are invalid or the file exceeds 25 MB.' });
      return;
    }
    const allowed = parentType === 'project'
      ? await canAccessProject(pool, req.user!, parentId)
      : parentType === 'handoff'
      ? await canAccessHandoff(pool, req.user!, parentId)
      : await canAccessCompany(pool, req.user!, parentId);
    if (!allowed) {
      res.status(404).json({ error: 'Document parent not found.' });
      return;
    }
    const visible = b.developerVisible !== false;
    const { rows } = await pool.query(
      `INSERT INTO project_documents (
         company_id, handoff_id, project_id, uploaded_by, document_type, original_filename,
         content_type, size_bytes, developer_visible
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [leadId || null, handoffId || null, projectId || null, req.user!.sub, type, filename, contentType, size, visible]
    );
    res.status(201).json({ id: String(rows[0].id) });
  });

  app.put('/api/project-documents/:id/content', requireAuth, requireCsrf,
    express.raw({ type: 'application/octet-stream', limit: MAX_DOCUMENT_BYTES }),
    async (req, res) => {
      const id = String(req.params.id);
      if (!validId(id) || !Buffer.isBuffer(req.body) || req.body.length < 1 || req.body.length > MAX_DOCUMENT_BYTES) {
        res.status(400).json({ error: 'A file of at most 25 MB is required.' });
        return;
      }
      const { rows } = await pool.query(
        `SELECT d.*, h.id AS parent_handoff_id, p.id AS parent_project_id
         FROM project_documents d
         LEFT JOIN project_handoffs h ON h.id=d.handoff_id
         LEFT JOIN projects p ON p.id=d.project_id
         WHERE d.id=$1 AND d.deleted_at IS NULL`, [id]
      );
      const doc = rows[0];
      if (!doc || Number(doc.size_bytes) !== req.body.length || (doc.uploaded_at && !isAdminRole(req.user!.role))) {
        res.status(doc ? 409 : 404).json({ error: 'Document not found or upload size does not match.' });
        return;
      }
      const allowed = doc.project_id
        ? await canAccessProject(pool, req.user!, String(doc.project_id))
        : doc.handoff_id
        ? await canAccessHandoff(pool, req.user!, String(doc.handoff_id))
        : await canAccessCompany(pool, req.user!, String(doc.company_id));
      if (!allowed || (!isAdminRole(req.user!.role) && String(doc.uploaded_by) !== req.user!.sub)) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      const storageName = id;
      const path = join(config.storage.projectDocumentsDir, storageName);
      await mkdir(config.storage.projectDocumentsDir, { recursive: true });
      try {
        await writeFile(path, req.body, { flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          res.status(409).json({ error: 'This document has already been uploaded.' });
          return;
        }
        throw error;
      }
      try {
        await pool.query('UPDATE project_documents SET uploaded_at=now() WHERE id=$1', [id]);
      } catch (error) {
        await unlink(path).catch(() => {});
        throw error;
      }
      await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.document_uploaded', 'Project document uploaded', id, { type: doc.document_type, parentType: doc.project_id ? 'project' : doc.handoff_id ? 'handoff' : 'lead' });
      res.json({ ok: true });
    }
  );

  app.patch('/api/project-documents/:id/visibility', requireAuth, requireAdmin, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const visible = req.body?.developerVisible === true;
    const { rows } = await pool.query(
      `UPDATE project_documents SET developer_visible=$1
       WHERE id=$2 AND uploaded_at IS NOT NULL AND deleted_at IS NULL AND document_type <> 'quotation'
       RETURNING id`, [visible, id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Document not found or quotation visibility cannot be changed.' });
      return;
    }
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.document_visibility_changed', 'Project document visibility changed', id, { developerVisible: visible });
    res.json({ ok: true, developerVisible: visible });
  });

  app.get('/api/project-documents/:id/download', requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const { rows } = await pool.query(
      `SELECT d.*,
              COALESCE(d.project_id, p_h.id, p_c.id) AS parent_project_id
       FROM project_documents d
       LEFT JOIN projects p_h ON p_h.handoff_id=d.handoff_id AND d.handoff_id IS NOT NULL
       LEFT JOIN projects p_c ON p_c.company_id=d.company_id AND d.company_id IS NOT NULL
       WHERE d.id=$1 AND d.uploaded_at IS NOT NULL AND d.deleted_at IS NULL`, [id]
    );
    const doc = rows[0];
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const parentProjectId = doc.parent_project_id ? String(doc.parent_project_id) : '';
    const handoffId = doc.handoff_id ? String(doc.handoff_id) : '';
    const companyId = doc.company_id ? String(doc.company_id) : '';
    let allowed = false;
    if (req.user!.role === 'developer') {
      allowed = !!parentProjectId && (await canAccessProject(pool, req.user!, parentProjectId));
    } else if (parentProjectId) {
      allowed = await canAccessProject(pool, req.user!, parentProjectId);
    } else if (handoffId) {
      allowed = await canAccessHandoff(pool, req.user!, handoffId);
    } else if (companyId) {
      allowed = await canAccessCompany(pool, req.user!, companyId);
    }
    if (!allowed) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const storageName = id;
    const path = join(config.storage.projectDocumentsDir, storageName);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(String(doc.original_filename))}`);
    createReadStream(path).on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File content is not available.' });
      else res.destroy();
    }).pipe(res);
  });

  app.get('/api/project-documents/:id/view', requireAuth, async (req, res) => {
    const id = String(req.params.id);
    const { rows } = await pool.query(
      `SELECT d.*,
              COALESCE(d.project_id, p_h.id, p_c.id) AS parent_project_id
       FROM project_documents d
       LEFT JOIN projects p_h ON p_h.handoff_id=d.handoff_id AND d.handoff_id IS NOT NULL
       LEFT JOIN projects p_c ON p_c.company_id=d.company_id AND d.company_id IS NOT NULL
       WHERE d.id=$1 AND d.uploaded_at IS NOT NULL AND d.deleted_at IS NULL`, [id]
    );
    const doc = rows[0];
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const parentProjectId = doc.parent_project_id ? String(doc.parent_project_id) : '';
    const handoffId = doc.handoff_id ? String(doc.handoff_id) : '';
    const companyId = doc.company_id ? String(doc.company_id) : '';
    let allowed = false;
    if (req.user!.role === 'developer') {
      allowed = !!parentProjectId && (await canAccessProject(pool, req.user!, parentProjectId));
    } else if (parentProjectId) {
      allowed = await canAccessProject(pool, req.user!, parentProjectId);
    } else if (handoffId) {
      allowed = await canAccessHandoff(pool, req.user!, handoffId);
    } else if (companyId) {
      allowed = await canAccessCompany(pool, req.user!, companyId);
    }
    if (!allowed) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const storageName = id;
    const path = join(config.storage.projectDocumentsDir, storageName);
    const contentType = String(doc.content_type || 'application/octet-stream');
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(String(doc.original_filename))}`);
    createReadStream(path).on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File content is not available.' });
      else res.destroy();
    }).pipe(res);
  });

  app.delete('/api/project-documents/:id', requireAuth, requireAdmin, requireCsrf, async (req, res) => {
    const id = String(req.params.id);
    const { rows } = await pool.query(
      `UPDATE project_documents SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING original_filename`, [id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const path = join(config.storage.projectDocumentsDir, id);
    await unlink(path).catch(() => {});
    await logWorkflow(pool, req.user!.sub, req.user!.sid, 'project.document_deleted', 'Project document deleted', id);
    res.status(204).end();
  });
}
