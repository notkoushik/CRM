import { api, getCookie } from './api';

export interface Handoff {
  id: string;
  leadId: string;
  clientBusiness: string;
  leadStage: string;
  clientContact: string;
  clientPhone: string;
  clientEmail: string;
  submittedBy: string;
  submitterName: string;
  title: string;
  projectType: string;
  description: string;
  functionalRequirements: string;
  preferredTechnology: string;
  expectedBudget: string;
  expectedTimeline: string;
  additionalComments: string;
  status: string;
  decisionReason: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  handoffId: string | null;
  leadId: string;
  clientBusiness: string;
  leadStage: string;
  clientContact: string;
  clientPhone: string;
  clientEmail: string;
  title: string;
  projectType: string;
  description: string;
  functionalRequirements: string;
  preferredTechnology: string;
  expectedTimeline: string;
  expectedBudget?: string;
  status: string;
  developerId: string | null;
  developerName: string;
  callerId?: string | null;
  callerName?: string;
  githubRepoUrl?: string;
  liveUrl?: string;
  databaseEngine?: string;
  techStack?: string;
  architectureNotes?: string;
  developmentMilestone?: string;
  repoMetadata?: {
    cloneUrlSsh?: string;
    cloneUrlHttps?: string;
    defaultBranch?: string;
    activeBranch?: string;
    latestCommitHash?: string;
    latestCommitMsg?: string;
    latestTag?: string;
    pullRequests?: Array<{
      number: number;
      title: string;
      author: string;
      branch: string;
      reviewStatus: 'draft' | 'in_review' | 'approved' | 'merged';
      ciStatus: 'passing' | 'running' | 'failed' | 'pending';
      url: string;
    }>;
  };
  serviceTopology?: {
    frontend?: { framework: string; port: number; runScript: string };
    backend?: { framework: string; port: number; runScript: string };
    database?: { engine: string; port: number; migrationRunner: string };
    cache?: { engine: string; port: number | null };
    storage?: { engine: string; bucket: string };
    integrations?: Array<{ name: string; key: string; ready: boolean; notes?: string }>;
  };
  rfcSpec?: {
    frontendHours: number;
    backendHours: number;
    infraHours: number;
    qaHours: number;
    schemaProposal: string;
    riskMatrix: Array<{ risk: string; severity: 'low' | 'medium' | 'high'; mitigation: string }>;
    status: 'draft' | 'submitted' | 'approved' | 'clarification_required';
  };
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectUpdate {
  id: string;
  authorId: string;
  authorName: string;
  type: string;
  body: string;
  progressPercent: number | null;
  createdAt: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: 'architecture' | 'frontend' | 'backend' | 'database' | 'integrations' | 'devops' | 'qa';
  priority: 'p0' | 'p1' | 'p2' | 'p3';
  status: 'todo' | 'in_progress' | 'in_review' | 'completed';
  estimatedHours: number;
  actualHours: number;
  assignedTo: string | null;
  assigneeName?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectEnvironment {
  id: string;
  projectId: string;
  envType: 'local' | 'staging' | 'production' | 'preview' | 'custom';
  label: string;
  url: string;
  branch: string;
  port: number | null;
  healthStatus: 'healthy' | 'degraded' | 'offline' | 'unknown';
  lastCheckedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectEvaluation {
  id: string;
  developerId: string;
  developerName: string;
  feasibility: string;
  suggestedTechnology: string;
  databaseEngine?: string;
  githubRepoUrl?: string;
  liveUrl?: string;
  techStack?: string;
  estimatedEffort: string;
  technicalRequirements: string;
  clarificationQuestions: string;
  notes: string;
  reviewStatus: string;
  reviewReason: string;
  createdAt: string;
}

export interface ProjectDocument {
  id: string;
  type: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  developerVisible: boolean;
  uploadedAt: string;
  uploadedBy: string;
}

export interface Settlement {
  id?: string;
  projectId?: string;
  agreedAmount: number;
  amountReceived: number;
  currency: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  notes: string;
  updatedAt?: string;
}

export async function uploadProjectDocument(
  parent: { projectId?: string; handoffId?: string; leadId?: string },
  type: string,
  file: File,
  developerVisible = false
) {
  const { id } = await api<{ id: string }>('/api/project-documents', {
    method: 'POST',
    body: JSON.stringify({
      ...parent,
      type,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      developerVisible,
    }),
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  const csrfToken = getCookie('csrfToken');
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(`/api/project-documents/${id}/content`, {
    method: 'PUT',
    credentials: 'include',
    headers,
    body: file,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Document upload failed.');
  }
}

export async function downloadProjectDocument(document: ProjectDocument) {
  const response = await fetch(`/api/project-documents/${document.id}/download`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Document download failed.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement('a');
  link.href = url;
  link.download = document.filename;
  link.click();
  URL.revokeObjectURL(url);
}
