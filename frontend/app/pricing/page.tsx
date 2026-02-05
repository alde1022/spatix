'use client'

import Link from "next/link"
import Navbar from "@/components/Navbar"
import { Check } from "lucide-react"

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out Spatix",
    features: [
      "10 maps per month",
      "Basic styling options",
      "100 API calls/month",
      "50 MB storage",
      "Public sharing",
      "Community support",
    ],
    cta: "Get Started",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "For creators who need more",
    features: [
      "500 maps per month",
      "All styling options",
      "10,000 API calls/month",
      "5 GB storage",
      "Custom domains",
      "Remove Spatix branding",
      "Priority support",
    ],
    cta: "Start Free Trial",
    href: "/signup?plan=pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$49",
    period: "/month",
    description: "For teams and organizations",
    features: [
      "Unlimited maps",
      "Everything in Pro",
      "100,000 API calls/month",
      "50 GB storage",
      "5 team members",
      "Team workspaces",
      "Analytics dashboard",
      "SSO integration",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    href: "mailto:team@spatix.io",
    highlighted: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Navbar />

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
              <Link
                href={plan.href}
                className={`block w-full py-3 rounded-lg font-medium transition-colors text-center ${
                  plan.highlighted
                    ? "bg-brand-500 text-white hover:bg-brand-600"
                    : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                }`}
              >
                {plan.cta}
              </Link>
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
                Absolutely! Our Free plan lets you create 10 maps per month with no credit card required.
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
                All plans include API access. Free gets 100 calls/month, Pro gets 10,000, and Team gets 100,000.
                Perfect for AI agents, automation, and custom integrations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-slate-500">
          <p>© 2026 Spatix. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/developers" className="hover:text-slate-700">API</Link>
            <Link href="/pricing" className="hover:text-slate-700">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
