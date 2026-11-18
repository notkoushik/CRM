# Proposed Database Design

This is a domain proposal, not an applied schema. Preserve existing `users`, `companies`, `contacts`, `activity_events`, `user_sessions`, and app settings initially; use additive tables and carefully scoped columns where possible.

## Existing entities to retain

- `users`: identity, password hash, stored role.
- `companies`: initial lead/client organization and existing contact details; `assigned_to` can represent the Caller owner during intake.
- `contacts`: individual client contact(s).
- `activity_events`: audit events, with new event types for important workflow changes.

Avoid putting the entire project lifecycle into `companies.stage`: lead qualification and project delivery are distinct processes. Avoid storing quotation documents or final settlement as ordinary notes or discovery JSON.

## Proposed entities

### `call_logs`

`id`, `lead_id`/`company_id`, `contact_id`, `caller_id`, `occurred_at`, `duration_seconds`, `outcome`, `notes`, `next_follow_up_at`, `created_at`. Caller and timestamp are server-derived where possible. Treat entries as append-only; corrections should be audited rather than silently rewriting call history.

### `projects`

One project per accepted client engagement, with a stable `lead_id` reference, `title`, `project_type`, `description`, `functional_requirements`, `preferred_technology`, `expected_timeline`, `status`, `created_by`, `admin_owner_id`, `assigned_developer_id`, `started_at`, `due_at`, `completed_at`, and timestamps. Store sale/quotation amounts and settlement outside the developer-readable projection.

### `project_handoffs`

`id`, `lead_id`, `submitted_by`, `submitted_at`, `status`, `submission_snapshot` only for fields that must be immutable, `admin_reviewed_by`, `reviewed_at`, `decision_reason`, timestamps. Handoff versions or history should preserve resubmissions and rejections.

### `project_evaluations`

`id`, `project_id`, `developer_id`, `feasibility`, `suggested_technology`, `estimated_effort`, `technical_requirements`, `clarification_questions`, `notes`, `submitted_at`, `review_status`, `reviewed_by_admin`, timestamps. Keep estimates distinct from client quotation and final settlement. Define who can view each estimate.

### `project_updates`

`id`, `project_id`, `author_id`, `update_type`, `body`, `progress_percent` (optional), `created_at`. Append updates rather than replacing the only current narrative. An admin can reconstruct the lifecycle and elapsed time.

### `project_documents`

`id`, `project_id` (or handoff reference), `uploaded_by`, `document_type` (quotation, brief, reference, deliverable, other), `original_filename`, `storage_key`, `mime_type`, `size_bytes`, `visibility`, `created_at`, optional `deleted_at`. Keep object keys private. Download endpoint resolves authorization then issues a short-lived URL or streams the file.

### `project_settlements`

Admin-only financial record: `id`, `project_id`, quotation/agreed amount, paid amount, balance, currency, payment state, notes, updated by and timestamps. Exact fields should be decided with the business owner. Do not include this table in developer or caller bootstrap/API responses.

## Relationships and authorization indexes

```text
users (Caller) ──< companies (assigned_to)
companies ──< contacts
companies ──< call_logs >── contacts
companies ──< project_handoffs ──< projects
projects >── users (assigned_developer_id)
projects ──< project_evaluations
projects ──< project_updates
projects ──< project_documents
projects ──1 project_settlements (Admin only)
```

Add indexes on `companies.assigned_to`, `projects.assigned_developer_id`, each project/lead foreign key, status plus due date, and event timestamps. Consider row-level security only after the API role/connection model is understood; application-level checks must be centralized and consistently applied in either case.

## Data projection rule

Define separate response types for `admin`, `caller`, and `developer`. A developer project response contains only project requirements and documents explicitly designated for development. A Caller response contains their own lead and client-facing quotation workflow where appropriate, never settlement. Admin can see all permitted business data. Do not serialize raw joined database rows into responses.
