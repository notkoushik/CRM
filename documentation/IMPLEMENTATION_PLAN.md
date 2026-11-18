# Skylance CRM Implementation Plan

This plan follows the owner-provided customization brief. Work is on `docs/skylance-crm-architecture-audit`.

## Implementation status (2026-11-17)

- Milestone 0: architecture audit complete; `Skylance_CRM` was backed up and the custom-format backup archive was verified before the schema change.
- Milestone 1: in progress. Added Developer role support, legacy SDR → Caller labels, assigned-lead scoping for callers, Admin-wide visibility, and a Developer workspace with no lead access until project assignment exists. Company/contact writes, activity history, call logs, and recording endpoints now enforce role and ownership checks. Added contact creator attribution and safe role constraint migration.
- Verification so far: production build, unit tests, and functional API tests pass. The API tests use a separate local `skylance_crm_test` database. Lint passes with existing repository warnings.
- Not yet implemented: actual project assignment APIs, handoffs, private quotation documents, technical evaluations, project progress, Admin lifecycle dashboard, and final settlement storage/UI. Developers therefore see an empty Assigned Projects workspace until a later milestone adds those features.
- Assumptions used to unblock implementation: both legacy `founder` and `admin` act as Admin; `sdr` remains the stored Caller role; Developers cannot read lead, contact, call, or pricing APIs; technical cost estimates remain out of Developer-facing responses until a specific policy is approved.

## Milestone 0 — Architecture and policy review

- Review this audit and confirm the lead/project lifecycle, role labels, and strict visibility boundaries.
- Confirm whether legacy `founder` maps to Admin, and who may create/assign users.
- Decide whether caller-visible quotation values exist, and whether developer effort/cost estimates are admin-only.
- Back up `Skylance_CRM` and verify restore before the first schema migration.

## Milestone 1 — Secure role and record boundaries

- Add Developer role and Caller display mapping while preserving compatible account records.
- Implement centralized authorization helpers for Admin, Caller-owned lead, and assigned Developer project.
- Scope bootstrap, metrics, company/contact CRUD, call history, recordings, and activity data.
- Return separate safe data projections; prohibit Caller/Developer access to final settlement and developer access to pricing.
- Add test coverage for direct API access and cross-owner/cross-project attempts before feature rollout.

## Milestone 2 — Caller lead workspace

- Configure simple lead stages and contact outcomes.
- Simplify client/lead intake for ad-origin calls and caller assignment.
- Add immutable structured call logging and follow-up queue.
- Add Caller dashboard, My Leads, call history, follow-ups, qualification, and handoff submission.
- Keep existing data columns until compatibility and data-retention decisions are settled.

## Milestone 3 — Admin handoff and assignment

- Add handoff review queue, assignment, approval/rejection/clarification, decision reason, and audit trail.
- Add project creation from an accepted handoff; keep lead pipeline and project delivery states separate.
- Add quotation/client-document metadata and private storage authorization.

## Milestone 4 — Developer workspace

- Add assigned-project-only project list/detail.
- Show required client/project information and explicitly approved documents only.
- Add technical evaluation, clarification request, effort/time estimate, progress updates, and completion handoff.
- Exclude quotation price, settlement, and unassigned-client information at the API layer.

## Milestone 5 — Admin lifecycle and settlement

- Add all-lead/project dashboard with assignments, elapsed time, status history, documents, and activity.
- Add a separate admin-only settlement screen and API.
- Add completion/reopen controls and audit event coverage.

## Milestone 6 — Launch hardening

- Verify access using distinct Caller A, Caller B, Developer A, Developer B, and Admin accounts.
- Verify document URL authorization and expiry, request validation, audit completeness, and backup/restore.
- Run relevant lint/build/unit/API/browser suites when implementation work begins, then document local deployment and account provisioning.

## Proposed initial state machines

Lead stages proposed by the brief: New Lead → Contacted → Follow-up → Qualified → Handoff Submitted → Converted, with Not Interested as a terminal outcome. Confirm whether Converted means “accepted as a project,” and whether a lead can be reopened or produce multiple projects.

Project lifecycle should be separate, for example: Awaiting Admin Assignment → Assigned → In Evaluation → Clarification Required / Evaluated → Approved / Declined → In Progress → Completed. Admin-only larger projects may be created directly without a caller handoff, then assigned to a trusted developer. Confirm whether developers may update project status freely or must propose updates for admin approval.

## First implementation milestone recommendation

After policy review, implement the security foundation and caller workflow in small reviewable increments. Do not start with visual redesign or bulk schema changes: the present global bootstrap and unscoped APIs would expose records across roles, so secure data boundaries must precede adding more user-facing modules.
