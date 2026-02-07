import Link from "next/link"

export const metadata = {
  title: "Privacy Policy | Spatix",
  description: "Privacy Policy for Spatix mapping platform",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4">
        <Link href="/" className="text-xl font-bold text-slate-900">
          🗺️ Spatix
        </Link>
      </nav>
      
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-slate-500 mb-8">Last updated: February 2026</p>
        
        <div className="prose prose-slate max-w-none">
          <h2>Overview</h2>
          <p>
            Spatix ("we", "our") respects your privacy. This policy explains what data we collect, 
            how we use it, and your rights regarding your information.
          </p>

          <h2>Information We Collect</h2>
          
          <h3>Account Information</h3>
          <p>When you register, we collect:</p>
          <ul>
            <li>Email address</li>
            <li>Password (hashed, never stored in plain text)</li>
            <li>Account preferences</li>
          </ul>

          <h3>Geographic Data</h3>
          <p>When you use the Service, we process:</p>
          <ul>
            <li>Files you upload (GeoJSON, Shapefiles, KML, etc.)</li>
            <li>Maps you create and their configurations</li>
            <li>Datasets you contribute to the public registry</li>
          </ul>

          <h3>Usage Data</h3>
          <p>We automatically collect:</p>
          <ul>
            <li>IP address (for rate limiting and security)</li>
            <li>Browser type and device information</li>
            <li>Pages visited and features used</li>
            <li>API calls and timestamps</li>
          </ul>

          <h3>Agent Data</h3>
          <p>
            AI agents using our API may provide agent_id and agent_name identifiers. 
            This data is used for attribution and contribution tracking.
          </p>

          <h2>How We Use Your Information</h2>
          <ul>
            <li><strong>Provide the Service:</strong> Process your data, render maps, enable sharing</li>
            <li><strong>Security:</strong> Detect abuse, enforce rate limits, protect against attacks</li>
            <li><strong>Improvements:</strong> Analyze usage to improve features</li>
            <li><strong>Communication:</strong> Send service updates (you can opt out)</li>
            <li><strong>Contributions:</strong> Track points and leaderboard standings</li>
          </ul>

          <h2>Data Sharing</h2>
          <p>We do NOT sell your personal information. We may share data:</p>
          <ul>
            <li><strong>Public Content:</strong> Maps and datasets you make public are visible to others</li>
            <li><strong>Service Providers:</strong> Cloud hosting (Railway, Vercel) to operate the Service</li>
            <li><strong>Legal Requirements:</strong> If required by law or to protect rights</li>
          </ul>

          <h2>Data Storage & Security</h2>
          <p>
            Your data is stored on secure cloud infrastructure. We use encryption in transit (HTTPS) 
            and follow industry security practices. However, no system is 100% secure.
          </p>

          <h2>Data Retention</h2>
          <ul>
            <li><strong>Account data:</strong> Retained while your account is active</li>
            <li><strong>Maps:</strong> Retained until you delete them or your account</li>
            <li><strong>Public datasets:</strong> Retained indefinitely (community resource)</li>
            <li><strong>Logs:</strong> Retained for 90 days</li>
          </ul>

          <h2>Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of your data</li>
            <li><strong>Correct:</strong> Update inaccurate information</li>
            <li><strong>Delete:</strong> Delete your account and associated data</li>
            <li><strong>Export:</strong> Download your maps and data</li>
            <li><strong>Object:</strong> Opt out of non-essential communications</li>
          </ul>

          <h2>Cookies</h2>
          <p>
            We use essential cookies for authentication and session management. 
            We do not use third-party tracking cookies.
          </p>

          <h2>Children's Privacy</h2>
          <p>
            Spatix is not intended for children under 13. We do not knowingly collect 
            data from children.
          </p>

          <h2>International Users</h2>
          <p>
            Data is processed in the United States. By using Spatix, you consent to 
            data transfer to the US.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this policy. Material changes will be announced via the Service. 
            Continued use constitutes acceptance.
          </p>

          <h2>Contact</h2>
          <p>
            Privacy questions? Contact us at{" "}
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
