import { supabase } from '../supabase'

export interface AiResult {
  zhMeaning: string
  rootAnalysis: string
  mnemonic: string
  wordFamily: string[]
  synonyms: string[]
  examHint: string
}

export function aiErrorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg) return msg
  }
  return String(err)
}

/**
 * 调用 Supabase Edge Function（内部走 DeepSeek API）生成记忆法。
 * DeepSeek key 保存在服务端，不会出现在前端代码里。
 */
export async function generateMnemonic(word: string): Promise<AiResult> {
  if (!supabase) throw new Error('Supabase 未配置')
  const { data, error } = await supabase.functions.invoke('generate-mnemonic', {
    body: { word },
  })
  if (error) throw new Error(error.message ?? 'AI 服务调用失败')
  const payload = data as { result?: AiResult; error?: string }
  if (payload.error) throw new Error(payload.error)
  if (!payload.result) throw new Error('AI 返回数据为空')
  return payload.result
}