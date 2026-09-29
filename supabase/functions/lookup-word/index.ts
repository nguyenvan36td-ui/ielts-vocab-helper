import "jsr:@supabase/functions-js/edge-runtime.d.ts"

interface DictPhonetic {
  text?: string
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

interface LookupResult {
  word: string
  phonetic: string | null
  partOfSpeech: string | null
  enMeaning: string | null
  example: string | null
  synonyms: string[]
}

type DictOutcome =
  | { kind: 'ok'; result: LookupResult }
  | { kind: 'notfound' }
  | { kind: 'error' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))]
}

// 简单内存缓存：24 小时内重复查询同一个词直接返回，避免反复请求词典
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, { at: number; result: LookupResult }>()

function cacheGet(word: string): LookupResult | null {
  const hit = cache.get(word)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(word)
    return null
  }
  return hit.result
}

function cacheSet(word: string, result: LookupResult) {
  cache.set(word, { at: Date.now(), result })
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// 主源：dictionaryapi.dev（数据全：音标/释义/例句/同义词），偶尔 502/限流/超时
async function lookupDictApi(word: string): Promise<DictOutcome> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, 4000)
      if (res.ok) {
        const entries = (await res.json()) as DictEntry[]
        const entry = entries?.[0]
        if (!entry) return { kind: 'notfound' }
        const phonetic = entry.phonetic ?? entry.phonetics?.find((p) => p.text)?.text ?? null
        const meaning = entry.meanings?.[0]
        const firstDef = meaning?.definitions?.find((d) => d.definition)
        const synonyms = dedupe([
          ...(meaning?.synonyms ?? []),
          ...(meaning?.definitions ?? []).flatMap((d) => d.synonyms ?? []),
        ]).slice(0, 8)
        return {
          kind: 'ok',
          result: {
            word: entry.word ?? word,
            phonetic,
            partOfSpeech: meaning?.partOfSpeech ?? null,
            enMeaning: firstDef?.definition ?? null,
            example: firstDef?.example ?? null,
            synonyms,
          },
        }
      }
      if (res.status === 404) return { kind: 'notfound' }
      if (attempt === 0) await sleep(300)
    } catch {
      if (attempt === 0) await sleep(200)
    }
  }
  return { kind: 'error' }
}

// 备用源：Datamuse（稳定、免费、无需 key，只有释义和词性）
interface DatamuseItem {
  word?: string
  defs?: string[]
  tags?: string[]
}

function parseDatamuseDef(def: string): { pos: string; text: string } | null {
  const idx = def.indexOf('\t')
  if (idx > 0) return { pos: def.slice(0, idx).trim(), text: def.slice(idx + 1).trim() }
  return { pos: '', text: def.trim() }
}

async function lookupDatamuse(word: string): Promise<DictOutcome> {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=5`
  try {
    const res = await fetchWithTimeout(url, 3500)
    if (!res.ok) return { kind: 'error' }
    const items = (await res.json()) as DatamuseItem[]
    const item = items.find((i) => (i.word ?? '').toLowerCase() === word && (i.defs?.length ?? 0) > 0)
    if (!item) return { kind: 'notfound' }
    const first = parseDatamuseDef(item.defs![0])
    // 词性优先取 tags（如 n/v/adj/adv），没有再从释义前缀解析
    const tag = (item.tags ?? []).find((t) => ['n', 'v', 'adj', 'adv', 'u'].includes(t))
    const posMap: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', u: 'unknown' }
    const pos = (tag && posMap[tag]) || first?.pos || null
    return {
      kind: 'ok',
      result: {
        word,
        phonetic: null,
        partOfSpeech: pos,
        enMeaning: first?.text || null,
        example: null,
        synonyms: [],
      },
    }
  } catch {
    return { kind: 'error' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { word } = await req.json()
    const w = String(word ?? '').trim().toLowerCase()
    if (!w) return json({ error: '请输入要查的单词' })

    const cached = cacheGet(w)
    if (cached) return json({ result: cached })

    // 主源和备用源并行发起。主源最多等 3.5 秒，
    // 超时/失败时立刻改用备用源，避免用户干等十几秒
    const dictP = lookupDictApi(w)
    const datP = lookupDatamuse(w)

    const dict = await Promise.race([dictP, sleep(3500).then(() => null)])
    if (dict && dict.kind === 'ok') {
      cacheSet(w, dict.result)
      return json({ result: dict.result })
    }

    const dat = await Promise.race([datP, sleep(3000).then(() => null)])
    if (dat && dat.kind === 'ok') {
      cacheSet(w, dat.result)
      return json({ result: dat.result })
    }

    // 两个源都明确查无此词
    if (dict?.kind === 'notfound' && dat?.kind === 'notfound') {
      return json({ error: `词典中未找到 "${w}"，请检查拼写` })
    }
    // 主源明确查无此词、备用源也没给出结果 → 大概率是真没有
    if (dict?.kind === 'notfound' && (dat === null || dat.kind === 'error')) {
      return json({ error: `词典中未找到 "${w}"，请检查拼写` })
    }
    // 至少一个源是网络/服务异常
    return json({ error: '查词网络超时，请稍后重试' })
  } catch (err) {
    console.error('lookup-word error:', err)
    return json({ error: '服务器内部错误，请稍后重试' })
  }
})