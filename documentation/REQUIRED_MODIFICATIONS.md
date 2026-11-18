# Required Modifications

No code changes are made by this audit. The items below map Skylance requirements to repository areas and identify the security-sensitive work.

## Roles and access enforcement

| Area | Files | Required modification |
|---|---|---|
| Role model | `server/auth.ts`, `src/types.ts`, `sql/schema.sql` | Add `developer`; retain `sdr` as the compatible stored role for Caller if desired. Update the database CHECK constraint safely for an existing database. Define whether `founder` is a legacy synonym for Admin or remove it only through an explicit migration. |
| User creation | `server/app.ts`, `src/components/Users.tsx` | Admin creates the three requested user types. Validate roles server-side and use user-facing labels Caller/Developer/Admin. |
| API guards | `server/auth.ts`, route modules | Add explicit role and assignment checks. A caller may access only assigned leads; a developer only assigned projects; Admin may access all. Return 403/404 consistently without leaking existence. |
| Bootstrap/read APIs | `server/app.ts`, `src/hooks/useCrmStore.ts` | Replace global company/contact bootstrap and metrics with role-scoped responses. Do not send price, settlement, or unrelated client fields to non-admin roles. |
| Mutations | `server/app.ts`, `server/activityRoutes.ts`, `server/conversations.ts` | Check the target lead/project assignment on every edit, call-log access, history read, upload, playback, and download. Prevent changing `assigned_to`, ownership, role, or protected fields through mass assignment. |
| Navigation | `src/App.tsx`, `src/lib/nav.ts`, `src/components/Sidebar.tsx`, `src/components/MobileNav.tsx` | Show only each role’s workspace. Treat this as usability only; server guards remain authoritative. |

## Caller workflow

- Replace default stage list through `src/defaults.ts`/`app_settings`; agree exact stage transitions and who may perform them.
- Adapt `src/components/CompanyForm.tsx` and `ContactForm.tsx` for ad-origin lead intake, caller, client, business type, initial requirements, and contact details.
- Create a dedicated call-log write/read module instead of treating a status-change event as a call record.
- Add caller dashboard, My Leads, Call History, Follow-ups, and Submitted Leads views; reuse existing navigation/store patterns but request only authorized data.
- Preserve the original lead/caller data through handoff; handoff should reference the lead, not copy divergent client records.

## Developer and handoff workflow

- Add project/handoff CRUD, Admin assignment, developer workspace, technical evaluation, clarification return, and progress updates.
- Define state transitions on the server (for example: submitted → assigned → in review → clarification required / evaluated → approved or declined → in progress → completed). The plan’s lead pipeline and project lifecycle should be separate state machines.
- Add an authorized document upload flow for quotations and client documents. Keep files private; check project assignment at presign and download time. Store metadata and audit events in PostgreSQL, never public unrestricted URLs.
- Enforce field-level permissions: developers can submit technical estimates as needed by Admin, but may not see the client-facing quotation price or final settlement. Clarify whether “developer estimated cost” is allowed to Admin only or also visible to sales.

## Admin and settlement

- Build an Admin overview spanning lead acquisition, handoffs, assignments, project time/status, documents, work history, and completion.
- Add a separately protected settlement entity/API/view visible only to Admin. Admin-only must be enforced by route policy and response shape, not by the UI.
- Record changes to assignments, status decisions, documents, approval/rejection reasons, and settlement in an append-only or otherwise tamper-resistant audit history.
- Decide whether “Admin” means both current `admin` and `founder`, and whether there is one owner/admin or multiple admins.

## Database and upgrades

`sql/schema.sql` is idempotent, but edits to an existing role CHECK constraint need an explicit `DROP/ADD` upgrade sequence. Proposed new entities and indexes must support existing installations and avoid deleting legacy columns. Before a migration is applied to `Skylance_CRM`, create and verify a database backup. Never use the functional test reset/seed scripts against this database.
