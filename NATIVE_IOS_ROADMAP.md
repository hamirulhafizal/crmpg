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
| Native iOS codebase | ❌ None |
| APNs pipeline | ❌ None |

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

- [ ] Define v1 feature list and acceptance criteria
- [ ] User flows: login → dashboard → customers → detail → actions
- [ ] Wireframes in Figma (iPhone 15 Pro baseline, Dynamic Type, Dark Mode)
- [ ] Design system: colors, typography, spacing aligned with web brand
- [ ] App icon + launch screen assets

### 0.2 Apple & Google developer setup

- [ ] Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
- [ ] Create App ID: `com.publicgolds.crmpg` (or your bundle ID)
- [ ] Enable capabilities: Push Notifications, Associated Domains, Sign in with Apple (if required)
- [ ] Create APNs key (.p8) in Apple Developer portal
- [ ] Register Google OAuth iOS client in Google Cloud Console
- [ ] Add iOS redirect URL to Supabase Auth → Google provider settings
- [ ] Configure Supabase Auth redirect URLs for mobile deep links

### 0.3 Backend — mobile auth readiness

- [ ] Audit all `/api/*` routes used by v1 — confirm `createClient()` works with Bearer tokens (not only cookies)
- [ ] Add or document mobile auth helper: extract user from `Authorization` header
- [ ] Add `GET /api/mobile/config` (optional) — app version, min supported version, feature flags
- [ ] CORS: not needed for native app; ensure no cookie-only assumptions in API handlers
- [ ] Rate limiting review for mobile traffic patterns

### 0.4 Backend — APNs foundation

- [ ] Migration: `ios_push_devices` table
  ```sql
  -- user_id, device_token, apns_environment, bundle_id, created_at, last_seen_at
  ```
- [ ] `POST /api/push/ios/register` — save device token (authenticated)
- [ ] `DELETE /api/push/ios/register` — logout / uninstall cleanup
- [ ] APNs send service (Node on Vercel or Supabase Edge Function)
- [ ] Link push payloads to existing deep-link routes (`app/lib/push/navigate-routes.ts`)
- [ ] Admin broadcast: extend `/api/admin/push/broadcast` to send APNs + Web Push

### 0.5 iOS project bootstrap

- [ ] Create Xcode project (SwiftUI, iOS 17+ minimum recommended)
- [ ] Add SPM dependencies: supabase-swift, GoogleSignIn-iOS
- [ ] Environment config: Debug (localhost) / Staging / Production
- [ ] `APIClient` with Bearer token injection + 401 refresh retry
- [ ] Keychain wrapper for session storage
- [ ] Basic app shell: TabView placeholder

### 0.6 DevOps

- [ ] Git repo + branch strategy (`main`, `develop`, feature branches)
- [ ] Fastlane setup: build, TestFlight upload
- [ ] CI: GitHub Actions — lint, unit tests, archive on tag
- [ ] `.env` / xcconfig for Supabase URL, anon key, API base URL

**Phase 0 exit criteria:** Empty app builds on device; Supabase sign-in returns a valid session; one test API call succeeds with Bearer token.

---

## Phase 1 — Auth & shell MVP (Weeks 4–7)

**Goal:** Dealers can log in, see a dashboard shell, and switch accounts.

### 1.1 Authentication screens

- [ ] Login — email + password
- [ ] Login — Google OAuth (ASWebAuthenticationSession or GoogleSignIn SDK)
- [ ] Register (if enabled for mobile)
- [ ] Forgot password → email link (opens Safari / in-app browser)
- [ ] Logout
- [ ] Session refresh on app launch and foreground

### 1.2 Saved accounts (multi-account)

Web stores accounts in `localStorage` (`crmpg_saved_accounts_v1`). iOS equivalent:

- [ ] Keychain-backed saved account list (max 5)
- [ ] Account picker on login screen
- [ ] Switch account via `POST /api/auth/switch-account` or Supabase token refresh
- [ ] **Do not store plaintext passwords** — prefer refresh tokens in Keychain
- [ ] Avatar + PG code display per account

### 1.3 Onboarding gates (match web)

- [ ] Google-only user → prompt create password (`profiles` + Supabase RPC)
- [ ] Profile completion sheet: PG code, phone, PBO username
- [ ] Block dashboard until required fields complete (same rules as web)

### 1.4 App shell & navigation

- [ ] Tab bar: **Home**, **Customers**, **WhatsApp**, **Profile**
- [ ] NavigationStack per tab
- [ ] Loading / error / empty states (reusable components)
- [ ] Pull-to-refresh pattern

### 1.5 Dashboard (read-only v1)

- [ ] `GET /api/saas/me` — plan name, trial expiry, write access
- [ ] Service tiles mirroring web dashboard (deep link or navigate)
- [ ] WAHA session status summary (connected / disconnected badge)
- [ ] Trial / subscription expiry banner

**Phase 1 exit criteria:** Dealer logs in, completes profile if needed, lands on dashboard with plan info.

---

## Phase 2 — Core CRM (Weeks 8–12)

**Goal:** Full customer management — the highest-value daily workflow.

### 2.1 Customer list

- [ ] `GET /api/customers` — paginated list with search
- [ ] Filters: sales journey, account status, CRM tags, follow-up queue
- [ ] Sort options
- [ ] Infinite scroll or page-based loading
- [ ] Swipe actions (call, WhatsApp — if number available)

### 2.2 Customer detail

- [ ] `GET /api/customers/[id]` — full profile
- [ ] Edit core fields inline or form sheet
- [ ] CRM tags: view + add/remove (`/api/customers/[id]/crm-tags`)
- [ ] Sales journey stage updates
- [ ] Follow-up activities timeline
- [ ] Account status badges

### 2.3 Customer create & bulk

- [ ] Add customer form (`POST /api/customers`)
- [ ] Duplicate detection feedback
- [ ] Bulk actions where API supports (`/api/customers/bulk`)

### 2.4 Chat history (read-only v1)

- [ ] `GET /api/customers/[id]/chat-history` — message list
- [ ] Profile picture (`/api/customers/[id]/profile-picture`)
- [ ] Pull older messages

### 2.5 AI tag analysis

- [ ] Trigger analyze tags (`POST /api/customers/[id]/analyze-tags`)
- [ ] Show suggested tags with accept/dismiss

### 2.6 Offline & performance

- [ ] Cache last customer list (SwiftData / file cache)
- [ ] Stale-while-revalidate on network return
- [ ] Skeleton loaders + optimistic UI for edits

**Phase 2 exit criteria:** Dealer can search, view, edit, and tag customers end-to-end on iPhone.

---

## Phase 3 — Push & engagement (Weeks 13–15)

**Goal:** Native push notifications with deep links into app screens.

### 3.1 APNs client integration

- [ ] Request notification permission (contextual prompt after login)
- [ ] Register device token → `POST /api/push/ios/register`
- [ ] Handle token refresh
- [ ] Unregister on logout

### 3.2 Notification handling

- [ ] Foreground banner display
- [ ] Tap → deep link to route (match `PUSH_NAVIGATE_ROUTES`):
  - `/dashboard`
  - `/customers`
  - `/dashboard/campaigns`
  - `/dashboard/billing`
  - `/waha-integration`
  - etc.
- [ ] Universal Links: `https://www.publicgolds.com/customers` opens app if installed

### 3.3 Backend notification types

- [ ] Campaign completion alerts
- [ ] Trial expiry reminders
- [ ] WhatsApp session disconnected
- [ ] PG sync job complete
- [ ] Admin broadcast (Pro dealers)

### 3.4 Settings

- [ ] Notification preferences screen (opt-in categories)
- [ ] Link to iOS Settings if permission denied

**Phase 3 exit criteria:** User receives push, taps it, lands on correct in-app screen.

---

## Phase 4 — Billing & entitlements (Weeks 16–18)

**Goal:** Dealers can view plan status and upgrade to Pro from the app.

### 4.1 Subscription status

- [ ] `GET /api/saas/me` — full entitlements display
- [ ] Active campaign count vs limit
- [ ] Wasender availability (Pro paid)
- [ ] Trial countdown UI

### 4.2 Upgrade flow

- [ ] Bayarcash checkout — **SFSafariViewController** or ASWebAuthenticationSession to web checkout
- [ ] Deep link return: `/payment/complete` → Universal Link → in-app success screen
- [ ] `POST /api/saas/sync-payment` after return
- [ ] Refresh entitlements

### 4.3 Start Pro trial

- [ ] `POST /api/saas/start-trial` with confirmation sheet
- [ ] Post-trial WhatsApp provider messaging (WAHA during trial)

### 4.4 Gating

- [ ] Disable write actions when `hasWriteAccess === false`
- [ ] Upgrade prompts on gated features (match web copy)

**Phase 4 exit criteria:** Free user can start trial or pay for Pro; entitlements update in app.

---

## Phase 5 — WhatsApp integration (Weeks 19–23)

**Goal:** Monitor and manage WhatsApp sessions from the phone.

### 5.1 Provider resolution

- [ ] `GET /api/whatsapp/provider` — show WAHA vs Wasender label
- [ ] Entitlement-aware UI (Pro trial = WAHA, Pro paid = Wasender)

### 5.2 Session list & status

- [ ] `GET /api/waha/sessions` — list sessions with live status
- [ ] Auto-relink on empty (backend `relinkWasenderSessionsForUser`)
- [ ] Status badges: WORKING, SCAN_QR, STOPPED

### 5.3 Session lifecycle

- [ ] Create session (`POST /api/waha/sessions`) — phone number input
- [ ] QR code display (`GET /api/waha/sessions/[session]/qr`) — render as UIImage
- [ ] Pairing code flow (`POST .../request-code`) for WhatsApp linked devices
- [ ] Start / stop session
- [ ] Delete session with confirmation

### 5.4 Send test message

- [ ] Simple compose sheet → `POST /api/waha/send`

### 5.5 Wasender-specific UX

- [ ] Connected state without QR when session re-linked after renewal
- [ ] Clear error when duplicate session exists on Wasender

**Phase 5 exit criteria:** Dealer connects WhatsApp, sees connected status, sends a test message.

---

## Phase 6 — Campaigns & automation (Weeks 24–28)

**Goal:** View and manage campaigns; defer visual editor to WebView or v2.

### 6.1 Campaign list

- [ ] `GET /api/campaigns` — list with status filters
- [ ] Pause / resume / archive actions

### 6.2 Campaign detail (read-only analytics v1)

- [ ] Enrollment stats, send progress, failure counts
- [ ] Audience summary (count, filters applied)

### 6.3 Campaign create (simplified)

- [ ] Option A: **WKWebView** embed web workflow builder (`/dashboard/campaigns/new`)
- [ ] Option B: Template-based create (platform defaults from admin)
- [ ] Pass Bearer token to WebView via injected cookie or header bridge

### 6.4 Workflow editor (native — v2+)

- [ ] Port React Flow → not recommended for v1
- [ ] Native node list + step configuration if needed long-term

**Phase 6 exit criteria:** Dealer sees campaign list, analytics, and can create via web embed or template.

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

- [ ] Widgets: today’s follow-ups, WAHA status
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

| # | Task | Phase | Priority |
|---|------|-------|----------|
| 1 | Bearer token auth audit on all mobile-used routes | 0 | P0 |
| 2 | `ios_push_devices` table + register/unregister API | 0 | P0 |
| 3 | APNs send service + admin broadcast extension | 0–3 | P0 |
| 4 | Universal Links / apple-app-site-association | 3 | P0 |
| 5 | `GET /api/mobile/config` (version gate) | 0 | P1 |
| 6 | Payment return deep link verification | 4 | P0 |
| 7 | WebView auth bridge for campaign editor | 6 | P1 |
| 8 | OpenAPI 3.0 spec export for `/api/*` | 0 | P1 |
| 9 | Push: link `user_id` on all subscription types | 3 | P0 |
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

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 0 — Foundation | 3 weeks | Week 3 |
| 1 — Auth & shell | 4 weeks | Week 7 |
| 2 — Core CRM | 5 weeks | Week 12 |
| 3 — Push | 3 weeks | Week 15 |
| 4 — Billing | 3 weeks | Week 18 |
| 5 — WhatsApp | 5 weeks | Week 23 |
| 6 — Campaigns | 5 weeks | Week 28 |
| 7 — Tools | 4 weeks | Week 32 |
| 8 — App Store | 4 weeks | **Week 36 (~9 months)** |

**Accelerated MVP (App Store in ~4 months):** Phases 0 + 1 + 2 + 3 + 4 + 8 only — defer WhatsApp native, campaigns, tools to post-launch updates.

---

## Next steps (immediate actions)

1. **Approve v1 scope** — full roadmap vs accelerated MVP
2. **Create Apple Developer account** + App ID
3. **Run Phase 0 backend audit** — Bearer token on `/api/customers`, `/api/saas/me`, `/api/waha/sessions`
4. **Create `crmpg-ios` repository** and Xcode project
5. **Design wireframes** for login, dashboard, customer list/detail
6. **Schedule TestFlight beta** target date

---

## 21. Mac Mini + Xcode — what to bring & what’s still missing

Use this section when moving development to a **separate Mac Mini with Xcode**. The roadmap MD file is the **plan**; it does not include an Xcode project yet.

### Is the roadmap “complete”?

| Item | Status | Notes |
|------|--------|-------|
| Product roadmap (phases, features, timeline) | ✅ Done | This document |
| Xcode project / Swift source code | ❌ Not started | You create this on the Mac Mini |
| Apple Developer Program enrollment | ❌ Your action | Required for device testing & App Store |
| Google OAuth **iOS** client ID | ❌ Not configured | Separate from web OAuth client |
| Backend mobile Bearer auth on dealer `/api/*` | ❌ **Blocker** | Most routes use cookies only today |
| APNs backend + `ios_push_devices` table | ❌ Not built | Defer until Phase 3 |
| Universal Links (`apple-app-site-association`) | ❌ Not on server | Defer until Phase 3 |
| Figma / app icon assets | ❌ Optional for Day 1 | Can use placeholders |
| Test dealer account | ✅ Use existing | Email + password for TestFlight notes |

### Critical blocker (fix on web repo before API integration)

Most dealer API routes call `createClient()` from `app/lib/supabase/server.ts`, which reads **cookies only**. A native app has no cookies.

**Admin routes already support Bearer tokens** (`app/lib/auth/require-admin.ts`). Dealer routes do **not** yet.

Before Phase 2 (Customers via `/api/customers`), add a shared helper, e.g. `requireUserApi(request)` in `app/lib/auth/require-user.ts`, mirroring admin:

```typescript
// Pattern to implement on web repo (Phase 0)
const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
if (token) {
  const { data } = await supabase.auth.getUser(token)
  user = data.user
} else {
  const { data } = await supabase.auth.getUser() // cookie fallback for web
  user = data.user
}
```

**Workaround for early iOS prototyping:** use **Supabase Swift SDK** directly for auth + RLS-protected tables (`profiles`, `customers`). You can build login + read-only customer list without `/api/*`, but you will **not** get web-parity features (filters, chat history, tags, SaaS entitlements) until APIs accept Bearer tokens or you duplicate server logic (not recommended).

### What you CAN start on Mac Mini immediately (no backend change)

1. Install Xcode 16+ and create a new **SwiftUI App** project
2. Add **supabase-swift** via Swift Package Manager
3. Implement email/password login against production Supabase
4. Read `profiles` and basic `customers` rows via Supabase SDK (RLS)
5. Build UI shell: TabView, navigation, design system placeholders

### Software to install on Mac Mini

- [ ] **Xcode** 16+ (from Mac App Store) — includes iOS 18 SDK
- [ ] **Xcode Command Line Tools** — `xcode-select --install`
- [ ] **Git** — clone repos
- [ ] **Optional:** [Fastlane](https://fastlane.tools), [SF Symbols](https://developer.apple.com/sf-symbols/), Figma desktop

### Files & credentials to copy to Mac Mini

Create a secure note or `ios-secrets.xcconfig` ( **never commit to git** ):

| Key | Where to get it | Used for |
|-----|-----------------|----------|
| `SUPABASE_URL` | Web `.env` → `NEXT_PUBLIC_SUPABASE_URL` | Supabase Swift SDK |
| `SUPABASE_ANON_KEY` | Web `.env` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Swift SDK |
| `API_BASE_URL` | `https://www.publicgolds.com` (prod) or local dev URL | REST `/api/*` calls |
| `GOOGLE_IOS_CLIENT_ID` | Google Cloud Console → new iOS OAuth client | Google Sign-In (Phase 1) |
| `BUNDLE_ID` | You choose, e.g. `com.publicgolds.crmpg` | Xcode + Apple Developer |
| Test dealer email/password | Your test account | Simulator + TestFlight |

Also copy these repo paths (git clone or USB):

```
crmpg/                          # Full web repo (API reference)
crmpg/docs/NATIVE_IOS_ROADMAP.md
crmpg/app/api/                  # Endpoint reference while building APIClient
crmpg/app/lib/push/navigate-routes.ts   # Deep link paths
```

### Apple Developer setup (on Mac Mini)

1. Sign in to Xcode with Apple ID enrolled in **Apple Developer Program**
2. **Certificates, Identifiers & Profiles** → register App ID with bundle ID
3. Enable capabilities when needed:
   - Push Notifications (Phase 3)
   - Associated Domains (Universal Links, Phase 3)
4. Create **Development** provisioning profile for your test iPhone
5. Download APNs Auth Key (.p8) when starting push (Phase 3)

### Google Sign-In setup (before Google login on iOS)

1. [Google Cloud Console](https://console.cloud.google.com) → same project as web
2. Create **OAuth client ID → iOS**
3. Set bundle ID to match Xcode
4. Supabase Dashboard → Authentication → Google → add iOS client if required
5. Supabase → URL Configuration → add redirect URL for mobile OAuth flow

### Recommended Day 1 workflow on Mac Mini

```
Day 1–2   Install Xcode, clone crmpg repo, read this doc + Phase 0–1
Day 3–5   New Xcode project, Supabase login screen, profile fetch
Day 6–10  Tab shell + customer list via Supabase SDK (direct)
          ↳ Parallel: web team adds requireUserApi() Bearer support
Day 11+   Switch APIClient to /api/customers with Bearer token
```

### Separate iOS repo (recommended)

Keep iOS out of the Next.js monorepo:

```
# On Mac Mini
git init crmpg-ios
# Add Xcode project, .gitignore for xcuserdata, Secrets.xcconfig
```

Link to web backend only via HTTPS + Supabase keys — no shared code required for v1.

### Checklist before calling Phase 0 “done”

- [ ] Xcode app builds and runs on simulator
- [ ] Supabase email login works on device/simulator
- [ ] At least one `/api/*` call succeeds with `Authorization: Bearer <access_token>`
- [ ] Apple Developer App ID registered
- [ ] Google iOS OAuth client created (if using Google login in v1)
- [ ] Test account documented for QA

### Related docs to read on Mac Mini

| File | Purpose |
|------|---------|
| `docs/NATIVE_IOS_ROADMAP.md` | Master plan (this file) |
| `extension/README.md` | Same Supabase auth pattern as extension |
| `app/lib/auth/require-admin.ts` | Reference for Bearer token auth |
| `IOS_APP_DEVELOPMENT_GUIDE.md` | ⚠️ Outdated — do not follow API endpoint list blindly |

---

*Document version: 1.1 · Updated: July 2026 · Owner: Public Gold CRM engineering*
