'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function CallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const error = searchParams.get('error')

  useEffect(() => {
    if (token) {
      // Store token
      localStorage.setItem('spatix_token', token)
      
      // Get redirect URL or default to /account
      const redirect = localStorage.getItem('spatix_redirect') || '/account'
      localStorage.removeItem('spatix_redirect')
      
      // Redirect
      router.push(redirect)
    }
  }, [token, router])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-2">Sign in failed</h1>
            <p className="text-sm text-slate-600 mb-6">
              {error === 'oauth_failed' && 'Authentication failed. Please try again.'}
              {error === 'no_email' && 'Could not retrieve your email address.'}
              {error === 'invalid_token' && 'Invalid or expired verification link.'}
              {!['oauth_failed', 'no_email', 'invalid_token'].includes(error) && 'Something went wrong.'}
            </p>
            <Link 
              href="/login" 
              className="inline-flex items-center justify-center w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all"
            >
              Try again
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-600">Signing you in...</p>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}
