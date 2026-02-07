import Link from "next/link"

export const metadata = {
  title: "Terms of Service | Spatix",
  description: "Terms of Service for Spatix mapping platform",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <Link href="/" className="text-xl font-bold text-slate-900">
          🗺️ Spatix
        </Link>
      </nav>
      
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-slate-500 mb-8">Last updated: February 2026</p>
        
        <div className="prose prose-slate max-w-none">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Spatix ("the Service"), you agree to be bound by these Terms of Service. 
            If you do not agree, do not use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Spatix is a geospatial data visualization platform that allows users to upload, process, 
            visualize, and share geographic data. The Service includes web interfaces, APIs, and 
            integrations for AI agents.
          </p>

          <h2>3. User Accounts</h2>
          <p>
            You may use certain features without an account. To access full functionality, you must 
            register with a valid email address. You are responsible for maintaining the security 
            of your account credentials.
          </p>

          <h2>4. Acceptable Use</h2>
          <p>You agree NOT to:</p>
          <ul>
            <li>Upload malicious files or code</li>
            <li>Attempt to access other users' data without authorization</li>
            <li>Use the Service to violate any laws or regulations</li>
            <li>Overwhelm the Service with excessive automated requests beyond rate limits</li>
            <li>Upload data you do not have rights to share</li>
            <li>Use the Service to track individuals without consent</li>
          </ul>

          <h2>5. Data & Content</h2>
          <p>
            <strong>Your Data:</strong> You retain ownership of data you upload. By uploading, you grant 
            Spatix a license to process, store, and display your data as needed to provide the Service.
          </p>
          <p>
            <strong>Public Datasets:</strong> Data uploaded to the public dataset registry is made 
            available to other users and agents under the license you specify. You must have rights 
            to share any data you make public.
          </p>
          <p>
            <strong>Maps:</strong> Maps you create may be shared via public URLs. You control sharing settings.
          </p>

          <h2>6. API & Agent Usage</h2>
          <p>
            The Spatix API and MCP server are available for programmatic access. Rate limits apply. 
            Agents using the API must identify themselves via agent_id/agent_name fields. Abuse of 
            API access may result in suspension.
          </p>

          <h2>7. Points & Contributions</h2>
          <p>
            Spatix tracks contributions via a points system. Points have no monetary value and may 
            be used for future platform features at our discretion. We reserve the right to modify 
            the points system at any time.
          </p>

          <h2>8. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee 
            uptime, data accuracy, or fitness for any particular purpose. Geographic data may 
            contain errors.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            Spatix shall not be liable for any indirect, incidental, or consequential damages 
            arising from your use of the Service. Our total liability shall not exceed $100.
          </p>

          <h2>10. Termination</h2>
          <p>
            We may suspend or terminate your access for violations of these terms. You may delete 
            your account at any time. Upon termination, your private data will be deleted within 
            30 days.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We may update these terms. Continued use after changes constitutes acceptance. 
            Material changes will be announced via the Service.
          </p>

          <h2>12. Contact</h2>
          <p>
            Questions about these terms? Contact us at{" "}
            <a href="https://spatix.io" className="text-indigo-600 hover:underline">
              the contact form on our homepage
            </a>
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <Link href="/" className="text-indigo-600 hover:underline">
            ← Back to Spatix
          </Link>
        </div>
      </main>
    </div>
  )
}
