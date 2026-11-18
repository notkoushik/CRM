import { afterAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { api, getBaseUrl, loginAsCookie, SEED } from './helpers';
import { pool } from '../../../server/db.js';
import { config } from '../../../server/config.js';

describe('project handoff, delivery, documents, and settlement', () => {
  const leadIds: string[] = [];
  const contactIds: string[] = [];
  const handoffIds: string[] = [];
  const projectIds: string[] = [];
  const fileIds: string[] = [];
  let secondaryDeveloperId = '';

  afterAll(async () => {
    if (projectIds.length) {
      await pool.query('DELETE FROM project_settlements WHERE project_id = ANY($1::uuid[])', [projectIds]);
      await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
    }
    if (handoffIds.length) {
      await pool.query('DELETE FROM project_handoffs WHERE id = ANY($1::uuid[])', [handoffIds]);
    }
    if (leadIds.length) {
      await pool.query('DELETE FROM contacts WHERE id = ANY($1::uuid[])', [contactIds]);
      await pool.query('DELETE FROM contacts WHERE company_id = ANY($1::uuid[])', [leadIds]);
      await pool.query('DELETE FROM companies WHERE id = ANY($1::uuid[])', [leadIds]);
    }
    if (secondaryDeveloperId) await pool.query('DELETE FROM users WHERE id=$1', [secondaryDeveloperId]);
    await Promise.all(fileIds.map((id) => unlink(join(config.storage.projectDocumentsDir, id)).catch(() => {})));
  });

  it('keeps handoffs private, assigns a project, hides quotes and settlement from Developers', async () => {
    const caller = await loginAsCookie(SEED.sdr);
    const otherCaller = await loginAsCookie(SEED.sdrB);
    const admin = await loginAsCookie(SEED.founder);
    const developer = await loginAsCookie(SEED.developer);
    const suffix = Date.now();

    const createdLead = await api<{ id: string }>('/api/companies', {
      session: caller,
      body: { companyName: `Workflow lead ${suffix}`, stage: 'Lead Added' },
    });
    expect(createdLead.status).toBe(201);
    leadIds.push(createdLead.data.id);

    const createdContact = await api<{ id: string }>('/api/contacts', {
      session: caller,
      body: { companyId: createdLead.data.id, contactName: `Project client ${suffix}`, phone: '5550100' },
    });
    expect(createdContact.status).toBe(201);
    contactIds.push(createdContact.data.id);
    const callLog = await api<{ callLog: { id: string; outcome: string; nextFollowUpAt: string } }>('/api/call-logs', {
      session: caller,
      body: { contactId: createdContact.data.id, outcome: 'Interested', durationSeconds: 300, notes: 'Needs a website and booking form.', nextFollowUpAt: '2026-12-01' },
    });
    expect(callLog.status).toBe(201);
    expect(callLog.data.callLog.outcome).toBe('Interested');
    expect(callLog.data.callLog.nextFollowUpAt).toBe('2026-12-01');
    const ownCalls = await api<{ callLogs: { id: string; durationSeconds: number }[] }>(`/api/call-logs?contactId=${createdContact.data.id}`, { session: caller });
    expect(ownCalls.data.callLogs[0]?.id).toBe(callLog.data.callLog.id);
    expect(ownCalls.data.callLogs[0]?.durationSeconds).toBe(300);
    expect((await api(`/api/call-logs?contactId=${createdContact.data.id}`, { session: otherCaller })).status).toBe(404);
    expect((await api('/api/call-logs', { session: developer, body: { contactId: createdContact.data.id, outcome: 'Interested' } })).status).toBe(403);

    const createdHandoff = await api<{ handoff: { id: string; status: string; expectedBudget: string } }>('/api/handoffs', {
      session: caller,
      body: {
        leadId: createdLead.data.id,
        title: `Workflow project ${suffix}`,
        projectType: 'Website',
        description: 'A private workflow test project.',
        functionalRequirements: 'Client intake and project tracking.',
        expectedBudget: 'INR 12000',
        expectedTimeline: 'Four weeks',
      },
    });
    expect(createdHandoff.status).toBe(201);
    expect(createdHandoff.data.handoff.status).toBe('submitted');
    handoffIds.push(createdHandoff.data.handoff.id);

    const callerHandoffs = await api<{ handoffs: { id: string }[] }>('/api/handoffs', { session: caller });
    expect(callerHandoffs.data.handoffs.some((h) => h.id === createdHandoff.data.handoff.id)).toBe(true);
    const otherHandoffs = await api<{ handoffs: { id: string }[] }>('/api/handoffs', { session: otherCaller });
    expect(otherHandoffs.data.handoffs.some((h) => h.id === createdHandoff.data.handoff.id)).toBe(false);
    expect((await api('/api/handoffs', { session: developer })).status).toBe(403);

    expect((await api(`/api/handoffs/${createdHandoff.data.handoff.id}/review`, {
      method: 'PATCH', session: admin, body: { decision: 'needs_clarification', reason: 'Please confirm the delivery timeline.' },
    })).status).toBe(200);
    const clarified = await api<{ handoff: { status: string; decisionReason: string } }>(`/api/handoffs/${createdHandoff.data.handoff.id}`, { session: caller });
    expect(clarified.data.handoff.status).toBe('needs_clarification');
    expect(clarified.data.handoff.decisionReason).toContain('delivery timeline');
    expect((await api(`/api/handoffs/${createdHandoff.data.handoff.id}`, { session: otherCaller })).status).toBe(404);

    expect((await api(`/api/handoffs/${createdHandoff.data.handoff.id}`, {
      method: 'PATCH', session: caller,
      body: { ...createdHandoff.data.handoff, title: `Clarified project ${suffix}`, expectedTimeline: 'Six weeks' },
    })).status).toBe(200);

    const developerBResult = await api<{ user: { id: string } }>('/api/users', {
      session: admin,
      body: { name: 'Workflow Developer B', email: `developer.workflow.${suffix}@skylance.local`, password: 'WorkflowTest123!', role: 'developer' },
    });
    expect(developerBResult.status).toBe(201);
    secondaryDeveloperId = developerBResult.data.user.id;
    const developerB = await loginAsCookie(`developer.workflow.${suffix}@skylance.local`, 'WorkflowTest123!');

    const approved = await api<{ project: { id: string } }>('/api/handoffs/' + createdHandoff.data.handoff.id + '/review', {
      method: 'PATCH', session: admin,
      body: { decision: 'approve', developerId: developer.user.id },
    });
    expect(approved.status).toBe(200);
    const projectId = approved.data.project.id;
    projectIds.push(projectId);

    const developerProjects = await api<{ projects: Record<string, unknown>[] }>('/api/projects', { session: developer });
    expect(developerProjects.data.projects.some((p) => p.id === projectId)).toBe(true);
    expect(developerProjects.data.projects.find((p) => p.id === projectId)).not.toHaveProperty('expectedBudget');
    expect((await api(`/api/projects/${projectId}`, { session: developerB })).status).toBe(404);
    expect((await api(`/api/projects/${projectId}/settlement`, { session: developer })).status).toBe(403);
    expect((await api(`/api/projects/${projectId}/settlement`, { session: caller })).status).toBe(403);

    const quoteBytes = Buffer.from('private client quotation');
    const quoteMeta = await api<{ id: string }>('/api/project-documents', {
      session: caller,
      body: { handoffId: createdHandoff.data.handoff.id, type: 'quotation', filename: 'client-quotation.pdf', contentType: 'application/pdf', sizeBytes: quoteBytes.length },
    });
    expect(quoteMeta.status).toBe(201);
    fileIds.push(quoteMeta.data.id);
    const quoteUpload = await fetch(`${getBaseUrl()}/api/project-documents/${quoteMeta.data.id}/content`, {
      method: 'PUT', headers: { cookie: caller.cookieHeader, 'x-csrf-token': caller.csrfToken, 'content-type': 'application/octet-stream' }, body: quoteBytes,
    });
    expect(quoteUpload.status).toBe(200);

    const quoteList = await api<{ documents: { id: string; type: string }[] }>(`/api/project-documents?projectId=${projectId}`, { session: admin });
    expect(quoteList.data.documents.some((d) => d.id === quoteMeta.data.id && d.type === 'quotation')).toBe(true);
    const developerDocs = await api<{ documents: { id: string }[] }>(`/api/project-documents?projectId=${projectId}`, { session: developer });
    // Requirement document uploaded by caller is visible to the assigned developer
    expect(developerDocs.data.documents.some((d) => d.id === quoteMeta.data.id)).toBe(true);
    expect((await api(`/api/project-documents/${quoteMeta.data.id}/download`, { session: developer })).status).toBe(200);
    // But other developers not assigned to this project cannot access it
    expect((await api(`/api/project-documents/${quoteMeta.data.id}/download`, { session: developerB })).status).toBe(404);

    const referenceBytes = Buffer.from('developer-visible project brief');
    const reference = await api<{ id: string }>('/api/project-documents', {
      session: admin,
      body: { projectId, type: 'client_reference', filename: 'project-brief.pdf', contentType: 'application/pdf', sizeBytes: referenceBytes.length, developerVisible: true },
    });
    expect(reference.status).toBe(201);
    fileIds.push(reference.data.id);
    const refUpload = await fetch(`${getBaseUrl()}/api/project-documents/${reference.data.id}/content`, {
      method: 'PUT', headers: { cookie: admin.cookieHeader, 'x-csrf-token': admin.csrfToken, 'content-type': 'application/octet-stream' }, body: referenceBytes,
    });
    expect(refUpload.status).toBe(200);
    expect((await api(`/api/project-documents/${reference.data.id}/download`, { session: developer })).status).toBe(200);
    expect((await api(`/api/project-documents/${reference.data.id}/download`, { session: developerB })).status).toBe(404);
    const sharedDocs = await api<{ documents: { id: string }[] }>(`/api/project-documents?projectId=${projectId}`, { session: developer });
    expect(sharedDocs.data.documents.some((d) => d.id === reference.data.id)).toBe(true);

    const evaluation = await api<{ id: string }>('/api/projects/' + projectId + '/evaluations', {
      method: 'POST', session: developer,
      body: {
        feasibility: 'feasible',
        estimatedEffort: '3-4 weeks',
        suggestedTechnology: 'React and PostgreSQL',
        databaseEngine: 'PostgreSQL',
        githubRepoUrl: 'https://github.com/skylance/test-repo',
        liveUrl: 'https://test-project.skylance.app',
        techStack: 'React, Node.js, PostgreSQL',
        notes: 'No pricing included.'
      },
    });
    expect(evaluation.status).toBe(201);
    const projectDetail = await api<{ project: Record<string, unknown>; evaluations: { id: string; reviewStatus: string }[] }>(`/api/projects/${projectId}`, { session: admin });
    expect(projectDetail.data.evaluations.some((e) => e.id === evaluation.data.id && e.reviewStatus === 'pending')).toBe(true);

    // Test PATCH /api/projects/:id/tech-specs
    const patchTech = await api<{ ok: boolean; project: { githubRepoUrl: string; databaseEngine: string } }>(`/api/projects/${projectId}/tech-specs`, {
      method: 'PATCH',
      session: developer,
      body: {
        githubRepoUrl: 'https://github.com/skylance/updated-repo',
        liveUrl: 'https://live.skylance.app',
        databaseEngine: 'Supabase',
        techStack: 'Next.js, Supabase, Tailwind CSS',
        developmentMilestone: 'in_development',
      },
    });
    expect(patchTech.status).toBe(200);
    expect(patchTech.data.project.githubRepoUrl).toBe('https://github.com/skylance/updated-repo');
    expect(patchTech.data.project.databaseEngine).toBe('Supabase');
    expect((await api(`/api/projects/${projectId}/status`, { method: 'PATCH', session: developer, body: { status: 'in_progress' } })).status).toBe(403);

    expect((await api(`/api/projects/${projectId}/settlement`, {
      method: 'PUT', session: admin,
      body: { agreedAmount: 12000, amountReceived: 0, currency: 'INR', paymentStatus: 'unpaid', notes: 'Initial payment pending.' },
    })).status).toBe(200);
    const savedSettlement = await api<{ settlement: { agreedAmount: number; amountReceived: number } }>(`/api/projects/${projectId}/settlement`, { session: admin });
    expect(savedSettlement.data.settlement.agreedAmount).toBe(12000);
    expect(savedSettlement.data.settlement.amountReceived).toBe(0);
  });

  it('automatically creates a project on lead conversion, attributes caller, and allows admin to assign developer', async () => {
    const caller = await loginAsCookie(SEED.sdr);
    const admin = await loginAsCookie(SEED.founder);
    const developer = await loginAsCookie(SEED.developer);
    const suffix = Date.now();

    // 1. Caller creates an inbound lead
    const configRes = await api<{ stages: string[] }>('/api/config', { session: caller });
    const initialStage = configRes.data.stages[0] || 'Lead Added';
    const convertedStage = configRes.data.stages.find((s) => s === 'Converted' || s === 'Closed Won') || 'Converted';

    const createdLead = await api<{ id: string; companyName: string }>('/api/companies', {
      session: caller,
      body: { companyName: `Converted Lead Agency ${suffix}`, stage: initialStage },
    });
    expect(createdLead.status).toBe(201);
    leadIds.push(createdLead.data.id);

    // 2. Lead is converted (stage moves to 'Converted' or 'Closed Won')
    const convertResult = await api(`/api/companies/${createdLead.data.id}`, {
      method: 'PATCH',
      session: caller,
      body: { stage: convertedStage },
    });
    expect(convertResult.status).toBe(200);

    // 3. Verify that Admin sees an unassigned project with status 'awaiting_assignment' and callerName
    const adminProjects = await api<{ projects: { id: string; status: string; developerId: string | null; callerName: string; title: string; clientBusiness: string }[] }>('/api/projects', {
      session: admin,
    });
    expect(adminProjects.status).toBe(200);
    const autoProject = adminProjects.data.projects.find((p) => p.clientBusiness === `Converted Lead Agency ${suffix}`);
    expect(autoProject).toBeDefined();
    expect(autoProject!.status).toBe('awaiting_assignment');
    expect(autoProject!.developerId).toBeNull();
    expect(autoProject!.callerName).toBeTruthy();
    projectIds.push(autoProject!.id);

    // 4. Verify Developer cannot see this unassigned project yet
    const devProjects = await api<{ projects: { id: string }[] }>('/api/projects', {
      session: developer,
    });
    expect(devProjects.status).toBe(200);
    expect(devProjects.data.projects.some((p) => p.id === autoProject!.id)).toBe(false);

    // 5. Admin assigns the project to the available developer
    const assignResult = await api<{ ok: boolean; project?: { status: string; developerId: string } }>(`/api/projects/${autoProject!.id}/assignment`, {
      method: 'PATCH',
      session: admin,
      body: { developerId: developer.user.id },
    });
    expect(assignResult.status).toBe(200);
    expect(assignResult.data.ok).toBe(true);

    // 6. Verify Developer can now access the project
    const devProjectsAfter = await api<{ projects: { id: string; status: string }[] }>('/api/projects', {
      session: developer,
    });
    const foundByDev = devProjectsAfter.data.projects.find((p) => p.id === autoProject!.id);
    expect(foundByDev).toBeDefined();
    expect(foundByDev!.status).toBe('assigned');
  });
});
