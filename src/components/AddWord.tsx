import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { lookupLemma, preloadLocalDictionary, type LookupResult } from '../lib/lookup'
import { generateMnemonic, aiErrorText, type AiResult } from '../lib/ai'
import type { WordRow } from '../types'
import WordCard from './WordCard'
import { addHistory, clearHistory, loadHistory } from '../lib/history'
import { IconCheck, IconPlus, IconSearch } from './icons'

async function fetchRow(id: string): Promise<WordRow> {
  const { data } = await supabase!.from('words').select('*').eq('id', id).single()
  return data as WordRow
}

async function fetchSavedWord(word: string, timeoutMs = 2200): Promise<WordRow | null> {
  if (!supabase) return null
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('word', word)
      .abortSignal(controller.signal)
      .maybeSingle()
    if (error) throw error
    return (data as WordRow | null) ?? null
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchSavedWordList(): Promise<string[]> {
  if (!supabase) return []
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 3500)
  try {
    const { data, error } = await supabase
      .from('words')
      .select('word')
      .order('word')
      .limit(500)
      .abortSignal(controller.signal)
    if (error) throw error
    return (data ?? []).map((row) => row.word).filter(Boolean)
  } finally {
    window.clearTimeout(timer)
  }
}

function wait(ms: number): Promise<null> {
  return new Promise((resolve) => window.setTimeout(() => resolve(null), ms))
}

type AiStatus = 'idle' | 'pending' | 'done' | 'error'

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div className="sec">
      <div className="sec-label">{label}</div>
      <p className="sec-text">{text}</p>
    </div>
  )
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="sec">
      <div className="sec-label">{label}</div>
      <div className="chips">
        {items.map((s) => (
          <span className="chip" key={s}>
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AddWord({
  onSaved,
  canSync = true,
  onRequestLogin,
}: {
  onSaved: () => void
  canSync?: boolean
  onRequestLogin?: () => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [ai, setAi] = useState<AiResult | null>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle')
  const [existing, setExisting] = useState<WordRow | null>(null)
  const [saved, setSaved] = useState<WordRow | null>(null)
  const aiPromiseRef = useRef<Promise<AiResult> | null>(null)
  const genRef = useRef(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [savedWords, setSavedWords] = useState<string[]>([])
  const searchRef = useRef(0)

  useEffect(() => {
    const client = supabase
    if (!client) return
    let cancelled = false
    client.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void preloadLocalDictionary()
  }, [])

  useEffect(() => {
    setHistory(loadHistory(userId))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchSavedWordList()
      .then((words) => {
        if (!cancelled) setSavedWords(words)
      })
      .catch(() => {
        // 生词本不可用时仍可用本地历史和直连词典查词
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    const term = input.trim().toLowerCase()
    setActiveSuggestion(-1)
    if (!focused || !term) {
      setSuggestions([])
      return
    }
    const merged = [
      ...new Set([
        ...savedWords.filter((word) => word.toLowerCase().startsWith(term)),
        ...history.filter((word) => word.startsWith(term)),
      ]),
    ]
    setSuggestions(merged.slice(0, 8))
  }, [input, focused, history, savedWords])


  function reset() {
    setInput('')
    setLookup(null)
    setAi(null)
    setAiStatus('idle')
    setExisting(null)
    setSaved(null)
    setError('')
    setToast('')
    aiPromiseRef.current = null
    genRef.current++
    searchRef.current++
  }

  function generateAi(word: string) {
    if (!canSync) return
    const gen = ++genRef.current
    setAiStatus('pending')
    const p = generateMnemonic(word)
    aiPromiseRef.current = p
    p.then((r) => {
      if (gen !== genRef.current) return
      setAi(r)
      setAiStatus('done')
    }).catch(() => {
      if (gen !== genRef.current) return
      setAiStatus('error')
    }).finally(() => {
      if (gen === genRef.current) aiPromiseRef.current = null
    })
  }

  async function doSearch(raw: string) {
    const word = raw.trim().toLowerCase()
    if (!word || !supabase) return
    const searchId = ++searchRef.current
    setError('')
    setToast('')
    setLookup(null)
    setExisting(null)
    setSaved(null)
    setAi(null)
    setAiStatus('idle')
    aiPromiseRef.current = null
    genRef.current++
    setBusy(true)

    const showExisting = (row: WordRow) => {
      if (searchId !== searchRef.current) return false
      searchRef.current++
      genRef.current++
      aiPromiseRef.current = null
      setHistory(addHistory(userId, row.word))
      setExisting(row)
      setLookup(null)
      setSaved(null)
      setError('')
      setBusy(false)
      return true
    }

    const savedPromise = canSync ? fetchSavedWord(word).catch(() => null) : Promise.resolve(null)
    void savedPromise.then((row) => {
      if (row) showExisting(row)
    })

    try {
      const lk = await lookupLemma(word)
      if (searchId !== searchRef.current) return
      const canonical = lk.word
      if (canSync && canonical !== word) {
        void fetchSavedWord(canonical)
          .then((row) => {
            if (row) showExisting(row)
          })
          .catch(() => null)
      }

      setHistory(addHistory(userId, canonical))
      setLookup(lk)
      generateAi(canonical)
      if (canonical !== word) {
        setInput(canonical)
        setToast(`已自动转为原型：${canonical}（输入：${word}）`)
      }
    } catch (err) {
      if (searchId !== searchRef.current) return
      const saved = await Promise.race([savedPromise, wait(1200)])
      if (saved) {
        showExisting(saved)
        return
      }
      if (searchId !== searchRef.current) return
      genRef.current++
      aiPromiseRef.current = null
      setAi(null)
      setAiStatus('idle')
      setError(aiErrorText(err))
    } finally {
      if (searchId === searchRef.current) setBusy(false)
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault()
    await doSearch(input)
  }

  function pickHistory(word: string) {
    setFocused(false)
    setSuggestions([])
    doSearch(word)
  }

  function pickSuggestion(word: string) {
    setInput(word)
    setFocused(false)
    setSuggestions([])
    doSearch(word)
  }

  function clearAll() {
    clearHistory(userId)
    setHistory([])
  }

  async function save(lk: LookupResult) {
    if (!canSync) {
      onRequestLogin?.()
      return
    }
    const client = supabase
    if (!client) return
    setBusy(true)
    try {
      let aiNow = ai
      const aiWait = aiPromiseRef.current
      if (!aiNow && aiWait) {
        aiNow = await Promise.race([aiWait.catch(() => null), wait(4500)])
        if (aiNow) {
          setAi(aiNow)
          setAiStatus('done')
        }
      }
      const { data, error: insertErr } = await client
        .from('words')
        .insert({
          word: lk.word,
          phonetic: lk.phonetic,
          en_meaning: lk.enMeaning,
          example: lk.example,
          synonyms: lk.synonyms,
          zh_meaning: aiNow?.zhMeaning || lk.zhMeaning || null,
          root_analysis: aiNow?.rootAnalysis || null,
          mnemonic: aiNow?.mnemonic || null,
          word_family: aiNow?.wordFamily ?? [],
          ai_synonyms: aiNow?.synonyms ?? [],
          exam_hint: aiNow?.examHint || null,
          ai_status: aiNow ? 'done' : aiWait ? 'pending' : 'error',
        })
        .select()
        .single()
      if (insertErr) throw insertErr
      const row = data as WordRow
      onSaved()
      setSaved(row)
      setSavedWords((words) => [...new Set([lk.word, ...words])].sort())
      setToast(aiNow ? '已保存到生词本 ✓' : aiWait ? '已保存，中文释义仍在生成' : '已保存，但 AI 释义生成失败，可稍后重试')

      if (!aiNow && aiWait) {
        const generation = genRef.current
        void aiWait
          .then(async (result) => {
            const { data: updated, error: updateError } = await client
              .from('words')
              .update({
                zh_meaning: result.zhMeaning || null,
                root_analysis: result.rootAnalysis || null,
                mnemonic: result.mnemonic || null,
                word_family: result.wordFamily,
                ai_synonyms: result.synonyms,
                exam_hint: result.examHint || null,
                ai_status: 'done',
              })
              .eq('id', row.id)
              .select()
              .single()
            if (updateError) throw updateError
            if (generation !== genRef.current) return
            setAi(result)
            setAiStatus('done')
            setSaved(updated as WordRow)
            setToast('已保存到生词本 ✓')
          })
          .catch(() => {
            if (generation === genRef.current) setAiStatus('error')
          })
      }
    } catch (err) {
      setError(aiErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function regen(row: WordRow) {
    if (!supabase) return
    setAiBusy(true)
    setError('')
    setToast('')
    try {
      const aiResult = await generateMnemonic(row.word)
      await supabase
        .from('words')
        .update({
          zh_meaning: aiResult.zhMeaning || null,
          root_analysis: aiResult.rootAnalysis || null,
          mnemonic: aiResult.mnemonic || null,
          word_family: aiResult.wordFamily,
          ai_synonyms: aiResult.synonyms,
          exam_hint: aiResult.examHint || null,
          ai_status: 'done',
        })
        .eq('id', row.id)
      setSaved(await fetchRow(row.id))
      setToast('AI 记忆法已更新 ✓')
    } catch (err) {
      setError('AI 生成失败：' + aiErrorText(err))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">记词</h1>
      {!canSync && (
        <div className="alert info">免登录查词模式：可以立即查词，登录后才能保存和同步。</div>
      )}
      <div className="search-box">
        <form className="search-bar" onSubmit={search}>
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setFocused(true)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFocused(false)
                e.currentTarget.blur()
              } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
                e.preventDefault()
                setActiveSuggestion((index) => (index + 1) % suggestions.length)
              } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
                e.preventDefault()
                setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
              } else if (e.key === 'Enter' && activeSuggestion >= 0) {
                e.preventDefault()
                pickSuggestion(suggestions[activeSuggestion])
              }
            }}
            placeholder="输入雅思生词，如 inhabitant"
            autoFocus
          />
          <button className="btn primary" disabled={busy || !input.trim()}>
            <IconSearch size={18} />
            {busy ? '查询中…' : '查询'}
          </button>
        </form>

        {focused && (suggestions.length > 0 || (!input.trim() && history.length > 0)) && (
          <div className="history-drop">
            <div className="history-head">
              <span className="history-title">{input.trim() ? '可能是' : '最近查询'}</span>
              {!input.trim() && <button className="history-clear" onMouseDown={(e) => e.preventDefault()} onClick={clearAll}>清空</button>}
            </div>
            <ul className="history-list">
              {(input.trim() ? suggestions : history.slice(0, 5)).map((w, index) => (
                <li key={w}>
                  <button
                    className={`history-item ${activeSuggestion === index ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (input.trim() ? pickSuggestion(w) : pickHistory(w))}
                  >
                    <IconSearch size={14} />
                    {w}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {toast && <div className="alert info">{toast}</div>}

      {existing && (
        <div className="card">
          <p className="muted">这个词已经在生词本里了 👀</p>
          <WordCard row={existing} />
        </div>
      )}

      {lookup && !existing && !saved && (
        <div className="card">
          <div className="word-head">
            <div className="word-title">
              <h2>{lookup.word}</h2>
              {lookup.phonetic && <span className="phonetic">{lookup.phonetic}</span>}
            </div>
          </div>

          <button
            className="btn primary save-word-btn"
            disabled={canSync && busy}
            onClick={() => (canSync ? void save(lookup) : onRequestLogin?.())}
          >
            <IconCheck size={18} />
            {!canSync ? '登录后保存' : busy ? '保存中…' : '保存到生词本'}
          </button>

          {aiStatus === 'pending' && (
            <div className="sec">
              <div className="sec-label">AI 助记</div>
              <p className="muted">AI 正在补充释义和记忆法…</p>
            </div>
          )}
          {lookup.zhMeaning && !ai && (
            <div className="sec">
              <div className="sec-label">中文释义</div>
              <p className="zh">{lookup.zhMeaning}</p>
            </div>
          )}
          {ai && (
            <>
              <div className="sec">
                <div className="sec-label">中文释义</div>
                <p className="zh">{ai.zhMeaning}</p>
              </div>
              {ai.rootAnalysis && <Section label="词根词缀" text={ai.rootAnalysis} />}
              {ai.mnemonic && <Section label="记忆法" text={ai.mnemonic} />}
              {ai.examHint && <Section label="雅思提示" text={ai.examHint} />}
              {ai.wordFamily.length > 0 && <Chips label="词族 / 派生" items={ai.wordFamily} />}
              {ai.synonyms.length > 0 && <Chips label="雅思同义替换" items={ai.synonyms} />}
            </>
          )}
          {aiStatus === 'error' && (
            <div className="alert error">AI 中文释义生成失败，仍可保存到生词本，稍后重试</div>
          )}

          {lookup.partOfSpeech && <span className="pill">{lookup.partOfSpeech}</span>}
          {lookup.enMeaning && <p className="en">{lookup.enMeaning}</p>}
          {lookup.example && (
            <div className="example">
              <span className="sec-label">例句</span>
              <p className="sec-text">{lookup.example}</p>
            </div>
          )}
          {lookup.synonyms.length > 0 && <Chips label="同义词" items={lookup.synonyms} />}

        </div>
      )}

      {saved && (
        <div className="card">
          <p className="muted">已保存 ✓</p>
          <WordCard row={saved} onRegen={() => regen(saved)} busy={aiBusy} />
          <button className="btn ghost" onClick={reset}>
            <IconPlus size={18} />
            再记一个
          </button>
        </div>
      )}
    </div>
  )
}
