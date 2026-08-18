import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { generateMnemonic, aiErrorText } from '../lib/ai'
import { isDue } from '../lib/srs'
import type { WordRow } from '../types'
import WordCard from './WordCard'
import { IconBookOpen, IconCheck, IconChevronDown, IconRefresh, IconSearch, IconTrash } from './icons'

type Filter = 'all' | 'due' | 'mastered'

export default function Library({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<WordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('words')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!error) setRows((data ?? []) as WordRow[])
        setLoading(false)
      })
  }, [])

  async function remove(row: WordRow) {
    if (!supabase) return
    if (!confirm(`确定删除 "${row.word}" 吗？`)) return
    const { error } = await supabase.from('words').delete().eq('id', row.id)
    if (!error) {
      setRows((rs) => rs.filter((r) => r.id !== row.id))
      onChanged()
    }
  }

  async function regen(row: WordRow) {
    if (!supabase) return
    setBusyId(row.id)
    setError('')
    try {
      const ai = await generateMnemonic(row.word)
      await supabase
        .from('words')
        .update({
          zh_meaning: ai.zhMeaning || null,
          root_analysis: ai.rootAnalysis || null,
          mnemonic: ai.mnemonic || null,
          word_family: ai.wordFamily,
          ai_synonyms: ai.synonyms,
          exam_hint: ai.examHint || null,
          ai_status: 'done',
        })
        .eq('id', row.id)
      const { data } = await supabase.from('words').select('*').eq('id', row.id).single()
      if (data) setRows((rs) => rs.map((r) => (r.id === row.id ? (data as WordRow) : r)))
    } catch (err) {
      setError('AI 生成失败：' + aiErrorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const filtered = rows
    .filter((r) => {
      if (filter === 'due') return isDue(r)
      if (filter === 'mastered') return r.mastered
      return true
    })
    .filter((r) => {
      const qq = q.trim().toLowerCase()
      if (!qq) return true
      return (
        r.word.toLowerCase().includes(qq) || (r.zh_meaning ?? '').toLowerCase().includes(qq)
      )
    })

  const dueCount = rows.filter(isDue).length
  const masteredCount = rows.filter((r) => r.mastered).length

  return (
    <div className="page">
      <h1 className="page-title">生词本</h1>
      <div className="stats">
        <span>共 {rows.length} 词</span>
        <span>待复习 {dueCount}</span>
        <span>已掌握 {masteredCount}</span>
      </div>

      <div className="tabs">
        {(
          [
            ['all', '全部'],
            ['due', '待复习'],
            ['mastered', '已掌握'],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={`tab${filter === id ? ' active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="search-wrap">
        <IconSearch size={18} />
        <input
          className="search-input"
          placeholder="搜索单词或中文释义…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <p className="muted">加载中…</p>
      ) : filtered.length === 0 ? (
        <div className="card center">
          <div className="empty-icon">
            <IconBookOpen size={26} />
          </div>
          <p className="muted">
            这里空空如也{rows.length === 0 ? '，去「记词」添加第一个生词吧' : ''}
          </p>
        </div>
      ) : (
        <div className="list">
          {filtered.map((row) => {
            const open = openId === row.id
            return (
              <div className={`card list-row${open ? ' open' : ''}`} key={row.id}>
                <button
                  className="row-main"
                  onClick={() => setOpenId(open ? null : row.id)}
                  aria-expanded={open}
                >
                  <div className="row-left">
                    <span className="row-word">{row.word}</span>
                    {row.phonetic && <span className="phonetic small">{row.phonetic}</span>}
                    <span className="row-zh">{row.zh_meaning ?? ''}</span>
                  </div>
                  <div className="row-right">
                    <span className={`pill${row.mastered ? ' mastered' : ''}`}>
                      {row.mastered ? '已掌握' : isDue(row) ? '待复习' : ''}
                    </span>
                    <span className={`chevron${open ? ' open' : ''}`}>
                      <IconChevronDown size={18} />
                    </span>
                  </div>
                </button>
                <div className={`row-detail-wrap${open ? ' open' : ''}`}>
                  <div className="row-detail-inner">
                    <div className="row-detail">
                      <WordCard row={row} onRegen={() => regen(row)} busy={busyId === row.id} />
                      <div className="row-btns">
                        {!row.mastered ? (
                          <button
                            className="btn ghost"
                            onClick={async () => {
                              await supabase
                                ?.from('words')
                                .update({ mastered: true, next_review_at: null })
                                .eq('id', row.id)
                              setRows((rs) =>
                                rs.map((r) =>
                                  r.id === row.id ? { ...r, mastered: true, next_review_at: null } : r,
                                ),
                              )
                              onChanged()
                            }}
                          >
                            <IconCheck size={16} />
                            标记已掌握
                          </button>
                        ) : (
                          <button
                            className="btn ghost"
                            onClick={async () => {
                              await supabase
                                ?.from('words')
                                .update({ mastered: false, next_review_at: new Date().toISOString() })
                                .eq('id', row.id)
                              setRows((rs) =>
                                rs.map((r) =>
                                  r.id === row.id
                                    ? { ...r, mastered: false, next_review_at: new Date().toISOString() }
                                    : r,
                                ),
                              )
                              onChanged()
                            }}
                          >
                            <IconRefresh size={16} />
                            取消掌握
                          </button>
                        )}
                        <button className="btn danger" onClick={() => remove(row)}>
                          <IconTrash size={16} />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
