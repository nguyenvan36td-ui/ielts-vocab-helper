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

interface DatamuseItem {
  word?: string
  defs?: string[]
  tags?: string[]
}

export interface LookupResult {
  word: string
  phonetic: string | null
  partOfSpeech: string | null
  enMeaning: string | null
  example: string | null
  synonyms: string[]
  zhMeaning?: string | null
}

type LookupErrorKind = 'notfound' | 'network' | 'server'

type LocalDictionaryEntry = [phonetic: string, enMeaning: string, zhMeaning: string, partOfSpeech: string, tags: string[], rank: number]
type LocalDictionary = Record<string, LocalDictionaryEntry>

class LookupError extends Error {
  readonly kind: LookupErrorKind

  constructor(message: string, kind: LookupErrorKind) {
    super(message)
    this.name = 'LookupError'
    this.kind = kind
  }
}

const DICT_TIMEOUT_MS = 3000
const DATAMUSE_TIMEOUT_MS = 2800
const EDGE_TIMEOUT_MS = 4000
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'ielts-vocab-lookup:v2:'

let localDictionaryPromise: Promise<LocalDictionary | null> | null = null

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))]
}

function normalizedWord(raw: string): string {
  return raw.trim().toLowerCase()
}

function cacheGet(word: string): LookupResult | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${word}`)
    if (!raw) return null
    const cached = JSON.parse(raw) as { at?: number; result?: LookupResult }
    if (!cached.at || !cached.result || Date.now() - cached.at > CACHE_TTL_MS) {
      localStorage.removeItem(`${CACHE_PREFIX}${word}`)
      return null
    }
    return cached.result
  } catch {
    return null
  }
}

function cacheSet(word: string, result: LookupResult): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${word}`, JSON.stringify({ at: Date.now(), result }))
  } catch {
    // 忽略隐私模式或存储空间不足
  }
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

export function preloadLocalDictionary(): Promise<LocalDictionary | null> {
  if (!localDictionaryPromise) {
    const url = `${import.meta.env.BASE_URL}local-dictionary.json`
    localDictionaryPromise = fetchWithTimeout(url, 5000)
      .then(async (res) => {
        if (!res.ok) return null
        return (await res.json()) as LocalDictionary
      })
      .catch(() => null)
  }
  return localDictionaryPromise
}

async function lookupLocalWord(word: string): Promise<LookupResult | null> {
  const dictionary = await preloadLocalDictionary()
  const entry = dictionary?.[word]
  if (!entry) return null
  const [phonetic, enMeaning, zhMeaning, partOfSpeech] = entry
  return {
    word,
    phonetic: phonetic || null,
    partOfSpeech: partOfSpeech || null,
    enMeaning: enMeaning || null,
    example: null,
    synonyms: [],
    zhMeaning: zhMeaning || null,
  }
}

async function lookupDictionaryApi(word: string): Promise<LookupResult> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  let res: Response
  try {
    res = await fetchWithTimeout(url, DICT_TIMEOUT_MS)
  } catch {
    throw new LookupError('直连词典超时', 'network')
  }

  if (res.status === 404) {
    throw new LookupError(`词典中未找到 "${word}"，请检查拼写`, 'notfound')
  }
  if (!res.ok) {
    throw new LookupError(`免费词典暂时不可用（HTTP ${res.status}）`, 'server')
  }

  const entries = (await res.json()) as DictEntry[]
  const entry = entries?.[0]
  if (!entry) {
    throw new LookupError(`词典中未找到 "${word}"，请检查拼写`, 'notfound')
  }

  const phonetic = entry.phonetic ?? entry.phonetics?.find((p) => p.text)?.text ?? null
  const meaning = entry.meanings?.[0]
  const firstDef = meaning?.definitions?.find((d) => d.definition)
  const synonyms = dedupe([
    ...(meaning?.synonyms ?? []),
    ...(meaning?.definitions ?? []).flatMap((d) => d.synonyms ?? []),
  ]).slice(0, 8)

  return {
    word: entry.word ?? word,
    phonetic,
    partOfSpeech: meaning?.partOfSpeech ?? null,
    enMeaning: firstDef?.definition ?? null,
    example: firstDef?.example ?? null,
    synonyms,
  }
}

function parseDatamuseDef(def: string): { pos: string; text: string } | null {
  const idx = def.indexOf('\t')
  if (idx > 0) return { pos: def.slice(0, idx).trim(), text: def.slice(idx + 1).trim() }
  return def.trim() ? { pos: '', text: def.trim() } : null
}

async function lookupDatamuse(word: string): Promise<LookupResult> {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=5`
  let res: Response
  try {
    res = await fetchWithTimeout(url, DATAMUSE_TIMEOUT_MS)
  } catch {
    throw new LookupError('备用词典超时', 'network')
  }
  if (!res.ok) {
    throw new LookupError(`备用词典暂时不可用（HTTP ${res.status}）`, 'server')
  }

  const items = (await res.json()) as DatamuseItem[]
  const item = items.find((i) => (i.word ?? '').toLowerCase() === word && (i.defs?.length ?? 0) > 0)
  if (!item) {
    throw new LookupError(`词典中未找到 "${word}"，请检查拼写`, 'notfound')
  }

  const first = item.defs?.[0] ? parseDatamuseDef(item.defs[0]) : null
  const tag = (item.tags ?? []).find((t) => ['n', 'v', 'adj', 'adv', 'u'].includes(t))
  const posMap: Record<string, string> = {
    n: 'noun',
    v: 'verb',
    adj: 'adjective',
    adv: 'adverb',
    u: 'unknown',
  }

  return {
    word,
    phonetic: null,
    partOfSpeech: (tag && posMap[tag]) || first?.pos || null,
    enMeaning: first?.text || null,
    example: null,
    synonyms: [],
  }
}

async function lookupEdge(word: string): Promise<LookupResult> {
  if (!supabase) throw new LookupError('Supabase 未配置', 'network')

  const res = await supabase.functions
    .invoke('lookup-word', {
      body: { word },
      timeout: EDGE_TIMEOUT_MS,
    })
    .catch((err: unknown) => {
      console.warn('服务端查词调用失败:', err)
      return null
    })

  if (res?.error) {
    throw new LookupError(res.error.message || '服务端查词失败', 'network')
  }

  const payload = res?.data as { result?: LookupResult; error?: string } | undefined
  if (payload?.result) return payload.result
  const message = payload?.error || '服务端查词失败'
  const kind: LookupErrorKind = message.includes('未找到') ? 'notfound' : 'network'
  throw new LookupError(message, kind)
}

type LookupAttempt = { result: LookupResult } | { error: LookupError }

function hasLookupResult(item: LookupAttempt): item is { result: LookupResult } {
  return 'result' in item
}

async function lookupDirectWord(word: string): Promise<LookupResult> {
  const cached = cacheGet(word)
  if (cached) return cached

  const local = await lookupLocalWord(word)
  if (local) {
    cacheSet(word, local)
    return local
  }

  const reasons: LookupError[] = []
  try {
    const result = await Promise.any([lookupDictionaryApi(word), lookupDatamuse(word)])
    cacheSet(word, result)
    return result
  } catch (err) {
    if (err instanceof AggregateError) {
      reasons.push(...(err.errors as unknown[]).filter((e): e is LookupError => e instanceof LookupError))
    }
  }

  if (reasons.length > 0 && reasons.every((e) => e.kind === 'notfound')) {
    throw new LookupError(`词典中未找到 "${word}"，请检查拼写`, 'notfound')
  }
  throw reasons[0] ?? new LookupError('直连词典失败', 'network')
}

/**
 * 查词：优先直连免费词典，超时或失败后再走 Supabase Edge Function。
 * 直连路径恢复了原来的无 VPN 使用方式，Edge 只作为后备，不再拖慢主路径。
 */
export async function lookupWord(raw: string): Promise<LookupResult> {
  const word = normalizedWord(raw)
  if (!word) throw new Error('请输入要查的单词')

  let directError: LookupError
  try {
    return await lookupDirectWord(word)
  } catch (err) {
    directError = err instanceof LookupError ? err : new LookupError('直连词典失败', 'network')
  }

  try {
    const result = await lookupEdge(word)
    cacheSet(word, result)
    return result
  } catch (edgeError) {
    if (
      directError.kind === 'notfound' &&
      edgeError instanceof LookupError &&
      edgeError.kind === 'notfound'
    ) {
      throw new Error(`词典中未找到 "${word}"，请检查拼写`)
    }
  }

  throw new Error('查词网络超时，请检查网络后重试')
}

/**
 * 查词并自动还原原型：
 * 输入可能是过去式/复数等变体，并行尝试候选原型，按候选优先级返回第一个命中项。
 */
export async function lookupLemma(raw: string): Promise<LookupResult> {
  const word = normalizedWord(raw)
  if (!word) throw new Error('请输入要查的单词')
  const candidates = lemmatizeCandidates(word)

  if (candidates.length === 0) return lookupWord(word)

  const forms = [...candidates, word]
  const direct: LookupAttempt[] = await Promise.all(
    forms.map(async (form) => {
      try {
        return { result: await lookupDirectWord(form) }
      } catch (err) {
        return { error: err instanceof LookupError ? err : new LookupError('直连词典失败', 'network') }
      }
    }),
  )

  const directHit = direct.find(hasLookupResult)
  if (directHit) return directHit.result

  const directErrors = direct.flatMap((item) => ('error' in item ? [item.error] : []))
  if (directErrors.length > 0 && directErrors.every((e) => e.kind === 'notfound')) {
    throw new Error(`词典中未找到 "${word}"，请检查拼写`)
  }

  const edge: LookupAttempt[] = await Promise.all(
    forms.map(async (form) => {
      try {
        return { result: await lookupEdge(form) }
      } catch (err) {
        return { error: err instanceof LookupError ? err : new LookupError('服务端查词失败', 'network') }
      }
    }),
  )

  const edgeHit = edge.find(hasLookupResult)
  if (edgeHit) {
    cacheSet(edgeHit.result.word, edgeHit.result)
    return edgeHit.result
  }

  const edgeErrors = edge.flatMap((item) => ('error' in item ? [item.error] : []))
  const errors = [...directErrors, ...edgeErrors]
  if (errors.length > 0 && errors.every((e) => e.kind === 'notfound')) {
    throw new Error(`词典中未找到 "${word}"，请检查拼写`)
  }
  throw new Error('查词网络超时，请检查网络后重试')
}
