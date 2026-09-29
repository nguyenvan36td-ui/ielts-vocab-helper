import type { WordRow } from '../types'
import { IconSparkle } from './icons'
import { fmtDue } from '../lib/srs'

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

export default function WordCard({
  row,
  onRegen,
  busy,
}: {
  row: WordRow
  onRegen?: () => void
  busy?: boolean
}) {
  const syns = [...new Set([...(row.ai_synonyms ?? []), ...(row.synonyms ?? [])])].slice(0, 10)

  return (
    <div className="card word-card">
      <div className="word-head">
        <div className="word-title">
          <h2>{row.word}</h2>
          {row.phonetic && <span className="phonetic">{row.phonetic}</span>}
        </div>
        <span className={`pill${row.mastered ? ' mastered' : ''}`}>
          {row.mastered ? '已掌握' : fmtDue(row)}
        </span>
      </div>

      {row.zh_meaning && <p className="zh">{row.zh_meaning}</p>}
      {row.en_meaning && <p className="en">{row.en_meaning}</p>}
      {row.root_analysis && <Section label="词根词缀" text={row.root_analysis} />}
      {row.mnemonic && <Section label="记忆法" text={row.mnemonic} />}
      {row.exam_hint && <Section label="雅思提示" text={row.exam_hint} />}
      {syns.length > 0 && <Chips label="同义替换" items={syns} />}
      {row.word_family && row.word_family.length > 0 && <Chips label="词族 / 派生" items={row.word_family} />}
      {row.example && (
        <div className="example">
          <span className="sec-label">例句</span>
          <p className="sec-text">{row.example}</p>
        </div>
      )}

      {onRegen && (
        <button className="btn ghost" onClick={onRegen} disabled={busy}>
          <IconSparkle size={16} />
          {busy
            ? 'AI 生成中…'
            : row.ai_status === 'none' || row.ai_status === 'pending'
              ? '生成记忆法'
              : '重新生成记忆法'}
        </button>
      )}
    </div>
  )
}