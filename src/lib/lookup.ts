import { supabase } from '../supabase'
import { lemmatizeCandidates } from './lemmatize'

interface DictPhonetic {
  text?: string
  audio?: string
}

interface DictDefinition {
  definition?: string
  example?: string
  synonyms?: string[]
}

interface DictMeaning {
  partOfSpeech?: string
  definitions?: DictDefinition[]
  synonyms?: string[]
}

interface DictEntry {
  word?: string
  phonetic?: string
  phonetics?: DictPhonetic[]
  meanings?: DictMeaning[]
}

export interface LookupResult {
  word: string
  phonetic: string | null
  partOfSpeech: string | null
  enMeaning: string | null
  example: string | null
  synonyms: string[]
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))]
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 词典结果缺音标时，从本地音标表（ipa-dict 数据）补全 */
async function enrichPhonetic(word: string, result: LookupResult): Promise<LookupResult> {
  if (result.phonetic || !supabase) return result
  const { data } = await supabase
    .from('phonetics')
    .select('ipa')
    .eq('word', word)
    .maybeSingle()
  if (data && typeof data.ipa === 'string' && data.ipa) {
    return { ...result, phonetic: data.ipa }
  }
  return result
}

/**
 * 查词并自动还原原型：
 * 输入可能是过去式/复数等变体，依次尝试候选原型，返回第一个词典能查到的原型。
 * 全部候选都查不到时抛错，由调用方提示。
 */
export async function lookupLemma(raw: string): Promise<LookupResult> {
  const word = raw.trim().toLowerCase()
  if (!word) throw new Error('请输入要查的单词')
  const candidates = lemmatizeCandidates(word)
  for (const c of candidates) {
    try {
      return await lookupWord(c)
    } catch {
      // 继续尝试下一个候选
    }
  }
  // 兜底：原样查一遍，失败则把最后一次错误抛给调用方
  try {
    return await lookupWord(word)
  } catch (err) {
    throw err instanceof Error ? err : new Error(`词典中未找到 "${word}"，请检查拼写`)
  }
}

/**
 * 查词：优先调用 Supabase Edge Function（服务端代查，绕过本地网络限制），
 * Edge Function 不可用时再回退为浏览器直连免费词典 API。
 */
export async function lookupWord(raw: string): Promise<LookupResult> {
  const word = raw.trim().toLowerCase()
  if (!word) throw new Error('请输入要查的单词')

  if (supabase) {
    // 函数返回明确结果（成功或查无此词/超时）时直接采用，不回退；
    // 只有函数本身调用失败（网络/网关）时才回退直连词典。
    const res = await supabase.functions
      .invoke('lookup-word', { body: { word } })
      .catch((err: unknown) => {
        console.warn('服务端查词调用失败，回退直连词典:', err)
        return null
      })
    if (res && !res.error && res.data && typeof res.data === 'object') {
      const payload = res.data as { result?: LookupResult; error?: string }
      if (payload.result) return enrichPhonetic(word, payload.result)
      if (payload.error) throw new Error(payload.error)
    }
  }

  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  let res: Response
  try {
    res = await fetchWithTimeout(url, 8000)
  } catch {
    throw new Error('查词网络超时，请检查网络后重试')
  }

  if (res.status === 404) throw new Error(`词典中未找到 "${word}"，请检查拼写`)
  if (!res.ok) throw new Error(`免费词典暂时不可用（HTTP ${res.status}）`)

  const entries = (await res.json()) as DictEntry[]
  const entry = entries?.[0]
  if (!entry) throw new Error(`词典中未找到 "${word}"，请检查拼写`)

  const phonetic = entry.phonetic ?? entry.phonetics?.find((p) => p.text)?.text ?? null
  const meaning = entry.meanings?.[0]
  const firstDef = meaning?.definitions?.find((d) => d.definition)
  const synonyms = dedupe([
    ...(meaning?.synonyms ?? []),
    ...(meaning?.definitions ?? []).flatMap((d) => d.synonyms ?? []),
  ]).slice(0, 8)

  return enrichPhonetic(word, {
    word: entry.word ?? word,
    phonetic,
    partOfSpeech: meaning?.partOfSpeech ?? null,
    enMeaning: firstDef?.definition ?? null,
    example: firstDef?.example ?? null,
    synonyms,
  })
}