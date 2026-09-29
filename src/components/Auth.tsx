import { useState, type FormEvent } from 'react'
import { isSupabaseConfigured, supabase } from '../supabase'
import { IconLock, IconMail } from './icons'

export default function Auth({ onGuest }: { onGuest?: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    setInfo('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw new Error(err.message)
        setInfo('注册成功！若开启了邮箱确认，请先查收邮件点击确认，再回来登录。')
        setMode('login')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            <span className="auth-logo-char">雅</span>
          </div>
          <h1>雅思词汇助手</h1>
          <p className="muted">还没有配置 Supabase，请先完成配置再使用：</p>
          <ol className="config-list">
            <li>在 <code>supabase.com</code> 注册并新建项目</li>
            <li>把项目的 URL 和 anon key 填入根目录 <code>.env</code> 文件</li>
            <li>在 SQL Editor 执行 <code>supabase/seed.sql</code></li>
            <li>部署 <code>generate-mnemonic</code> Edge Function 并配置 DeepSeek key</li>
          </ol>
          <p className="muted">详细步骤见项目根目录的 <code>README.md</code>。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <span className="auth-logo-char">雅</span>
        </div>
        <h1>雅思词汇助手</h1>
        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert info">{info}</div>}
        <label>
          邮箱
          <span className="input-with-icon">
            <IconMail size={17} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </span>
        </label>
        <label>
          密码
          <span className="input-with-icon">
            <IconLock size={17} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </span>
        </label>
        <button className="btn primary block" disabled={loading}>
          {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError('')
            setInfo('')
          }}
        >
          {mode === 'login' ? '没有账号？注册一个' : '已有账号？去登录'}
        </button>
        {onGuest && (
          <button type="button" className="btn ghost block" onClick={onGuest}>
            先查词（无需登录）
          </button>
        )}
      </form>
    </div>
  )
}
