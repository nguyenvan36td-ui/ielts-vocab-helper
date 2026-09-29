import "jsr:@supabase/functions-js/edge-runtime.d.ts"

interface AiResult {
  zhMeaning: string
  rootAnalysis: string
  mnemonic: string
  wordFamily: string[]
  synonyms: string[]
  examHint: string
}

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

const SYSTEM_PROMPT = `你是一位专业的雅思词汇老师，擅长用生动、易记的方式讲解单词。
请为给定的英文单词生成以下 JSON 字段（全部使用简体中文，除单词本身外，务必简洁）：
{
  "zhMeaning": "简明中文释义（1 条，20 字以内）",
  "rootAnalysis": "词根词缀拆解，一句话（没有词根则说明词源）",
  "mnemonic": "记忆法，一句话，能与词义挂钩、让人真正记得住",
  "wordFamily": ["同根词/派生词，3-4 个"],
  "synonyms": ["雅思同义替换词，3 个，各附极简区别"],
  "examHint": "雅思考法提示，一句话"
}
记忆法（mnemonic）的选择优先级：
1. 优先用词根词缀或词源故事：讲清词根/词缀的含义，把拼写与词义自然串起来；
2. 词根词缀不好讲时，用场景/画面/联想：用一个具体画面或情景勾住单词的拼写与词义；
3. 谐音仅作最后手段，且必须是发音高度接近、联想自然顺口的那种（例如 pest 记成"拍死它→害虫"）；
4. 严禁牵强谐音：发音明显不像、需要硬凑脑补的一律不用，宁可用词源或联想替代。
mnemonic 与 rootAnalysis 要分工：rootAnalysis 讲词根怎么拆、为什么是这个意思；mnemonic 给记忆钩子（一幅画面、一句顺口的话或一个小故事），不要互相重复。
只输出 JSON，不要输出任何其他文字。`

function cleanArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
}

function sanitize(raw: Record<string, unknown>): AiResult {
  return {
    zhMeaning: typeof raw.zhMeaning === 'string' ? raw.zhMeaning.trim() : '',
    rootAnalysis: typeof raw.rootAnalysis === 'string' ? raw.rootAnalysis.trim() : '',
    mnemonic: typeof raw.mnemonic === 'string' ? raw.mnemonic.trim() : '',
    wordFamily: cleanArray(raw.wordFamily),
    synonyms: cleanArray(raw.synonyms),
    examHint: typeof raw.examHint === 'string' ? raw.examHint.trim() : '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { word } = await req.json()
    if (!word || typeof word !== 'string') {
      return json({ error: '缺少单词参数' }, 400)
    }
    const cleanWord = word.trim().slice(0, 64)
    if (!cleanWord) {
      return json({ error: '单词不能为空' }, 400)
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
    if (!apiKey) {
      return json({ error: '服务端未配置 DEEPSEEK_API_KEY' }, 500)
    }

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.6,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `请讲解单词：${cleanWord}` },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('DeepSeek error', res.status, text)
      return json({ error: `DeepSeek 服务异常（HTTP ${res.status}）` }, 502)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return json({ error: 'DeepSeek 返回内容为空' }, 502)
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(content)
    } catch {
      return json({ error: 'AI 返回格式无法解析' }, 502)
    }

    return json({ result: sanitize(parsed) })
  } catch (err) {
    console.error('generate-mnemonic error', err)
    return json({ error: err instanceof Error ? err.message : '服务器内部错误' }, 500)
  }
})