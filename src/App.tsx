import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from './supabase'
import Auth from './components/Auth'
import Nav, { type Tab } from './components/Nav'

const AddWord = lazy(() => import('./components/AddWord'))
const Library = lazy(() => import('./components/Library'))
const Review = lazy(() => import('./components/Review'))
const Settings = lazy(() => import('./components/Settings'))

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('add')
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    setReady(true)
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <div className="auth-wrap">
        <p className="muted">加载中…</p>
      </div>
    )
  }

  if (!session) return <Auth />

  return (
    <div className="app">
      <Nav tab={tab} onChange={setTab} refreshKey={refreshKey} />
      <main>
        <Suspense fallback={<p className="muted page-loading">加载中…</p>}>
          {tab === 'add' && <AddWord onSaved={bump} />}
          {tab === 'library' && <Library onChanged={bump} />}
          {tab === 'review' && <Review onChanged={bump} />}
          {tab === 'settings' && <Settings email={session.user.email ?? ''} />}
        </Suspense>
      </main>
    </div>
  )
}
