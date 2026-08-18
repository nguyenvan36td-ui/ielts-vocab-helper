export type AiStatus = 'none' | 'pending' | 'done' | 'error'

export interface WordRow {
  id: string
  user_id: string
  word: string
  phonetic: string | null
  en_meaning: string | null
  zh_meaning: string | null
  example: string | null
  synonyms: string[] | null
  root_analysis: string | null
  mnemonic: string | null
  word_family: string[] | null
  ai_synonyms: string[] | null
  exam_hint: string | null
  ai_status: AiStatus
  mastered: boolean
  review_level: number
  last_reviewed_at: string | null
  next_review_at: string | null
  created_at: string
}