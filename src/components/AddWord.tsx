import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { lookupLemma, type LookupResult } from '../lib/lookup'
import { generateMnemonic, aiErrorText, type AiResult } from '../lib/ai'
import type { WordRow } from '../types'
import WordCard from './WordCard'
import { addHistory, clearHistory, loadHistory } from '../lib/history'
import { IconCheck, IconPlus, IconSearch } from './icons'

async function fetchRow(id: string): Promise<WordRow> {
  const { data } = await supabase!.from('words').select('*').eq('id', id).single()
  return data as WordRow
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

export default function AddWord({ onSaved }: { onSaved: () => void }) {
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

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setHistory(loadHistory(userId))
  }, [userId])

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
  }

  function generateAi(word: string) {
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
    try {
      // 先快速查生词本：直接输入原型时命中即显示，不额外查词典
      const first = await supabase
        .from('words')
        .select('*')
        .eq('word', word)
        .maybeSingle()
      if (first.data) {
        setHistory(addHistory(userId, word))
        setExisting(first.data as WordRow)
        return
      }
      // 未命中才还原原型（went→go、inhabitants→inhabitant 等），再用原型查词/查重/生成助记
      const lk = await lookupLemma(word)
      const canonical = lk.word
      setHistory(addHistory(userId, canonical))
      const found =
        canonical === word ? first : await supabase.from('words').select('*').eq('word', canonical).maybeSingle()
      if (found.data) {
        setExisting(found.data as WordRow)
      } else {
        generateAi(canonical)
        setLookup(lk)
      }
      if (canonical !== word) {
        setInput(canonical)
        setToast(`已自动转为原型：${canonical}（输入：${word}）`)
      }
    } catch (err) {
      // 查词失败时作废进行中的 AI 生成
      genRef.current++
      aiPromiseRef.current = null
      setAi(null)
      setAiStatus('idle')
      setError(aiErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault()
    await doSearch(input)
  }

  function pickHistory(word: string) {
    setFocused(false)
    doSearch(word)
  }

  function clearAll() {
    clearHistory(userId)
    setHistory([])
  }

  async function save(lk: LookupResult) {
    if (!supabase) return
    setBusy(true)
    try {
      let aiNow = ai
      if (aiPromiseRef.current) {
        try {
          aiNow = await aiPromiseRef.current
          setAi(aiNow)
          setAiStatus('done')
        } catch {
          setAiStatus('error')
        }
      }
      const { data, error: insertErr } = await supabase
        .from('words')
        .insert({
          word: lk.word,
          phonetic: lk.phonetic,
          en_meaning: lk.enMeaning,
          example: lk.example,
          synonyms: lk.synonyms,
          zh_meaning: aiNow?.zhMeaning || null,
          root_analysis: aiNow?.rootAnalysis || null,
          mnemonic: aiNow?.mnemonic || null,
          word_family: aiNow?.wordFamily ?? [],
          ai_synonyms: aiNow?.synonyms ?? [],
          exam_hint: aiNow?.examHint || null,
          ai_status: aiNow ? 'done' : 'error',
        })
        .select()
        .single()
      if (insertErr) throw insertErr
      const row = data as WordRow
      onSaved()
      setSaved(row)
      setToast(aiNow ? '已保存到生词本 ✓' : '已保存，但 AI 释义生成失败，可稍后重试')
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
      <div className="search-box">
        <form className="search-bar" onSubmit={search}>
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setFocused(true)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFocused(false)
                e.currentTarget.blur()
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

        {focused && history.length > 0 && (
          <div className="history-drop">
            <div className="history-head">
              <span className="history-title">最近查询</span>
              <button
                className="history-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearAll}
              >
                清空
              </button>
            </div>
            <ul className="history-list">
              {history.slice(0, 5).map((w) => (
                <li key={w}>
                  <button
                    className="history-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickHistory(w)}
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

          <button className="btn primary save-word-btn" disabled={busy} onClick={() => save(lookup)}>
            <IconCheck size={18} />
            {busy ? '保存中…' : '保存到生词本'}
          </button>

          {aiStatus === 'pending' && (
            <div className="sec">
              <div className="sec-label">中文释义</div>
              <p className="muted">AI 正在生成中文释义…</p>
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
