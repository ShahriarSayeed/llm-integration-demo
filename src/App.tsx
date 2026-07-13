import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "./components/integrations/supabase/client";
import SignIn from './components/auth/SignIn'
import SignUp from './components/auth/SignUp'
import Dashboard from './components/dashboard/Dashboard'

import { OpportunityMapExperience } from "./components/opportunity-map/OpportunityMapExperience";

const queryClient = new QueryClient();

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for auth state changes (sign in / sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/signin"
            element={!session ? <SignIn /> : <Navigate to="/dashboard" replace />}
          />
          <Route
            path="/signup"
            element={!session ? <SignUp /> : <Navigate to="/dashboard" replace />}
          />
          <Route
            path="/dashboard"
            element={session ? <Dashboard session={session} /> : <Navigate to="/signin" replace />}
          />        
          <Route
            path="/find-nearby-pool-prospects"
            element={session ? <OpportunityMapExperience /> : <Navigate to="/signin" replace />}            
          />
          {/* Catch-all */}
          <Route
            path="*"
            element={<Navigate to={session ? '/dashboard' : '/signin'} replace />}
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
