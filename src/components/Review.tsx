import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '../supabase'
import { applyReview, type ReviewResult } from '../lib/srs'
import type { WordRow } from '../types'
import WordCard from './WordCard'
import { IconBookOpen, IconCheck, IconHelp, IconParty, IconRefresh, IconX } from './icons'

type ReviewMode = 'due' | 'consolidate'
type ReviewStats = { pass: number; fuzzy: number; fail: number }
type SavedSession = {
  mode: ReviewMode
  queueIds: string[]
  idx: number
  stats: ReviewStats
}
type PendingReview = { row: WordRow; result: ReviewResult }

const LEGACY_SESSION_KEY = 'ielts-review-session-v1'
const SESSION_KEY_PREFIX = 'ielts-review-session-v2'
const LAST_MODE_KEY = 'ielts-review-last-mode'
const EMPTY_STATS: ReviewStats = { pass: 0, fuzzy: 0, fail: 0 }

function dueFilter(now = new Date().toISOString()) {
  return `next_review_at.is.null,next_review_at.lte.${now}`
}

function sessionKey(mode: ReviewMode) {
  return `${SESSION_KEY_PREFIX}-${mode}`
}

function readLastMode(): ReviewMode {
  const lastMode = localStorage.getItem(LAST_MODE_KEY)
  if (lastMode === 'due' || lastMode === 'consolidate') return lastMode
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY) ?? 'null') as SavedSession | null
    return legacy?.mode === 'consolidate' ? 'consolidate' : 'due'
  } catch {
    return 'due'
  }
}

function readSession(mode: ReviewMode): SavedSession | null {
  try {
    const current = localStorage.getItem(sessionKey(mode))
    const legacy = localStorage.getItem(LEGACY_SESSION_KEY)
    const value = JSON.parse(current ?? legacy ?? 'null') as SavedSession | null
    if (!value || value.mode !== mode || !Array.isArray(value.queueIds) || value.idx >= value.queueIds.length) {
      return null
    }
    if (!current && legacy) {
      localStorage.setItem(sessionKey(mode), legacy)
      localStorage.removeItem(LEGACY_SESSION_KEY)
    }
    return value
  } catch {
    return null
  }
}

function writeSession(mode: ReviewMode, queue: WordRow[], idx: number, stats: ReviewStats) {
  if (queue.length === 0 || idx >= queue.length) {
    localStorage.removeItem(sessionKey(mode))
    return
  }
  const session: SavedSession = { mode, queueIds: queue.map((row) => row.id), idx, stats }
  localStorage.setItem(sessionKey(mode), JSON.stringify(session))
}

export default function Review({ onChanged }: { onChanged: () => void }) {
  const answerLock = useRef(false)
  const [mode, setMode] = useState<ReviewMode>(readLastMode)
  const [queue, setQueue] = useState<WordRow[]>([])
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<PendingReview[]>([])
  const [stats, setStats] = useState<ReviewStats>(EMPTY_STATS)

  async function fetchQueue(nextMode: ReviewMode, restore = false) {
    if (!supabase) return
    setLoading(true)
    setError('')
    setPaused(false)
    setRevealed(false)

    const saved = restore ? readSession(nextMode) : null
    let data: WordRow[] = []
    let loadError = null

    if (saved && saved.mode === nextMode && saved.queueIds.length > 0) {
      const response = await supabase.from('words').select('*').in('id', saved.queueIds)
      loadError = response.error
      const byId = new Map(((response.data ?? []) as WordRow[]).map((row) => [row.id, row]))
      data = saved.queueIds.map((id) => byId.get(id)).filter((row): row is WordRow => Boolean(row))
      setIdx(Math.min(saved.idx, Math.max(0, data.length - 1)))
      setStats(saved.stats)
    } else {
      let query = supabase.from('words').select('*')
      if (nextMode === 'due') {
        query = query.eq('mastered', false).or(dueFilter())
      }
      const response = await query
        .order('review_level', { ascending: true })
        .order('last_reviewed_at', { ascending: true })
        .limit(500)
      loadError = response.error
      data = (response.data ?? []) as WordRow[]
      setIdx(0)
      setStats(EMPTY_STATS)
    }

    if (loadError) {
      setError('加载复习列表失败，请重试')
      setQueue([])
    } else {
      setQueue(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchQueue(mode, true)
    // The initial saved session determines the first queue; later mode changes load explicitly.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(LAST_MODE_KEY, mode)
  }, [mode])

  const done = queue.length > 0 && idx >= queue.length

  useEffect(() => {
    if (loading || queue.length === 0 || done) return
    writeSession(mode, queue, idx, stats)
  }, [done, idx, loading, mode, queue, stats])

  useEffect(() => {
    if (!done) return
    localStorage.removeItem(sessionKey(mode))
    onChanged()
  }, [done, mode, onChanged])

  async function persistReview(row: WordRow, result: ReviewResult) {
    if (!supabase) return false
    const outcome = applyReview(row.review_level, result)
    const { error: saveError } = await supabase
      .from('words')
      .update({
        review_level: outcome.reviewLevel,
        next_review_at: outcome.nextReviewAt.toISOString(),
        last_reviewed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return !saveError
  }

  async function retryPending() {
    const failed: PendingReview[] = []
    for (const item of pending) {
      if (!(await persistReview(item.row, item.result))) failed.push(item)
    }
    setPending(failed)
    setError(failed.length > 0 ? '仍有记录同步失败，请检查网络后重试' : '')
    if (failed.length === 0) onChanged()
  }

  function answer(result: ReviewResult) {
    const current = queue[idx]
    if (!current || answerLock.current) return
    answerLock.current = true

    const nextStats = { ...stats, [result]: stats[result] + 1 }
    const nextIdx = idx + 1
    writeSession(mode, queue, nextIdx, nextStats)
    setStats(nextStats)
    setIdx(nextIdx)
    setRevealed(false)
    window.setTimeout(() => {
      answerLock.current = false
    }, 0)

    void persistReview(current, result).then((ok) => {
      if (!ok) {
        setPending((items) => [...items, { row: current, result }])
        setError('部分复习记录尚未同步，请重试')
      }
    })
  }

  function changeMode(nextMode: ReviewMode) {
    if (nextMode === mode) return
    writeSession(mode, queue, idx, stats)
    localStorage.setItem(LAST_MODE_KEY, nextMode)
    setMode(nextMode)
    void fetchQueue(nextMode, true)
  }

  function restart() {
    localStorage.removeItem(sessionKey(mode))
    void fetchQueue(mode)
  }

  if (loading) {
    return <div className="page"><p className="muted">加载中…</p></div>
  }

  const modeTabs = (
    <div className="tabs review-modes" aria-label="复习模式">
      <button className={`tab${mode === 'due' ? ' active' : ''}`} onClick={() => changeMode('due')}>
        今日复习
      </button>
      <button className={`tab${mode === 'consolidate' ? ' active' : ''}`} onClick={() => changeMode('consolidate')}>
        巩固模式
      </button>
    </div>
  )

  if (queue.length === 0) {
    return (
      <div className="page">
        {modeTabs}
        <div className="card center">
          <div className="empty-icon">{error ? <IconRefresh size={26} /> : <IconBookOpen size={26} />}</div>
          <h2>{error ? '加载失败' : mode === 'due' ? '暂无待复习单词' : '生词本还是空的'}</h2>
          <p className="muted">{error || (mode === 'due' ? '可以切换到「巩固模式」复习全部单词。' : '去「记词」添加第一个生词。')}</p>
          {error && <button className="btn primary" onClick={restart}><IconRefresh size={18} />重试</button>}
        </div>
      </div>
    )
  }

  if (done || paused) {
    return (
      <div className="page">
        {modeTabs}
        <div className="card center">
          <div className="empty-icon"><IconParty size={26} /></div>
          <h2>{done ? '复习完成' : '本轮已暂停'}</h2>
          <div className="stats">
            <span>认识 {stats.pass}</span><span>模糊 {stats.fuzzy}</span><span>不认识 {stats.fail}</span>
          </div>
          {paused && <p className="muted">进度已保存，下次进入复习可从第 {idx + 1} 个词继续。</p>}
          {pending.length > 0 && <button className="btn ghost" onClick={retryPending}><IconRefresh size={18} />重试同步 {pending.length} 条</button>}
          {paused ? (
            <button className="btn primary" onClick={() => setPaused(false)}>继续复习</button>
          ) : (
            <button className="btn primary" onClick={restart}><IconRefresh size={18} />再来一轮</button>
          )}
        </div>
      </div>
    )
  }

  const current = queue[idx]

  return (
    <div className="page review-page">
      {modeTabs}
      {error && (
        <div className="alert error">
          {error}
          {pending.length > 0 && <button className="link-btn alert-action" onClick={retryPending}>立即重试</button>}
        </div>
      )}
      <div className="review-top">
        <div className="review-meta">
          <span className="muted">第 {idx + 1} / {queue.length} 个</span>
          <div className="progress"><i style={{ '--pct': idx / queue.length } as CSSProperties} /></div>
        </div>
        <button className="link-btn" onClick={() => setPaused(true)}>退出复习</button>
      </div>

      <div
        className={`flashcard${revealed ? ' revealed' : ''}`}
        onClick={() => setRevealed((value) => !value)}
        role="button"
        tabIndex={0}
        aria-pressed={revealed}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setRevealed((value) => !value)
          }
        }}
      >
        <div className="flash-inner">
          <div className="flash-face flash-front">
            <h2>{current.word}</h2>
            {current.phonetic && <span className="phonetic">{current.phonetic}</span>}
            <span className="flash-hint">先在脑中回忆意思，再点击卡片</span>
          </div>
          <div className="flash-face flash-back"><WordCard row={current} /></div>
        </div>
      </div>

      {revealed ? (
        <div className="answer-btns">
          <button className="btn ans fail" onClick={() => answer('fail')}><IconX size={20} />不认识</button>
          <button className="btn ans fuzzy" onClick={() => answer('fuzzy')}><IconHelp size={20} />模糊</button>
          <button className="btn ans pass" onClick={() => answer('pass')}><IconCheck size={20} />认识</button>
        </div>
      ) : (
        <div className="answer-btns hint"><span className="muted">回忆好之后点击卡片查看答案</span></div>
      )}
    </div>
  )
}
