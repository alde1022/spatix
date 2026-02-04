import Link from "next/link"
import { Check } from "lucide-react"

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out Spatix",
    features: [
      "5 maps per month",
      "Basic styling options",
      "Public sharing",
      "Community support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/month",
    description: "For creators who need more",
    features: [
      "Unlimited maps",
      "All styling options",
      "Custom domains",
      "Remove Spatix branding",
      "API access (500 calls/mo)",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$29",
    period: "/month",
    description: "For teams and organizations",
    features: [
      "Everything in Pro",
      "5 team members",
      "Team workspaces",
      "Analytics dashboard",
      "API access (5,000 calls/mo)",
      "SSO integration",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xl">🗺️</span>
          </div>
          <span className="font-bold text-xl text-slate-900">Spatix</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/developers" className="text-slate-600 hover:text-slate-900 text-sm font-medium">
            Developers
          </Link>
          <Link href="/pricing" className="text-brand-600 text-sm font-medium">
            Pricing
          </Link>
          <button className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm font-medium">
            Sign In
          </button>
        </div>
      </nav>

      {/* Header */}
      <div className="text-center py-16 px-6">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          Start free, upgrade when you need more. No hidden fees.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 ${
                plan.highlighted
                  ? "bg-slate-900 text-white ring-4 ring-brand-500 scale-105"
                  : "bg-white border border-slate-200"
              }`}
            >
              <h3 className={`text-xl font-bold mb-2 ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                {plan.name}
              </h3>
              <p className={`text-sm mb-4 ${plan.highlighted ? "text-slate-300" : "text-slate-600"}`}>
                {plan.description}
              </p>
              <div className="mb-6">
                <span className={`text-4xl font-bold ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                  {plan.price}
                </span>
                <span className={plan.highlighted ? "text-slate-300" : "text-slate-500"}>{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 flex-shrink-0 ${plan.highlighted ? "text-brand-400" : "text-brand-600"}`} />
                    <span className={`text-sm ${plan.highlighted ? "text-slate-300" : "text-slate-600"}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-3 rounded-lg font-medium transition-colors ${
                  plan.highlighted
                    ? "bg-brand-500 text-white hover:bg-brand-600"
                    : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-slate-50 py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Can I try before I buy?</h3>
              <p className="text-slate-600">
                Absolutely! Our Free plan lets you create 5 maps per month with no credit card required.
                Pro plans also come with a 14-day free trial.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-2">What happens to my maps if I downgrade?</h3>
              <p className="text-slate-600">
                Your maps will remain accessible. You just won't be able to create new ones beyond the free limit
                or use pro features until you upgrade again.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-2">Do you offer refunds?</h3>
              <p className="text-slate-600">
                Yes! We offer a 30-day money-back guarantee. If you're not happy, we'll refund you, no questions asked.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-2">What's included in API access?</h3>
              <p className="text-slate-600">
                Pro and Team plans include access to our REST API for programmatic map creation.
                Perfect for AI agents, automation, and custom integrations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>© 2025 Spatix. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/developers" className="hover:text-slate-700">API</Link>
            <Link href="/pricing" className="hover:text-slate-700">Pricing</Link>
            <a href="https://twitter.com/spatix" className="hover:text-slate-700">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
