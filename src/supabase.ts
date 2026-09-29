import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      global: {
        fetch: createTimedFetch(15000),
      },
    })
  : null

function createTimedFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const outerSignal = init?.signal
    if (outerSignal) {
      if (outerSignal.aborted) controller.abort()
      else outerSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}
