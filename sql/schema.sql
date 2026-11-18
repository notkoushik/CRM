-- Zero Cost CRM — PostgreSQL schema (idempotent)
-- Apply with: npm run db:migrate  (requires DATABASE_URL)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Auth ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'sdr'
                CHECK (role IN ('founder', 'sdr', 'developer', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add the Developer role for Skylance while preserving existing role values.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('founder', 'sdr', 'developer', 'admin'));

-- ─── Sales Pipeline (Companies) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name           TEXT NOT NULL,
  -- Stage values are validated in the API against app_settings.stages
  stage                  TEXT NOT NULL DEFAULT 'New Lead',
  industry               TEXT,
  location               TEXT,
  estimated_call_volume  INTEGER,
  employee_count         INTEGER,
  intent                 TEXT CHECK (intent IS NULL OR intent IN ('Hot', 'Warm', 'Cold')),
  offered_price          NUMERIC(12, 2),
  primary_contact_id     UUID,
  assigned_to            UUID REFERENCES users(id) ON DELETE SET NULL,
  last_contacted         DATE,
  next_follow_up         DATE,
  notes                  TEXT,
  source_link            TEXT,
  company_website        TEXT,
  linkedin_company       TEXT,
  discovery_answers      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_name_ci ON companies (LOWER(company_name));
CREATE INDEX IF NOT EXISTS companies_stage_idx ON companies (stage);
CREATE INDEX IF NOT EXISTS companies_next_follow_up_idx ON companies (next_follow_up);

-- ─── Contacts ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name     TEXT NOT NULL,
  company_id       UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  role             TEXT,
  phone            TEXT,
  email            TEXT,
  linkedin_profile TEXT,
  contact_status   TEXT NOT NULL DEFAULT 'Not Contacted',
  champion         BOOLEAN NOT NULL DEFAULT FALSE,
  last_contacted   DATE,
  next_follow_up   DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE contacts AS ct
SET created_by = co.assigned_to
FROM companies AS co
WHERE ct.company_id = co.id AND ct.created_by IS NULL AND co.assigned_to IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_ci
  ON contacts (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts (company_id);
CREATE INDEX IF NOT EXISTS contacts_status_idx ON contacts (contact_status);
CREATE INDEX IF NOT EXISTS contacts_champion_idx ON contacts (champion) WHERE champion = TRUE;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_follow_up DATE;
-- When the follow-up WhatsApp message was sent to this contact (NULL = not sent).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS contacts_next_follow_up_idx ON contacts (next_follow_up);

-- Contact statuses / company stages are instance-configurable via app_settings.
-- Drop legacy CHECK constraints so tenants can extend lists without forking SQL.
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_contact_status_check;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_stage_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_primary_contact_fk'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_primary_contact_fk
      FOREIGN KEY (primary_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Instance settings (branding + pipeline lists) ───────────────────────────
-- Singleton row (id = 1). Seeded by migrate; Node ensureAppSettings() fills gaps.

CREATE TABLE IF NOT EXISTS app_settings (
  id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name                 TEXT NOT NULL DEFAULT 'Skylance CRM',
  brand_tagline              TEXT NOT NULL DEFAULT '',
  logo_url                   TEXT NOT NULL DEFAULT '',
  stages                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_statuses           JSONB NOT NULL DEFAULT '[]'::jsonb,
  champion_status_to_stage   JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovery_questions        JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (
  id,
  brand_name,
  brand_tagline,
  logo_url,
  stages,
  contact_statuses,
  champion_status_to_stage
)
SELECT
  1,
  'Skylance CRM',
  'Lead and project management for your team.',
  '',
  '[
    "New Lead",
    "Lead Added",
    "Contacted",
    "Discovery Call Done",
    "Follow-up",
    "Demo Scheduled",
    "Demo Delivered",
    "Commercial Proposal Shared",
    "POC Kickoff",
    "Client Data Received",
    "POC Delivered",
    "Final Negotiation",
    "Qualified",
    "Handoff Submitted",
    "Converted",
    "Closed Won",
    "Not Interested",
    "Closed Lost"
  ]'::jsonb,
  '[
    "Not Contacted",
    "Didn''t Pick",
    "Connected - Got Referral",
    "Connected - Not Right Person",
    "Connected - Future Follow-up",
    "Interested",
    "Called",
    "No Answer",
    "Connected",
    "Follow-up Required",
    "Not Interested",
    "Wrong Number",
    "Rejected"
  ]'::jsonb,
  '{
    "Not Contacted": null,
    "Didn''t Pick": null,
    "Connected - Got Referral": "Follow-up",
    "Connected - Not Right Person": "Follow-up",
    "Connected - Future Follow-up": "Follow-up",
    "Interested": "Discovery Call Done",
    "Called": "Discovery Call Done",
    "No Answer": null,
    "Connected": "Contacted",
    "Follow-up Required": "Follow-up",
    "Not Interested": "Not Interested",
    "Wrong Number": null,
    "Rejected": "Not Interested"
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE id = 1);

-- Ensure app_settings stages are synchronized to include Skylance agency stages
UPDATE app_settings
SET
  stages = '[
    "New Lead",
    "Lead Added",
    "Contacted",
    "Discovery Call Done",
    "Follow-up",
    "Demo Scheduled",
    "Demo Delivered",
    "Commercial Proposal Shared",
    "POC Kickoff",
    "Client Data Received",
    "POC Delivered",
    "Final Negotiation",
    "Qualified",
    "Handoff Submitted",
    "Converted",
    "Closed Won",
    "Not Interested",
    "Closed Lost"
  ]'::jsonb,
  contact_statuses = '[
    "Not Contacted",
    "Didn''t Pick",
    "Connected - Got Referral",
    "Connected - Not Right Person",
    "Connected - Future Follow-up",
    "Interested",
    "Called",
    "No Answer",
    "Connected",
    "Follow-up Required",
    "Not Interested",
    "Wrong Number",
    "Rejected"
  ]'::jsonb,
  champion_status_to_stage = '{
    "Not Contacted": null,
    "Didn''t Pick": null,
    "Connected - Got Referral": "Follow-up",
    "Connected - Not Right Person": "Follow-up",
    "Connected - Future Follow-up": "Follow-up",
    "Interested": "Discovery Call Done",
    "Called": "Discovery Call Done",
    "No Answer": null,
    "Connected": "Contacted",
    "Follow-up Required": "Follow-up",
    "Not Interested": "Not Interested",
    "Wrong Number": null,
    "Rejected": "Not Interested"
  }'::jsonb
WHERE id = 1;

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS discovery_questions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Whose status change moves the company stage: 'champion' (default) or 'any_contact'.
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS stage_auto_move_scope TEXT NOT NULL DEFAULT 'champion';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS discovery_answers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── Daily import staging ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  raw_text     TEXT NOT NULL,
  row_count    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_import_rows (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id      UUID NOT NULL REFERENCES lead_imports(id) ON DELETE CASCADE,
  company        TEXT NOT NULL,
  prospect_name  TEXT NOT NULL,
  job_title      TEXT,
  email          TEXT,
  phone          TEXT,
  location       TEXT,
  employees      INTEGER,
  industry       TEXT,
  processed      BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─── Call recordings (conversations) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  called_by       UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  stage_at_call   TEXT NOT NULL,
  called_at       TIMESTAMPTZ,
  s3_url          TEXT UNIQUE,
  file_ext        TEXT NOT NULL,
  upload_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'completed')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_contact_idx ON conversations (contact_id);
CREATE INDEX IF NOT EXISTS conversations_company_idx ON conversations (company_id);
CREATE INDEX IF NOT EXISTS conversations_called_by_idx ON conversations (called_by);
CREATE INDEX IF NOT EXISTS conversations_called_at_idx ON conversations (called_at);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_call_unique_idx
  ON conversations (called_by, contact_id, called_at)
  WHERE called_at IS NOT NULL;

-- ─── Skylance handoffs and project delivery ────────────────────────────────
-- Lead qualification and project delivery have separate lifecycle records.
CREATE TABLE IF NOT EXISTS project_handoffs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  submitted_by             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_title            TEXT NOT NULL,
  project_type             TEXT NOT NULL DEFAULT 'Other',
  description              TEXT NOT NULL DEFAULT '',
  functional_requirements  TEXT NOT NULL DEFAULT '',
  preferred_technology     TEXT NOT NULL DEFAULT '',
  expected_budget          TEXT NOT NULL DEFAULT '',
  expected_timeline        TEXT NOT NULL DEFAULT '',
  additional_comments      TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'needs_clarification', 'rejected', 'converted')),
  decision_reason          TEXT,
  reviewed_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_handoffs_status_created_idx
  ON project_handoffs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS project_handoffs_company_idx
  ON project_handoffs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_handoffs_submitter_idx
  ON project_handoffs (submitted_by, created_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id               UUID UNIQUE REFERENCES project_handoffs(id) ON DELETE SET NULL,
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  created_by               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_developer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  project_title            TEXT NOT NULL,
  project_type             TEXT NOT NULL DEFAULT 'Other',
  description              TEXT NOT NULL DEFAULT '',
  functional_requirements  TEXT NOT NULL DEFAULT '',
  preferred_technology     TEXT NOT NULL DEFAULT '',
  expected_timeline        TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT 'awaiting_assignment'
    CHECK (status IN ('awaiting_assignment', 'assigned', 'in_evaluation', 'awaiting_admin_review', 'clarification_required', 'approved', 'declined', 'in_progress', 'completed')),
  started_at               TIMESTAMPTZ,
  due_at                   TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE projects ALTER COLUMN assigned_developer_id DROP NOT NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('awaiting_assignment', 'assigned', 'in_evaluation', 'awaiting_admin_review', 'clarification_required', 'approved', 'declined', 'in_progress', 'completed'));
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'awaiting_assignment';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_url TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS live_url TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS database_engine TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tech_stack TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_notes TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS development_milestone TEXT DEFAULT 'planning';

CREATE INDEX IF NOT EXISTS projects_developer_status_idx
  ON projects (assigned_developer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_company_idx
  ON projects (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_due_idx ON projects (due_at) WHERE due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_evaluations (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  developer_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  feasibility              TEXT NOT NULL CHECK (feasibility IN ('feasible', 'not_feasible', 'needs_clarification')),
  suggested_technology     TEXT NOT NULL DEFAULT '',
  estimated_effort         TEXT NOT NULL DEFAULT '',
  technical_requirements   TEXT NOT NULL DEFAULT '',
  clarification_questions  TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  review_status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_clarification')),
  review_reason            TEXT,
  reviewed_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS database_engine TEXT DEFAULT '';
ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS github_repo_url TEXT DEFAULT '';
ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS live_url TEXT DEFAULT '';
ALTER TABLE project_evaluations ADD COLUMN IF NOT EXISTS tech_stack TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS project_evaluations_project_idx
  ON project_evaluations (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  update_type     TEXT NOT NULL DEFAULT 'progress'
    CHECK (update_type IN ('progress', 'clarification', 'admin_decision', 'assignment', 'completion')),
  body            TEXT NOT NULL,
  progress_percent SMALLINT CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_updates_project_idx
  ON project_updates (project_id, created_at DESC);

-- ─── Engineering Work Breakdown Structure (Tasks) ───────────────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT 'backend'
                   CHECK (category IN ('architecture', 'frontend', 'backend', 'database', 'integrations', 'devops', 'qa')),
  priority         TEXT NOT NULL DEFAULT 'p2'
                   CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  status           TEXT NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo', 'in_progress', 'in_review', 'completed')),
  estimated_hours  NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (estimated_hours >= 0),
  actual_hours     NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (actual_hours >= 0),
  assigned_to      UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_tasks_project_idx
  ON project_tasks (project_id, sort_order ASC, created_at ASC);

-- ─── Multi-Environment Topology ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_environments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  env_type         TEXT NOT NULL CHECK (env_type IN ('local', 'staging', 'production', 'preview', 'custom')),
  label            TEXT NOT NULL,
  url              TEXT NOT NULL DEFAULT '',
  branch           TEXT NOT NULL DEFAULT '',
  port             INTEGER,
  health_status    TEXT NOT NULL DEFAULT 'healthy'
                   CHECK (health_status IN ('healthy', 'degraded', 'offline', 'unknown')),
  last_checked_at  TIMESTAMPTZ,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_environments_project_idx
  ON project_environments (project_id, created_at ASC);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_metadata JSONB DEFAULT '{
  "cloneUrlSsh": "",
  "cloneUrlHttps": "",
  "defaultBranch": "main",
  "activeBranch": "dev",
  "latestCommitHash": "",
  "latestCommitMsg": "",
  "latestTag": "",
  "pullRequests": []
}'::jsonb;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_topology JSONB DEFAULT '{
  "frontend": { "framework": "React / Next.js", "port": 3000, "runScript": "npm run dev:web" },
  "backend": { "framework": "Node.js / Express", "port": 5000, "runScript": "npm run dev:api" },
  "database": { "engine": "PostgreSQL 16", "port": 5432, "migrationRunner": "npm run db:migrate" },
  "cache": { "engine": "None", "port": null },
  "storage": { "engine": "Local / S3", "bucket": "" },
  "integrations": []
}'::jsonb;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS rfc_spec JSONB DEFAULT '{
  "frontendHours": 0,
  "backendHours": 0,
  "infraHours": 0,
  "qaHours": 0,
  "schemaProposal": "",
  "riskMatrix": [],
  "status": "draft"
}'::jsonb;

CREATE TABLE IF NOT EXISTS project_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID REFERENCES companies(id) ON DELETE CASCADE,
  handoff_id         UUID REFERENCES project_handoffs(id) ON DELETE CASCADE,
  project_id         UUID REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document_type      TEXT NOT NULL CHECK (document_type IN ('quotation', 'project_brief', 'client_reference', 'technical', 'deliverable', 'other')),
  original_filename  TEXT NOT NULL,
  content_type       TEXT NOT NULL,
  size_bytes         BIGINT NOT NULL CHECK (size_bytes >= 0),
  developer_visible  BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  CONSTRAINT project_documents_one_parent CHECK (
    (company_id IS NOT NULL AND handoff_id IS NULL AND project_id IS NULL) OR
    (company_id IS NULL AND handoff_id IS NOT NULL AND project_id IS NULL) OR
    (company_id IS NULL AND handoff_id IS NULL AND project_id IS NOT NULL)
  )
);

ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE project_documents DROP CONSTRAINT IF EXISTS project_documents_no_quote_for_developer;
ALTER TABLE project_documents DROP CONSTRAINT IF EXISTS project_documents_one_parent;
ALTER TABLE project_documents ADD CONSTRAINT project_documents_one_parent CHECK (
  (company_id IS NOT NULL AND handoff_id IS NULL AND project_id IS NULL) OR
  (company_id IS NULL AND handoff_id IS NOT NULL AND project_id IS NULL) OR
  (company_id IS NULL AND handoff_id IS NULL AND project_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS project_documents_company_idx
  ON project_documents (company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS project_documents_handoff_idx
  ON project_documents (handoff_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS project_documents_project_idx
  ON project_documents (project_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE RESTRICT,
  agreed_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (agreed_amount >= 0),
  amount_received  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_received >= 0),
  currency         TEXT NOT NULL DEFAULT 'INR',
  payment_status   TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  notes            TEXT NOT NULL DEFAULT '',
  updated_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount_received <= agreed_amount)
);

CREATE TABLE IF NOT EXISTS call_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  caller_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds    INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  outcome             TEXT NOT NULL,
  notes               TEXT NOT NULL DEFAULT '',
  next_follow_up_at   DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider            TEXT NOT NULL DEFAULT 'manual',
  provider_call_sid   TEXT,
  provider_status     TEXT,
  recording_url       TEXT,
  call_direction      TEXT NOT NULL DEFAULT 'outbound'
);

ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS provider_call_sid TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS provider_status TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_direction TEXT NOT NULL DEFAULT 'outbound';
CREATE UNIQUE INDEX IF NOT EXISTS call_logs_provider_sid_idx
  ON call_logs (provider, provider_call_sid)
  WHERE provider_call_sid IS NOT NULL;

ALTER TABLE call_logs
  ALTER COLUMN next_follow_up_at TYPE DATE USING next_follow_up_at::date;

CREATE INDEX IF NOT EXISTS call_logs_company_occurred_idx
  ON call_logs (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_caller_occurred_idx
  ON call_logs (caller_id, occurred_at DESC);

-- ─── SDR activity / sessions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  end_reason      TEXT CHECK (end_reason IS NULL OR end_reason IN ('manual', 'idle', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_started_idx
  ON user_sessions (user_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_one_open_idx
  ON user_sessions (user_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS activity_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,
  entity_type  TEXT NOT NULL
               CHECK (entity_type IN ('contact', 'company', 'conversation', 'session', 'system')),
  entity_id    UUID,
  summary      TEXT NOT NULL DEFAULT '',
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_events_user_created_idx
  ON activity_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_entity_idx
  ON activity_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_type_created_idx
  ON activity_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS sdr_daily_targets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calls_target       INTEGER NOT NULL DEFAULT 80,
  follow_ups_target  INTEGER NOT NULL DEFAULT 25,
  demos_target       INTEGER NOT NULL DEFAULT 4,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sdr_daily_targets (calls_target, follow_ups_target, demos_target)
SELECT 80, 25, 4
WHERE NOT EXISTS (SELECT 1 FROM sdr_daily_targets);
