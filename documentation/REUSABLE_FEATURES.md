# Reusable Features for Skylance CRM

This inventory separates directly reusable features from pieces that need configuration or changes.

| Classification | Existing capability | Skylance fit / required treatment |
|---|---|---|
| Reuse with little change | Login, password hashing, secure HttpOnly auth cookie, CSRF protection, session heartbeat | Keep the security model. Add the new role to validation and test role-specific sessions. |
| Reuse with little change | Company and contact records, phone/email/location, notes, assigned user, follow-up date | Use these as lead/client source records, after deciding whether one company equals one client lead or whether repeat projects need separate lead records. |
| Configure | `app_settings` stages and contact statuses | Replace the 13 sales stages and status list with the Skylance workflow once status semantics are agreed. Configuration alone does not create handoff behavior. |
| Reuse and extend | Activity events and session tracking | Retain an admin audit trail; add explicit project/handoff/document/evaluation events. Ensure callers/developers cannot read unrelated event history. |
| Reuse and extend | Contact call-log UI and event history | Reuse display patterns; implement a dedicated immutable `call_logs` record for outcome, call time, duration, notes, follow-up, and user. |
| Reuse conditionally | S3 presigned upload/download helpers | Reuse the private storage approach for quotations and client documents, but use a separate project-document entity, allowed MIME/size limits, authorization checks, and non-public object keys. Current AWS setup is only for recordings. |
| Modify | Existing user management | Admin should create Caller, Developer, and Admin accounts. The current `sdr` role can remain the stored role while being shown as Caller; add `developer`; reserve founder/admin semantics deliberately. |
| Modify | Dashboard, pipeline, forms, navigation | Build role-specific task views on existing React patterns and shared form components. Remove sales-specific concepts from the caller-facing experience without deleting unrelated columns prematurely. |
| Do not reuse as-is | Current complete-dataset `useCrmStore` and `/api/bootstrap` behavior | Replace broad bootstrap reads with role-aware endpoints and field projections. Current behavior discloses all leads to any logged-in user. |
| Do not reuse as-is | Current global metrics and recordings access | Scope metrics, recordings, and history by caller ownership or developer project assignment; admin can see all. |
| Build new | Project handoff, developer assignment/evaluation, project updates, quotation/document metadata | Core new domain module. Design entities and transitions before UI work. |
| Build new | Admin-only settlement/pricing view | Keep final settlement and sensitive commercial fields out of all caller/developer responses, not just hidden controls. Add a dedicated admin-only API projection and audits. |

## Existing useful implementation references

- Auth/session: `server/auth.ts`, `server/activity.ts`, `src/hooks/useAuth.ts`.
- Lead/contact UI: `src/components/CompanyForm.tsx`, `src/components/ContactForm.tsx`, `src/components/Contacts.tsx`.
- Call history: `server/activityRoutes.ts`, `src/components/ContactCallLog.tsx`, `src/lib/callLog.ts`.
- Pipeline config: `server/settings.ts`, `src/components/SettingsPage.tsx`, `src/defaults.ts`.
- Recording storage: `server/s3.ts`, `server/conversations.ts`.
- Existing event history: `server/activity.ts`, `server/activityRoutes.ts`.
- API client and cookie CSRF: `src/lib/api.ts`.
