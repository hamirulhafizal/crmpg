import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | CRMPG by KEM',
  description:
    'Privacy policy for CRMPG by KEM, including the Chrome extension used by Public Gold dealers to sync Business Center customer data.',
  alternates: {
    canonical: 'https://publicgolds.com/privacy',
  },
}

const LAST_UPDATED = '16 June 2026'
const CONTACT_EMAIL = 'hamirul.dev@gmail.com'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-slate-600 hover:text-slate-900 flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Public Gold
          </Link>
          <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <article className="bg-white rounded-2xl shadow-xl border border-slate-200/50 p-8 sm:p-10 prose prose-slate max-w-none">
          <p className="text-sm text-slate-500 not-prose mb-2">Last updated: {LAST_UPDATED}</p>
          <h1 className="text-3xl font-semibold text-slate-900 mt-0">Privacy Policy</h1>
          <p className="text-slate-600 text-lg">
            This policy describes how <strong>CRMPG by KEM</strong> (the web application at{' '}
            <a href="https://publicgolds.com">publicgolds.com</a> and the related Chrome extension)
            collects, uses, and protects information.
          </p>

          <h2>Who we are</h2>
          <p>
            CRMPG is a customer relationship tool for authorised Public Gold (KEM) dealers. The
            service is operated in connection with Public Gold dealer workflows. For privacy questions,
            contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>What this policy covers</h2>
          <ul>
            <li>The CRMPG web application</li>
            <li>The <strong>CRMPG by KEM</strong> Chrome extension</li>
            <li>Related APIs used to authenticate dealers and sync customer records</li>
          </ul>

          <h2>Information we collect</h2>

          <h3>Dealer account information</h3>
          <p>When you sign in, we process:</p>
          <ul>
            <li>Email address and authentication credentials or session tokens</li>
            <li>Account identifiers needed to link data to your dealer account</li>
          </ul>

          <h3>Customer data synced from PG Mall Business Center</h3>
          <p>
            When you use the extension or web app to sync data from the official PG Mall Business
            Center pages you already have access to, we may process customer/downline fields such as:
          </p>
          <ul>
            <li>Name, email, phone number, date of birth, age, gender, ethnicity</li>
            <li>PG code, branch, location or address-related fields shown on the page</li>
            <li>Other business-center fields required for CRM, follow-up, and dealer operations</li>
          </ul>
          <p>
            This data is synced only at your request (for example, when you click{' '}
            <strong>Sync to CRMPG</strong>).
          </p>

          <h3>Technical information</h3>
          <ul>
            <li>Extension version, for update checks and compatibility</li>
            <li>Basic sync status and error logs needed to operate the service</li>
            <li>Standard web server and security logs for the CRMPG application</li>
          </ul>

          <h2>How we use information</h2>
          <p>We use collected information only to:</p>
          <ul>
            <li>Authenticate authorised dealers</li>
            <li>Store and display customer records in your CRMPG account</li>
            <li>Support CRM features such as follow-up, campaigns, and messaging workflows you enable</li>
            <li>Maintain, secure, and improve the service</li>
            <li>Enforce minimum extension versions for security and compatibility</li>
          </ul>

          <h2>Chrome extension permissions</h2>
          <p>The CRMPG by KEM extension requests only the permissions needed for dealer sync:</p>
          <ul>
            <li>
              <strong>activeTab</strong> — temporary access to the current PG Mall tab when you click
              sync, so customer table data can be read from the page you are viewing
            </li>
            <li>
              <strong>scripting</strong> — run sync logic on the active Business Center page at your
              request
            </li>
            <li>
              <strong>storage</strong> — keep your login session, sync progress, and version-check cache
              on your device
            </li>
            <li>
              <strong>Host access (pgmall.my)</strong> — interact with the official PG Mall Business
              Center site where dealer data is displayed
            </li>
          </ul>
          <p>
            The extension does not execute remote JavaScript code. All extension code is bundled in the
            published package. Network requests are used only to authenticate you and save synced data to
            your account.
          </p>

          <h2>Where data is stored</h2>
          <p>
            Dealer and customer records are stored in secure cloud infrastructure (including Supabase)
            associated with your CRMPG account. Authentication is handled through Supabase Auth.
          </p>

          <h2>Sharing of data</h2>
          <p>
            We do <strong>not</strong> sell or rent your personal information or synced customer data.
            We do not transfer user data to third parties for unrelated purposes such as advertising or
            creditworthiness decisions.
          </p>
          <p>We may use service providers strictly to operate CRMPG, such as:</p>
          <ul>
            <li>Cloud hosting and database providers</li>
            <li>Authentication services</li>
            <li>Messaging or automation providers you choose to connect for your dealer workflows</li>
          </ul>

          <h2>Data retention</h2>
          <p>
            We retain dealer account data and synced customer records while your account remains active
            and as needed to provide the service. You may request deletion of your account or specific
            data by contacting us.
          </p>

          <h2>Security</h2>
          <p>
            We use industry-standard measures including authenticated access, encrypted transport (HTTPS),
            and access controls so dealers can access only their own data.
          </p>

          <h2>Your choices</h2>
          <ul>
            <li>You choose when to sync customer data from PG Mall</li>
            <li>You can sign out of the extension or web app at any time</li>
            <li>You can uninstall the Chrome extension at any time</li>
          </ul>

          <h2>Children</h2>
          <p>
            CRMPG is intended for authorised business users (dealers). It is not directed at children
            under 13.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            We may update this policy from time to time. The &ldquo;Last updated&rdquo; date at the top
            will reflect the latest version. Continued use of the service after changes means you accept
            the updated policy.
          </p>

          <h2>Contact</h2>
          <p>
            For privacy requests or questions, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </article>
      </main>
    </div>
  )
}
