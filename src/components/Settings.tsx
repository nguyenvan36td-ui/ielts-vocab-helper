import type { ReactNode } from 'react'
import { supabase } from '../supabase'
import { IconInfo, IconLogout, IconSparkle, IconUser } from './icons'

function SettingHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="setting-head">
      <span className="set-icon">{icon}</span>
      <h3>{title}</h3>
    </div>
  )
}

export default function Settings({ email }: { email: string }) {
  return (
    <div className="page">
      <h1 className="page-title">我的</h1>

      <div className="card">
        <SettingHead icon={<IconUser size={19} />} title="账号" />
        <p className="muted">{email}</p>
        <p className="muted small">
          数据保存在云端数据库，电脑和手机登录同一账号即可同步。
        </p>
        <button
          className="btn danger"
          onClick={() => {
            void supabase?.auth.signOut()
          }}
        >
          <IconLogout size={17} />
          退出登录
        </button>
      </div>

      <div className="card">
        <SettingHead icon={<IconSparkle size={19} />} title="AI 记忆法说明" />
        <p className="small">
          中文释义、词根词缀/词源、联想记忆法由 DeepSeek AI 生成，key 保存在服务端
          （Supabase Edge Function 环境变量 <code>DEEPSEEK_API_KEY</code>），不会出现在网页代码中。
        </p>
        <p className="small">同一个词只生成一次并缓存，重复添加不会重复扣费。</p>
      </div>

      <div className="card">
        <SettingHead icon={<IconInfo size={19} />} title="关于" />
        <p className="small">
          雅思词汇助手 v0.1 · 查词（免费词典 API）+ AI 记忆法（DeepSeek）+ 闪卡复习（间隔重复）。
        </p>
      </div>
    </div>
  )
}
