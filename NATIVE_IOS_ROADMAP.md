# Public Gold CRM — Native iOS App Roadmap

End-to-end roadmap for building a **native iOS app** (Swift / SwiftUI) for [Public Gold CRM](https://www.publicgolds.com), backed by the existing Next.js + Supabase web platform.

> **Stack decision:** Native iOS first. Android is a separate future phase (Kotlin / Jetpack Compose recommended for parity).
>
> **Related docs:** `IOS_APP_DEVELOPMENT_GUIDE.md` (narrow Excel/Contacts scope, partially outdated), `PWA_SETUP.md`, `docs/CAMPAIGNS.md`

---

## Table of contents

1. [Vision & goals](#1-vision--goals)
2. [Current state](#2-current-state)
3. [Target architecture](#3-target-architecture)
4. [Phase 0 — Foundation (Weeks 1–3)](#phase-0--foundation-weeks-13)
5. [Phase 1 — Auth & shell MVP (Weeks 4–7)](#phase-1--auth--shell-mvp-weeks-47)
6. [Phase 2 — Core CRM (Weeks 8–12)](#phase-2--core-crm-weeks-812)
7. [Phase 3 — Push & engagement (Weeks 13–15)](#phase-3--push--engagement-weeks-1315)
8. [Phase 4 — Billing & entitlements (Weeks 16–18)](#phase-4--billing--entitlements-weeks-1618)
9. [Phase 5 — WhatsApp integration (Weeks 19–23)](#phase-5--whatsapp-integration-weeks-1923)
10. [Phase 6 — Campaigns & automation (Weeks 24–28)](#phase-6--campaigns--automation-weeks-2428)
11. [Phase 7 — Tools & integrations (Weeks 29–32)](#phase-7--tools--integrations-weeks-2932)
12. [Phase 8 — Polish, QA & App Store (Weeks 33–36)](#phase-8--polish-qa--app-store-weeks-3336)
13. [Phase 9 — Post-launch & Android prep (Ongoing)](#phase-9--post-launch--android-prep-ongoing)
14. [Backend work checklist](#backend-work-checklist)
15. [iOS project structure](#ios-project-structure)
16. [Third-party services](#third-party-services)
17. [Testing strategy](#testing-strategy)
18. [Risks & mitigations](#risks--mitigations)
19. [Success metrics](#success-metrics)
20. [Appendix — Feature parity matrix](#appendix--feature-parity-matrix)
21. [Mac Mini + Xcode — what to bring & what's still missing](#21-mac-mini--xcode--what-to-bring--whats-still-missing)

---

## 1. Vision & goals

### Product vision

Give Public Gold dealers a **first-class mobile experience** for daily CRM work: manage customers, monitor WhatsApp sessions, receive push alerts, and check subscription status — without relying on a mobile browser or PWA.

### Design principles

- Follow [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- Native navigation (tab bar + navigation stack), not a wrapped website
- Offline-aware where it adds value (cached customer list, graceful error states)
- Secure by default (Keychain, no plaintext passwords, certificate pinning optional)
- Feature parity with web **incrementally**, not all at once

### Personas (v1 scope)

| Persona | In scope v1? | Notes |
|---------|--------------|-------|
| **Dealer** (`profiles.role = user`) | ✅ Yes | Primary audience |
| **Platform admin** (`profiles.role = admin`) | ⚠️ Phase 7+ | Optional; can use web admin initially |
| **PG Gold Saver customer** | ❌ No | Separate OTP portal; different app if needed |

### Out of scope for v1

- Visual workflow editor (React Flow) — defer or use embedded WebView
- Chrome extension features
- Full admin panel
- Customer portal (PG Gold Saver)

---

## 2. Current state

### What exists today

| Asset | Status |
|-------|--------|
| Web app (Next.js 15) | ✅ Production at `publicgolds.com` |
| Supabase Auth + Postgres + RLS | ✅ Shared backend |
| 144+ REST API routes under `/api/*` | ✅ Primary integration surface |
| PWA + Web Push (VAPID) | ✅ Web only — **not usable for native iOS** |
| iOS development guide | ⚠️ Outdated — Excel/Contacts only |
| Native iOS codebase | ✅ `ios/` (XcodeGen + SwiftUI) — Phases 0–7 largely built |
| App icon + Netflix-style splash | ✅ Brand purple CRMPG mark |
| Home Screen widgets + CRM keyboard | ✅ Ahead of roadmap (Phase 9 extras) |
| Bearer auth on dealer `/api/*` | ✅ `requireUserApi` + supabase bearer helpers |
| `ios_push_devices` + register API | ✅ Migration + routes; **APNs send still pending** |
| APNs send pipeline | ❌ Client no-op; no server sender yet |

### Key integration constraint

The web app uses **cookie-based Supabase SSR sessions**. Native iOS must use **Bearer token auth** (`Authorization: Bearer <access_token>`) for API calls. Some routes may need backend updates to accept mobile tokens reliably.

---

## 3. Target architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Native iOS App                        │
│  SwiftUI · MVVM · async/await · URLSession               │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │   Auth   │ │ Customers│ │ Dashboard│ │  WhatsApp  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘  │
│       │            │            │              │         │
│       └────────────┴────────────┴──────────────┘         │
│                         │                                │
│              APIClient + Supabase Swift SDK              │
└─────────────────────────┼────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   Supabase Auth    Next.js /api/*    Supabase DB
   (direct SDK)     (REST + Bearer)   (RLS reads)
          │               │
          └─────── Postgres (shared) ───────┘
```

### Recommended iOS stack

| Layer | Choice |
|-------|--------|
| Language | Swift 6+ |
| UI | SwiftUI |
| Architecture | MVVM + `@Observable` / `@MainActor` |
| Auth | [supabase-swift](https://github.com/supabase/supabase-swift) |
| Google Sign-In | [GoogleSignIn-iOS](https://github.com/google/GoogleSignIn-iOS) |
| Networking | URLSession + Codable (or [Alamofire](https://github.com/Alamofire/Alamofire) optional) |
| Local storage | Keychain (tokens), SwiftData or Core Data (cache) |
| Push | UserNotifications + APNs |
| Deep links | Universal Links + `onOpenURL` |
| Images | AsyncImage + Nuke (optional) |
| Maps | MapKit (customer locations) |
| Dependency injection | Factory or manual `@Environment` |

### Repository layout (new)

Create a separate repo or monorepo folder:

```
crmpg-ios/
├── CRMPGApp/                 # Xcode project
│   ├── App/
│   ├── Features/
│   │   ├── Auth/
│   │   ├── Dashboard/
│   │   ├── Customers/
│   │   ├── Billing/
│   │   ├── WhatsApp/
│   │   ├── Campaigns/
│   │   └── Profile/
│   ├── Core/
│   │   ├── Networking/
│   │   ├── Auth/
│   │   ├── Models/
│   │   └── DesignSystem/
│   └── Resources/
├── CRMPGAppTests/
├── CRMPGAppUITests/
└── fastlane/                 # CI/CD + TestFlight
```

---

## Phase 0 — Foundation (Weeks 1–3)

**Goal:** Backend ready for mobile clients; iOS project scaffolded; team aligned.

### 0.1 Product & design

- [x] Define v1 feature list and acceptance criteria *(this roadmap)*
- [x] User flows: login → dashboard → customers → detail → actions
- [ ] Wireframes in Figma (iPhone 15 Pro baseline, Dynamic Type, Dark Mode)
- [x] Design system: colors, typography, spacing aligned with web brand
- [x] App icon + launch screen assets *(CRMPG purple icon + Netflix-style splash)*

### 0.2 Apple & Google developer setup

- [ ] Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
- [x] Create App ID: `com.publicgolds.crmpg` (debug: `.debug`)
- [ ] Enable capabilities: Push Notifications, Associated Domains, Sign in with Apple (if required)
- [ ] Create APNs key (.p8) in Apple Developer portal
- [ ] Register Google OAuth iOS client in Google Cloud Console
- [ ] Add iOS redirect URL to Supabase Auth → Google provider settings
- [ ] Configure Supabase Auth redirect URLs for mobile deep links

### 0.3 Backend — mobile auth readiness

- [x] Audit all `/api/*` routes used by v1 — confirm Bearer tokens (not only cookies)
- [x] Add or document mobile auth helper: extract user from `Authorization` header (`requireUserApi`)
- [x] Add `GET /api/mobile/config` — app version, min supported version, feature flags
- [x] CORS: not needed for native app; cookie-only assumptions removed on mobile-used routes
- [ ] Rate limiting review for mobile traffic patterns

### 0.4 Backend — APNs foundation

- [x] Migration: `ios_push_devices` table (`062_ios_push_devices.sql`)
  ```sql
  -- user_id, device_token, apns_environment, bundle_id, created_at, last_seen_at
  ```
- [x] `POST /api/push/ios/register` — save device token (authenticated)
- [x] `DELETE /api/push/ios/register` — logout / uninstall cleanup
- [ ] APNs send service (Node on Vercel or Supabase Edge Function)
- [ ] Link push payloads to existing deep-link routes (`app/lib/push/navigate-routes.ts`)
- [ ] Admin broadcast: extend `/api/admin/push/broadcast` to send APNs + Web Push

### 0.5 iOS project bootstrap

- [x] Create Xcode project (SwiftUI, iOS 17+ via XcodeGen)
- [x] Add SPM dependencies: supabase-swift *(GoogleSignIn-iOS still pending)*
- [x] Environment config: Debug / Release xcconfig + Secrets
- [x] `APIClient` with Bearer token injection + 401 refresh retry
- [x] Keychain wrapper for session storage
- [x] Basic app shell: TabView

### 0.6 DevOps

- [x] Git repo + branch strategy
- [ ] Fastlane setup: build, TestFlight upload
- [ ] CI: GitHub Actions — lint, unit tests, archive on tag
- [x] `.env` / xcconfig for Supabase URL, anon key, API base URL

**Phase 0 exit criteria:** ✅ Met for scaffold + auth + Bearer API. Remaining: Apple/Google portal setup, APNs send, Fastlane/CI.

---

## Phase 1 — Auth & shell MVP (Weeks 4–7)

**Goal:** Dealers can log in, see a dashboard shell, and switch accounts.

### 1.1 Authentication screens

- [x] Login — email + password *(premium branded UI + password eye toggle)*
- [ ] Login — Google OAuth (ASWebAuthenticationSession or GoogleSignIn SDK)
- [ ] Register (if enabled for mobile)
- [x] Forgot password → email link (opens Safari / in-app browser)
- [x] Logout
- [x] Session refresh on app launch and foreground

### 1.2 Saved accounts (multi-account)

Web stores accounts in `localStorage` (`crmpg_saved_accounts_v1`). iOS equivalent:

- [x] Keychain-backed saved account list (max 5)
- [x] Account picker on login screen
- [x] Switch account via password or refresh/access tokens in Keychain
- [ ] **Do not store plaintext passwords** — prefer refresh tokens only *(passwords still optionally cached for one-tap switch)*
- [x] Avatar + PG code display per account

### 1.3 Onboarding gates (match web)

- [ ] Google-only user → prompt create password (`profiles` + Supabase RPC)
- [x] Profile completion sheet: PG code, phone, PBO username *(dismissible Continue)*
- [ ] Block dashboard until required fields complete (same rules as web)

### 1.4 App shell & navigation

- [x] Tab bar: **Home**, **Customers**, **WhatsApp**, **Profile**
- [x] NavigationStack per tab
- [x] Loading / error / empty states (reusable components)
- [x] Pull-to-refresh pattern

### 1.5 Dashboard (read-only v1)

- [x] `GET /api/saas/me` — plan name, trial expiry, write access
- [x] Service tiles mirroring web dashboard (deep link or navigate)
- [x] WAHA session status summary (connected / disconnected badge)
- [x] Trial / subscription expiry banner *(via billing + dashboard)*

**Phase 1 exit criteria:** ✅ Mostly met. Remaining: Google Sign-In, hard onboarding gate, password-less Keychain switch.

---

## Phase 2 — Core CRM (Weeks 8–12)

**Goal:** Full customer management — the highest-value daily workflow.

### 2.1 Customer list

- [x] Customer list with search *(Supabase RLS + API hybrid; limit 200)*
- [x] Filters: sales journey, account status, CRM tags *(follow-up queue pending)*
- [x] Sort options
- [ ] Infinite scroll or page-based loading
- [x] Swipe actions (call, WhatsApp — if number available)

### 2.2 Customer detail

- [x] Full profile detail
- [x] Edit core fields inline or form sheet
- [x] CRM tags: view + add/remove
- [x] Sales journey stage updates
- [ ] Follow-up activities timeline
- [x] Account status badges

### 2.3 Customer create & bulk

- [x] Add customer form
- [ ] Duplicate detection feedback
- [ ] Bulk actions where API supports (`/api/customers/bulk`)

### 2.4 Chat history (read-only v1)

- [x] `GET /api/customers/[id]/chat-history` — message list
- [ ] Profile picture (`/api/customers/[id]/profile-picture`)
- [ ] Pull older messages

### 2.5 AI tag analysis

- [ ] Trigger analyze tags (`POST /api/customers/[id]/analyze-tags`)
- [ ] Show suggested tags with accept/dismiss

### 2.6 Offline & performance

- [ ] Cache last customer list (SwiftData / file cache) *(keyboard App Group cache only)*
- [ ] Stale-while-revalidate on network return
- [x] Skeleton loaders + optimistic UI for edits *(list/dashboard skeletons)*

**Phase 2 exit criteria:** ✅ Core path met (search/view/edit/tag). Remaining: paging, follow-up timeline, AI tags, offline list cache.

---

## Phase 3 — Push & engagement (Weeks 13–15)

**Goal:** Native push notifications with deep links into app screens.

### 3.1 APNs client integration

- [ ] Request notification permission (contextual prompt after login)
- [ ] Register device token → `POST /api/push/ios/register` *(API ready; iOS client is no-op)*
- [ ] Handle token refresh
- [ ] Unregister on logout *(hooks exist; registration not live)*

### 3.2 Notification handling

- [ ] Foreground banner display
- [x] Custom URL scheme deep links (`crmpg://customers?…`) from widgets
- [ ] Tap push → deep link to route (match `PUSH_NAVIGATE_ROUTES`)
- [ ] Universal Links: `https://www.publicgolds.com/customers` opens app if installed

### 3.3 Backend notification types

- [ ] Campaign completion alerts
- [ ] Trial expiry reminders
- [ ] WhatsApp session disconnected
- [ ] PG sync job complete *(local TAC alerts exist; not remote APNs)*
- [ ] Admin broadcast (Pro dealers)

### 3.4 Settings

- [x] Notification preferences screen *(explains deferred APNs setup)*
- [ ] Link to iOS Settings if permission denied

**Phase 3 exit criteria:** ❌ Not met — register API + table exist; client registration + APNs send still pending.

---

## Phase 4 — Billing & entitlements (Weeks 16–18)

**Goal:** Dealers can view plan status and upgrade to Pro from the app.

### 4.1 Subscription status

- [x] `GET /api/saas/me` — full entitlements display
- [x] Active campaign count vs limit *(via billing / dashboard)*
- [x] Wasender availability (Pro paid) *(provider-aware WhatsApp UI)*
- [x] Trial countdown UI

### 4.2 Upgrade flow

- [x] Bayarcash checkout — in-app Safari sheet with ios-handoff when needed
- [ ] Deep link return: `/payment/complete` → Universal Link → in-app success screen
- [ ] `POST /api/saas/sync-payment` after return
- [x] Refresh entitlements *(manual / on appear)*

### 4.3 Start Pro trial

- [x] `POST /api/saas/start-trial` with confirmation
- [x] Post-trial WhatsApp provider messaging (WAHA during trial)

### 4.4 Gating

- [ ] Disable write actions when `hasWriteAccess === false` *(flag shown, not enforced)*
- [ ] Upgrade prompts on gated features (match web copy)

**Phase 4 exit criteria:** ✅ View plan + trial + Safari checkout. Remaining: payment return deep link, write gating.

---

## Phase 5 — WhatsApp integration (Weeks 19–23)

**Goal:** Monitor and manage WhatsApp sessions from the phone.

### 5.1 Provider resolution

- [x] `GET /api/whatsapp/provider` — show WAHA vs Wasender label
- [x] Entitlement-aware UI (Pro trial = WAHA, Pro paid = Wasender)

### 5.2 Session list & status

- [x] `GET /api/waha/sessions` — list sessions with live status
- [x] Auto-relink on empty (backend `relinkWasenderSessionsForUser`)
- [x] Status badges: WORKING, SCAN_QR, STOPPED

### 5.3 Session lifecycle

- [x] Create session (`POST /api/waha/sessions`) — phone number input
- [x] QR code display (`GET /api/waha/sessions/[session]/qr`)
- [x] Pairing code flow (`POST .../request-code`) for WhatsApp linked devices
- [x] Start / stop session
- [x] Delete session with confirmation

### 5.4 Send test message

- [x] Simple compose sheet → `POST /api/waha/send`

### 5.5 Wasender-specific UX

- [x] Connected state without QR when session re-linked after renewal
- [ ] Clear error when duplicate session exists on Wasender *(partial messaging only)*

**Phase 5 exit criteria:** ✅ Met for core WAHA flows.

---

## Phase 6 — Campaigns & automation (Weeks 24–28)

**Goal:** View and manage campaigns; defer visual editor to WebView or v2.

### 6.1 Campaign list

- [x] `GET /api/campaigns` — list with status filters
- [x] Pause / resume / archive actions

### 6.2 Campaign detail (read-only analytics v1)

- [x] Enrollment stats, send progress, failure counts *(API or fallback messaging)*
- [x] Audience summary (count, filters applied)

### 6.3 Campaign create (simplified)

- [x] Option A: **Safari / sealed ios-handoff** to web workflow builder
- [ ] Option B: Template-based create (platform defaults from admin)
- [x] Pass session to web via ios-handoff + hash fallback (`AuthenticatedWebSession`)

### 6.4 Workflow editor (native — v2+)

- [ ] Port React Flow → not recommended for v1
- [ ] Native node list + step configuration if needed long-term

**Phase 6 exit criteria:** ✅ Met via list/detail + web create handoff.

---

## Phase 7 — Tools & integrations (Weeks 29–32)

**Goal:** Secondary features dealers use on web.

### 7.1 PG Business Center sync

- [x] Trigger sync job (`POST /api/pg-sync/jobs`)
- [x] Poll status (`GET /api/pg-sync/status`)
- [ ] Queue badge + completion push (Phase 3)

### 7.2 Lucky draw

- [x] List dealer pages
- [x] View entrant stats
- [x] Share public link (ShareLink)

### 7.3 Excel processor

- [x] Document picker (`.xlsx`, `.csv`)
- [x] Upload → `POST /api/excel/upload`
- [ ] Row processing → `POST /api/openai/process-row` (web Safari for full AI pipeline)
- [x] Progress UI + export/download (upload status + web handoff)

### 7.4 Google Contacts import

- [ ] Google OAuth scope for contacts (deferred with Google Sign-In)
- [ ] `GET/POST /api/google-contacts/*`
- [x] Import progress + result summary (Safari → `/excel-processor`)

### 7.5 Profile & settings

- [x] Full profile edit (PG code, phone, PBO, Gmail fallback)
- [x] Avatar upload (URL field; camera upload later)
- [x] Extension download link (Safari)
- [x] App version, legal links (Privacy Policy)

### 7.6 Maps

- [x] Customer location on MapKit (Apple Maps search from `location` text; no lat/lng column yet)

**Phase 7 exit criteria:** Power users can run sync, lucky draw, and excel tools from phone.

---

## Phase 8 — Polish, QA & App Store (Weeks 33–36)

**Goal:** Production-ready release on the App Store.

### 8.1 UX polish

- [ ] HIG audit: touch targets, Dynamic Type, VoiceOver labels
- [ ] Dark Mode full pass
- [ ] Haptic feedback on key actions
- [ ] Smooth transitions (matched geometry, spring animations)
- [ ] iPad layout (optional — regular size class)

### 8.2 Security review

- [ ] Keychain-only token storage
- [ ] Certificate pinning (optional, document tradeoffs)
- [ ] Jailbreak detection (optional)
- [ ] No secrets in app binary (use xcconfig / remote config)
- [ ] Privacy Nutrition Labels draft

### 8.3 Testing

- [ ] Unit tests: ViewModels, APIClient, parsers
- [ ] UI tests: login flow, customer list, critical paths
- [ ] TestFlight beta with 10–20 dealers
- [ ] Device matrix: iPhone SE, 15, 15 Pro Max; iOS 17, 18
- [ ] Network failure / airplane mode scenarios

### 8.4 App Store submission

- [ ] App Store Connect listing: name, subtitle, description, keywords
- [ ] Screenshots (6.7", 6.5", 5.5" if supporting older)
- [ ] App Preview video (optional)
- [ ] Privacy policy URL: `https://www.publicgolds.com/privacy`
- [ ] Support URL + contact email
- [ ] Age rating questionnaire
- [ ] Export compliance
- [ ] Review notes for Apple (test account credentials)

### 8.5 Launch

- [ ] Phased rollout (TestFlight → 10% → 100%)
- [ ] In-app “What’s new” for first open after update
- [ ] Web dashboard banner: “Download the iOS app”
- [ ] Monitor Crashlytics / Xcode Organizer crashes

**Phase 8 exit criteria:** App approved on App Store; dealers can download and use v1.

---

## Phase 9 — Post-launch & Android prep (Ongoing)

### 9.1 Post-launch (Weeks 37+)

- [ ] Crash & ANR monitoring (Firebase Crashlytics or Sentry)
- [ ] Analytics (privacy-respecting): screen views, feature adoption
- [ ] User feedback channel (in-app form or TestFlight)
- [ ] Bi-weekly releases for bug fixes
- [ ] Feature flags for gradual rollout

### 9.2 v1.1 / v1.2 backlog

- [x] Widgets: Account Status (small/medium) + dealer intent *(shipped early)*
- [x] System keyboard extension: mini-CRM search/edit/templates *(shipped early)*
- [ ] Siri Shortcuts: “Show my customers”
- [ ] Share extension: add contact from share sheet
- [ ] iPad-optimized layout
- [ ] Native campaign workflow editor (if demand)

### 9.3 Admin app (optional)

- [ ] Separate target or role-gated section
- [ ] Push broadcast, user management, media library
- [ ] Lower priority — web admin sufficient initially

### 9.4 Android roadmap (future)

When iOS v1 is stable:

1. Kotlin + Jetpack Compose
2. Reuse same REST APIs + Supabase Kotlin SDK
3. FCM instead of APNs (extend backend push service)
4. Shared OpenAPI spec / API client generation from same source
5. Estimated: 60–70% backend reuse, 0% UI reuse

---

## Backend work checklist

Consolidated server-side tasks across all phases:

| # | Task | Phase | Priority | Status |
|---|------|-------|----------|--------|
| 1 | Bearer token auth audit on all mobile-used routes | 0 | P0 | ✅ Done (`requireUserApi`) |
| 2 | `ios_push_devices` table + register/unregister API | 0 | P0 | ✅ Done |
| 3 | APNs send service + admin broadcast extension | 0–3 | P0 | ❌ Pending |
| 4 | Universal Links / apple-app-site-association | 3 | P0 | ❌ Pending |
| 5 | `GET /api/mobile/config` (version gate) | 0 | P1 | ✅ Done |
| 6 | Payment return deep link verification | 4 | P0 | ❌ Pending |
| 7 | WebView auth bridge for campaign editor | 6 | P1 | ✅ Done (ios-handoff) |
| 8 | OpenAPI 3.0 spec export for `/api/*` | 0 | P1 | ❌ Pending |
| 9 | Push: link `user_id` on all subscription types | 3 | P0 | ❌ Pending |
| 10 | Rate limits + mobile User-Agent logging | 0 | P2 |

### Universal Links setup

Host at `https://www.publicgolds.com/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAMID.com.publicgolds.crmpg",
      "paths": [
        "/dashboard/*",
        "/customers",
        "/customers/*",
        "/dashboard/billing",
        "/waha-integration",
        "/dashboard/campaigns/*",
        "/payment/complete"
      ]
    }]
  }
}
```

---

## iOS project structure

```
Features/
├── Auth/
│   ├── LoginView.swift
│   ├── RegisterView.swift
│   ├── AccountPickerView.swift
│   └── AuthViewModel.swift
├── Dashboard/
│   ├── DashboardView.swift
│   ├── ServiceTile.swift
│   └── DashboardViewModel.swift
├── Customers/
│   ├── CustomerListView.swift
│   ├── CustomerDetailView.swift
│   ├── CustomerFormView.swift
│   ├── ChatHistoryView.swift
│   └── CustomersViewModel.swift
├── WhatsApp/
│   ├── SessionsListView.swift
│   ├── QRCodeView.swift
│   └── WhatsAppViewModel.swift
├── Billing/
│   ├── BillingView.swift
│   └── BillingViewModel.swift
├── Campaigns/
│   ├── CampaignListView.swift
│   └── CampaignWebEditorView.swift   # WKWebView bridge
└── Profile/
    ├── ProfileView.swift
    └── OnboardingSheet.swift

Core/
├── Networking/
│   ├── APIClient.swift
│   ├── APIEndpoint.swift
│   └── AuthInterceptor.swift
├── Auth/
│   ├── SupabaseManager.swift
│   └── KeychainStore.swift
├── Models/
│   ├── Customer.swift
│   ├── Subscription.swift
│   └── WhatsAppSession.swift
└── DesignSystem/
    ├── Colors.swift
    ├── Typography.swift
    └── Components/
```

---

## Third-party services

| Service | iOS integration | Backend env |
|---------|-------------------|---------------|
| Supabase Auth | supabase-swift | `NEXT_PUBLIC_SUPABASE_URL`, anon key |
| Google Sign-In | GoogleSignIn-iOS | Google OAuth iOS client ID |
| REST API | URLSession → `publicgolds.com` | Existing Vercel deployment |
| APNs | UserNotifications | APNs .p8 key, Team ID, Key ID |
| Bayarcash | Safari checkout + deep link | Existing webhook |
| OpenAI | Via `/api/openai/*` only | Server-side key |
| Wasender / WAHA | Via `/api/waha/*` only | Server-side keys |
| Crashlytics | Firebase iOS SDK | Firebase project |

---

## Testing strategy

| Layer | Tool | Coverage target |
|-------|------|-----------------|
| Unit | XCTest | ViewModels, parsers, mappers — 70%+ |
| UI | XCUITest | Login, customer CRUD, checkout happy path |
| API | Integration tests against staging | Critical endpoints |
| Manual | TestFlight | Full regression before each release |
| Performance | Instruments | Scroll FPS, memory on customer list |
| Accessibility | Accessibility Inspector | All primary screens |

### Staging environment

- Supabase branch or staging project
- Vercel preview deployment
- Separate APNs sandbox environment
- Test dealer accounts with known plan states (free, trial, pro)

---

## Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| API routes assume cookies only | Auth fails on iOS | Phase 0 audit; fix before feature work |
| Workflow editor too complex to native-port | Delay campaigns feature | WKWebView embed for v1 |
| Wasender QR on iOS WebView vs native | Bad UX | Native QR from API image/string |
| App Store rejection (WhatsApp automation) | Launch blocked | Clear description; business use; no spam |
| Bayarcash mobile checkout friction | Low conversion | Test SFSafariViewController flow early |
| Push without user_id linkage | Wrong targeting | New APNs schema with user_id FK |
| Pro renewal wipes WAHA sessions | Support tickets | Already fixed in web; verify mobile relink |
| Two codebases drift | Feature parity gap | Shared API contract (OpenAPI); feature flags |

---

## Success metrics

| Metric | Target (90 days post-launch) |
|--------|------------------------------|
| App Store downloads | 30% of active web dealers |
| DAU / MAU ratio | ≥ 40% |
| Crash-free sessions | ≥ 99.5% |
| Customer list load time | < 2s on 4G |
| Push opt-in rate | ≥ 60% of app users |
| Pro upgrade from app | Track vs web baseline |
| App Store rating | ≥ 4.5 stars |

---

## Appendix — Feature parity matrix

| Web feature | iOS v1 | iOS v2+ | Notes |
|-------------|--------|---------|-------|
| Login (email, Google) | ✅ | | |
| Saved accounts | ✅ | | Keychain |
| Dashboard | ✅ | | |
| Customers CRM | ✅ | | Core MVP |
| Chat history | ✅ read | Send | |
| Campaigns list | ✅ | | |
| Workflow editor | WebView | Native | |
| WhatsApp sessions | ✅ | | QR native |
| Billing / Bayarcash | ✅ | | Safari checkout |
| Push notifications | ✅ APNs | | New backend |
| PG Business Center sync | ✅ | | Trigger + monitor |
| Lucky draw | ✅ | | |
| Excel processor | ✅ | | |
| Google Contacts | ✅ | | |
| Google Ads | ❌ | ✅ | Niche |
| Admin panel | ❌ | ⚠️ | Web only v1 |
| Chrome extension | N/A | N/A | Desktop only |
| PWA install | N/A | N/A | Web only |
| Customer portal | ❌ | ❌ | Separate product |

---

## Timeline summary

| Phase | Duration | Status (Jul 2026) |
|-------|----------|-------------------|
| 0 — Foundation | 3 weeks | ✅ Mostly done — portal + APNs send + CI left |
| 1 — Auth & shell | 4 weeks | ✅ Mostly done — Google Sign-In left |
| 2 — Core CRM | 5 weeks | ✅ Core done — paging / AI / offline left |
| 3 — Push | 3 weeks | ❌ **Pending** — next launch blocker |
| 4 — Billing | 3 weeks | ✅ Mostly done — payment return + write gate left |
| 5 — WhatsApp | 5 weeks | ✅ Done |
| 6 — Campaigns | 5 weeks | ✅ Done (web editor handoff) |
| 7 — Tools | 4 weeks | ✅ Mostly done |
| 8 — App Store | 4 weeks | ❌ **Pending** — TestFlight / ASC |
| 9 — Post-launch | Ongoing | Widgets + keyboard shipped early; Android not started |

**Accelerated MVP (App Store next):** Finish Phase **3** (live APNs) + Phase **8** (TestFlight → App Store). Defer Google Sign-In, Universal Links polish, and Android.

---

## Next steps (immediate actions)

1. **Enable Push Notifications** capability + APNs `.p8` key
2. **Wire iOS client** `PushNotificationService` → register/unregister APIs
3. **Implement APNs send** service + admin broadcast path
4. **TestFlight** beta with Fastlane (or Xcode Organizer)
5. **App Store Connect** listing + screenshots
6. Optional: Google iOS OAuth client + Sign-In SDK

---

## 21. Mac Mini + Xcode — what to bring & what’s still missing

Use this section when continuing development on a **Mac Mini with Xcode**. The native app now lives under `ios/` in this repo.

### Is the roadmap “complete”?

| Item | Status | Notes |
|------|--------|-------|
| Product roadmap (phases, features, timeline) | ✅ Done | This document |
| Xcode project / Swift source code | ✅ Done | `ios/CRMPGApp.xcodeproj` via XcodeGen |
| Apple Developer Program enrollment | ⚠️ Your action | Needed for device push + App Store |
| Google OAuth **iOS** client ID | ❌ Not configured | Separate from web OAuth client |
| Backend mobile Bearer auth on dealer `/api/*` | ✅ Done | `requireUserApi` |
| APNs register table + API | ✅ Done | Send pipeline still pending |
| APNs send + iOS client registration | ❌ Not built | Phase 3 |
| Universal Links (`apple-app-site-association`) | ❌ Not on server | Defer until Phase 3 |
| App icon + splash | ✅ Done | Brand purple CRMPG |
| Widgets + CRM keyboard | ✅ Done | Ahead of original backlog |
| Test dealer account | ✅ Use existing | Email + password for TestFlight notes |

### Critical blocker (historical — resolved for Bearer)

Most dealer API routes previously used cookie-only `createClient()`. Native iOS now uses Bearer tokens via `requireUserApi` / supabase bearer helpers.

**Remaining launch blockers:** live APNs (client + send), TestFlight/App Store (Phase 8).

### Checklist before calling Phase 0 “done”

- [x] Xcode app builds and runs on simulator
- [x] Supabase email login works on device/simulator
- [x] At least one `/api/*` call succeeds with `Authorization: Bearer <access_token>`
- [x] Apple Developer App ID registered (`com.publicgolds.crmpg`)
- [ ] Google iOS OAuth client created (if using Google login in v1)
- [x] Test account documented for QA

### Related docs to read on Mac Mini

| File | Purpose |
|------|---------|
| `NATIVE_IOS_ROADMAP.md` | Master plan (this file) |
| `extension/README.md` | Same Supabase auth pattern as extension |
| `app/lib/auth/require-user.ts` | Bearer token auth for dealer APIs |
| `IOS_APP_DEVELOPMENT_GUIDE.md` | ⚠️ Outdated — do not follow API endpoint list blindly |

---

*Document version: 1.2 · Updated: July 2026 · Owner: Public Gold CRM engineering*
