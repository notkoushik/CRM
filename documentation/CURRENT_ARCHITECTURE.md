# Current Architecture Audit

Audit scope: repository at the start of the Skylance customization, on `docs/skylance-crm-architecture-audit`. This is a read-only architecture review. No application source or database changes are part of this audit.

## Runtime

| Layer | Current implementation | Main files |
|---|---|---|
| Browser UI | React 19, TypeScript, Vite, Tailwind CSS | `src/main.tsx`, `src/App.tsx`, `src/components/` |
| API | Express 5 with TypeScript run by `tsx` | `server/index.ts`, `server/app.ts` |
| Persistence | PostgreSQL, SQL schema is idempotent but is not a numbered migration system | `sql/schema.sql`, `server/db.ts` |
| Authentication | bcrypt passwords; 12-hour JWT in HttpOnly cookie; server-side sessions; CSRF cookie/header for mutations | `server/auth.ts`, `server/app.ts`, `server/activity.ts` |
| File storage | S3-compatible AWS storage only for call recordings today | `server/s3.ts`, `server/conversations.ts` |
| Test structure | Vitest unit/API tests and Playwright browser tests; functional seed scripts are guarded to local `_test` databases | `testing/` |

Development runs Vite on port 5173 and the API on port 4000. Vite proxies `/api` to Express. Production Express serves the built SPA. `npm run db:migrate` applies `sql/schema.sql` through `psql`.

## Current entities and relationships

`users` own sessions and activity events. `companies` represent pipeline records and have an optional `assigned_to` user. `contacts` belong to companies. `conversations` are uploaded audio recordings attached to a company and contact. `activity_events` records audit-like actions, and `app_settings` stores branding, pipeline stages, contact statuses, and discovery questions. `lead_imports` and `lead_import_rows` support bulk prospect import.

There is no project entity, project handoff, quotation/document metadata table, developer evaluation, or project progress update entity. A company can hold an `offered_price`; the current company mapper/bootstrap includes the company record for authenticated users.

## Authentication and authorization

The backend roles are `founder`, `admin`, and `sdr`. `founder` and `admin` pass `requireAdmin`; the frontend labels `sdr` as “SDR.” The UI hides Activity, Users, and Settings for SDRs, but this is a broad role split rather than the requested Caller/Developer/Admin model.

Authentication is real server-side cookie authentication, but most business APIs only require a valid login. Record ownership is not consistently enforced:

- `GET /api/bootstrap` returns every company and contact to every authenticated user.
- `GET /api/metrics` computes totals for the whole database for every authenticated user.
- Company/contact creation assigns a company to its creator, but company/contact reads and updates do not consistently scope the record to that owner.
- Activity history and call logs are available to any authenticated user for arbitrary record IDs.
- Recording list/play/presign routes authenticate the user but do not consistently verify that the user owns or is assigned to the related lead.

These are critical gaps for the requested strict separation. Frontend navigation or hidden fields alone cannot enforce it. Every read, write, download, and report must be authorized and scoped in the API.

## Existing API areas

- Authentication and users: `/api/auth/*`, `/api/users*`.
- Instance configuration: `/api/config`, `/api/settings`.
- CRM: `/api/bootstrap`, `/api/metrics`, company/contact CRUD, lead import.
- Activity: daily activity, event timeline, company history, contact call log.
- Recordings: presign, upload completion, list, playback URL, delete.

The existing contact call-log is derived from activity events and status/follow-up/note changes. It is not a dedicated call record with a required outcome, duration, caller-supplied notes, and next action in one immutable call entry. Audio recordings are a separate optional feature and need AWS credentials/bucket configuration.

## UI structure

`src/App.tsx` owns login state, navigation, the shared CRM store, and page selection. `src/components/Sidebar.tsx` and `MobileNav.tsx` obtain pages from `src/lib/nav.ts`. The central `useCrmStore` requests the complete bootstrap dataset and metrics, then supplies it to Dashboard, Pipeline, Contacts, and Import. `CompanyForm` and `ContactForm` edit current records. `Users` creates users with the current backend role list.

## Current limitations against Skylance needs

1. No Developer role or project assignment workspace.
2. No enforced caller-owned lead boundaries.
3. No project lifecycle or caller-to-developer/admin handoff.
4. No quotation/document upload with private project-level authorization.
5. No developer-safe data projection; pricing fields are part of company data.
6. No structured call-log write endpoint dedicated to the caller workflow.
7. Current stage defaults describe a 13-step SaaS sales process.
8. Current admin dashboard/activity is SDR-focused rather than an end-to-end project lifecycle view.

## Repository safety notes

The development seed scripts under `testing/functional/` require `ALLOW_ACTIVITY_SEED=1`, a local host, and a database name containing `_test`. They can clear seeded CRM data. They must not be pointed at the business database `Skylance_CRM`. Schema changes should be reviewed as repeatable, backward-compatible changes because there is no numbered migration runner.
