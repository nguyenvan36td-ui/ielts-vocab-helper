import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { IconBolt, IconBookPlus, IconLibrary, IconUser } from './icons'

export type Tab = 'add' | 'library' | 'review' | 'settings'

const ITEMS: { id: Tab; label: string; icon: typeof IconBolt }[] = [
  { id: 'add', label: '记词', icon: IconBookPlus },
  { id: 'library', label: '生词本', icon: IconLibrary },
  { id: 'review', label: '复习', icon: IconBolt },
  { id: 'settings', label: '我的', icon: IconUser },
]

function DueBadge({ refreshKey }: { refreshKey: number }) {
  const [n, setN] = useState<number | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client) return
    let alive = true
    async function count() {
      if (!client) return
      const { count } = await client
        .from('words')
        .select('*', { count: 'exact', head: true })
        .eq('mastered', false)
        .or(`next_review_at.is.null,next_review_at.lte.${new Date().toISOString()}`)
      if (alive) setN(count ?? 0)
    }
    count()
    return () => {
      alive = false
    }
  }, [refreshKey])

  if (n === null || n <= 0) return null
  return <span className="badge">{n}</span>
}

export default function Nav({
  tab,
  onChange,
  refreshKey,
}: {
  tab: Tab
  onChange: (t: Tab) => void
  refreshKey: number
}) {
  return (
    <nav className="nav">
      {ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            className={`nav-item${tab === item.id ? ' active' : ''}`}
            onClick={() => onChange(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            <span className="nav-icon">
              <Icon size={22} />
            </span>
            <span>{item.label}</span>
            {item.id === 'review' && <DueBadge refreshKey={refreshKey} />}
          </button>
        )
      })}
    </nav>
  )
}
