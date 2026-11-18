# Exotel and CRM: Complete Scope, Plan, and Setup Guide

**Prepared:** 18 November 2026  
**Purpose:** Define what the CRM and Exotel need for the one-mobile Caller/Admin workflow, which subscription to try, what is already wired in the application, and what remains before live calls.

## 1. Recommended setup

Apply first for Exotel's **Startup plan**. Exotel currently lists ₹6,000 of call/SMS credits for six months, one virtual number, two user licenses, and no setup fee or billing for eligible startups. This matches one Caller account and one Admin account. The offer is subject to eligibility and Exotel approval. [Exotel startup offer and criteria](https://exotel.com/exotel-for-startups/)

Use one Exotel virtual number as the business caller ID and the team's one physical mobile as the shared agent phone. Both app users can start calls, but the call will ring that same handset. The app attributes an outbound call to whoever was signed in when they started it.

After the startup credits expire or are used, compare actual usage with Exotel's regular prepaid options in Section 4 before recharging. The right option depends on call minutes and charges per call leg; credits do not equal a fixed number of calls.

## 2. The phone-number distinction

The flow uses two phone-number values even though the team has only one physical mobile/SIM:

1. **Exotel virtual number / ExoPhone:** business caller ID shown to customers. Included as one virtual number in the startup offer.
2. **Shared mobile number:** the physical handset the Caller/Admin uses. Exotel rings this number first for outbound calls.

The Exotel Connect Two Numbers API calls the `From` number first, then dials the customer at `To`; `CallerId` is the ExoPhone, and `Record=true` enables recording. [Connect Two Numbers API](https://developer.exotel.com/docs/voice-v1/api-reference/connect-two-numbers)

One handset can take one active call at a time. The CRM can identify which user started an outbound call, but the network cannot identify which person physically answered when both roles share one handset. If the app is open under one account while the other person uses the phone outside that session, the CRM cannot attribute that outside call to the correct user automatically.

## 3. Intended Caller and Admin workflow

### Outbound call from a CRM lead

1. Admin assigns a lead to the Caller. Admin may also work any lead directly.
2. Caller or Admin opens a saved contact and chooses **Call via Exotel**.
3. The CRM checks role and lead access, creates a call-history row, and requests the call from Exotel.
4. Exotel calls the shared mobile. After it is answered, Exotel calls the contact and bridges the call using the business ExoPhone caller ID.
5. Exotel records the call and posts the terminal status, duration, and recording URL to the CRM callback.
6. The contact's call history shows who initiated the call, provider status, duration, and recording playback. The user adds key points/next steps as notes in the same call record.
7. Admin can review all lead calls. Caller can review calls attached to leads they are assigned to.

### What an incoming customer call would require

Incoming routing/import is **not part of the current code wiring**. To include it, Exotel needs an incoming call flow attached to the ExoPhone, usually a greeting followed by a Connect action to the shared mobile, with recording enabled. The CRM then needs an inbound callback/import path to match the incoming number to a contact, save unmatched callers for Admin triage, and store the recording/status. Exotel documents incoming Connect routing and recording in its [Connect applet guide](https://developer.exotel.com/docs/voice-v1/applets/connect).

With one shared mobile, inbound calls can ring that handset, but the CRM cannot tell whether Caller or Admin answered. If exact inbound agent attribution is needed, the team will need distinct Exotel agent endpoints or a different agent/device workflow.

## 4. Exotel plans and cost comparison

Exotel publishes the following Business Phone System bundles. Prices below are the amounts shown on its pricing page; they are prepaid bundle prices, not monthly subscriptions. The page does not publish the effective per-minute call tariff, so the included credits cannot be converted to a dependable call count. [Exotel pricing page](https://exotel.com/pricing/business-phone-system/)

| Option | Price shown | Approx. total if 18% GST is added* | Validity | Rental component | Credits | Virtual numbers | User/agent capacity |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Startup offer** | ₹0 stated for eligible approved applicants | ₹0 stated by offer; confirm any later usage/taxes | 6 months | No rental stated | ₹6,000 calls/SMS | 1 | 2 licenses |
| **7-day trial** | Free | Free trial | 7 days | — | ₹500 trial usage | Trial number | Trial account |
| **Dabbler** | ₹9,999 | ₹11,798.82 | 5 months | ₹4,999 | ₹5,000 | 1 | 3 agents |
| **Believer** | ₹19,999 | ₹23,598.82 | 11 months | ₹10,499 | ₹9,500 | 2 | 6 agents |
| **Influencer** | ₹49,499 | ₹58,408.82 | 11 months | ₹10,499 | ₹39,000 | 10 | Unlimited agents |

The bundles state that one credit equals ₹1 and credits are used for calls, SMS, and WhatsApp. They list Voice APIs and call recording among included features. Agent Stream/voice streaming is separately priced and is not required for ordinary click-to-call recording.

**Billing mechanics:** Exotel describes accounts as prepaid wallets. Calls and other usage consume credits; when credit is exhausted, service may stop until recharged. Keep validity active and recharge before expiry: Exotel support says unused balance can be lost after expiration and prepaid payments are not refunded. Exotel support currently describes Indian GST as 18%, subject to change. The gross figures above are arithmetic estimates assuming 18% is added to the whole listed bundle; confirm the actual charge in the checkout/account bill plan because tax treatment and the startup offer may differ. [Exotel prepaid payment terms](https://support.exotel.com/support/solutions/articles/125556-what-are-your-payment-terms-) · [Exotel GST guidance](https://support.exotel.com/support/solutions/articles/126995-all-about-gst-indian-and-international-accounts)

### Cost recommendation for this team

1. **Best starting option:** apply for the Startup offer. It is the closest match to one Caller, one Admin login, one business number, and low initial call volume.
2. **If not approved:** use the 7-day trial to validate the Exotel number and call flow, then choose the smallest regular bundle that Exotel confirms supports the account/API configuration. Dabbler is the lowest listed paid bundle.
3. **Do not select Believer or Influencer yet** for one shared handset and two CRM users unless measured call volume, added phone numbers, or additional agents justify them.

Ask Exotel to confirm in writing: the GST-inclusive amount due, post-credit call rates, whether an outbound bridged call is billed for both legs, what happens to unanswered attempts, credit expiry/top-up terms, and recording retention/access. Exotel explains that a bridged outbound call has two legs and charges can apply when one leg connects even if the overall call is not completed. [Exotel failed-call billing explanation](https://support.exotel.com/support/solutions/articles/3000080256-why-am-i-charged-for-failed-calls-)

## 5. Current application status

The app-side **outbound Exotel integration is wired but not live-configured**:

- The contact call-history UI has a Call via Exotel control for Caller/Admin users.
- The server initiates a recorded outbound call using Exotel Voice v1 and keeps API credentials off the browser.
- Existing role checks apply: Caller is limited to assigned leads; Admin can access all leads.
- An Exotel webhook updates call status, duration, and recording URL.
- Recording playback is served through an authorized CRM endpoint. Exotel remains the recording host; this integration does not copy audio into the CRM's S3 bucket.
- Users can add notes to Exotel call rows. **Speech-to-text transcription, keyword extraction, and AI-generated summaries are not implemented.**
- A production TypeScript/Vite build succeeded. No live Exotel call has been made because account credentials and a provisioned ExoPhone are not configured.
- The schema adds provider fields to `call_logs`. The database migration has not been applied as part of this setup.

The wider Caller-to-Admin handoff and project lifecycle is tracked separately in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). This guide covers the telephony flow and its integration work.

## 6. Development scope and phases

### Phase A — Startup plan and account

- Submit the Exotel startup application.
- Confirm eligibility: Indian startup launched in 2020 or later; Series A or below **or** DPIIT recognized; no previous Exotel billing history.
- Confirm whether Exotel needs startup proof or business KYC documents during approval/onboarding.
- Activate the one ExoPhone, two user licenses, Voice API access, and recording feature.
- Register/verify the shared physical mobile as the Exotel agent endpoint.

### Phase B — CRM and server configuration

- Put Exotel API credentials and number settings in the server's secret environment, never in browser code or Git.
- Set the CRM's public HTTPS URL so Exotel can reach the status callback.
- Generate a long random webhook token and configure the same value in the server environment.
- Apply the additive database schema through the reviewed database migration process.
- Ensure the application host accepts HTTPS callback traffic from Exotel.

### Phase C — Configure and validate outbound calls

- Confirm the account's regional Voice API host with Exotel.
- Confirm the ExoPhone caller ID, the shared mobile, and customer phone-number formatting.
- Make one internal test call, one answered test call, one no-answer test, and one recording playback test.
- Confirm callback status/duration/recording fields arrive and that duplicates do not create duplicate call rows.
- Confirm Caller cannot call an unassigned lead and Admin can call any lead.
- Check the real Exotel bill/credits after those calls before onboarding users.

### Phase D — Production rollout

- Enable the Call via Exotel UI only after the test calls succeed.
- Train Caller/Admin on writing outcomes and notes in the CRM after calls.
- Add a recording notice/greeting appropriate to the business and confirm retention and access policy.
- Monitor credits and bill-plan usage; review the plan after a representative month of calls.

### Phase E — Optional additions

- **Inbound calls:** configure Exotel incoming flow and build CRM call matching, unmatched-call queue, recordings, and Admin review.
- **Transcription and highlights:** choose a speech-to-text provider, define which transcript fields/keywords to save, budget per audio minute, and decide retention before implementing.
- **Move recordings to app storage:** only if required for retention/control; this adds server-side download/copy, S3 object metadata, and lifecycle cleanup.

## 7. Required server settings

Add these values to the deployment environment. Use the regional API host provided for the Exotel account. Mumbai accounts commonly use `api.in.exotel.com`; Singapore uses `api.exotel.com`. [Exotel regional API/authentication reference](https://developer.exotel.com/docs/references/authentication)

```env
EXOTEL_ACCOUNT_SID=
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_CALLER_ID=+91XXXXXXXXXX
EXOTEL_AGENT_PHONE=+91XXXXXXXXXX
EXOTEL_API_HOST=api.in.exotel.com
EXOTEL_PUBLIC_BASE_URL=https://crm.example.com
EXOTEL_WEBHOOK_TOKEN=<long-random-secret>
```

Do not send these secret values in chat. The status callback URL is built as:

```text
https://<EXOTEL_PUBLIC_BASE_URL>/api/webhooks/exotel/<EXOTEL_WEBHOOK_TOKEN>
```

If any required setting is missing, the app reports Exotel as not configured and does not start calls.

## 8. CRM API map

| Method | Application endpoint | Purpose |
|---|---|---|
| `GET` | `/api/exotel/status` | Reports whether the server has complete Exotel configuration; returns no credentials |
| `POST` | `/api/exotel/calls` | Starts recorded outbound call `{ contactId }` |
| `POST` | `/api/webhooks/exotel/:token` | Receives authenticated Exotel terminal callback |
| `GET` | `/api/call-logs?contactId=<uuid>` | Lists authorized call history |
| `PATCH` | `/api/call-logs/:id` | Saves notes on an authorized call record |
| `GET` | `/api/exotel/call-logs/:id/recording` | Authorizes and streams the Exotel recording |

The browser uses the CRM's existing cookie-authenticated API. Exotel uses server-side HTTP Basic credentials for Exotel API requests and a tokenized callback URL for callbacks.

## 9. Security, privacy, and operating rules

- Keep Exotel API key/token in server secrets only. Rotate them if exposed.
- Use HTTPS for callbacks. Validate callback token, account SID, payload, and call ID; deduplicate callback updates.
- Before production, ask Exotel for current webhook source IP ranges and add source-IP verification at the host/firewall if available; the callback token should not be the only control.
- Keep call/recording endpoints role-scoped. Admin sees all; Caller sees assigned leads only; Developer has no call-history access.
- Never expose a raw recording URL in public UI/API responses. Playback must pass through the authenticated CRM recording endpoint.
- Set and communicate a recording notice. Decide who may listen, how long recordings remain available, and how deletion/export requests are handled.
- Keep CRM business outcomes and follow-up notes human-entered until a transcription product and its cost/retention policy are selected.

## 10. Definition of done for the first live release

- Startup offer approved or a paid plan chosen and active.
- ExoPhone and shared physical mobile verified.
- Database schema applied safely with a current backup.
- Server secrets configured and callback reachable over HTTPS.
- Answered, no-answer, failed, callback retry, recording playback, notes, Caller scope, and Admin scope confirmed in a live account.
- Inbound calls and transcription are either explicitly deferred or separately implemented and verified.
