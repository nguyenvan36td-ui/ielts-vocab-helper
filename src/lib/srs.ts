export const INTERVALS_DAYS = [0, 1, 3, 7, 15, 30]

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

export function isDue(w: { next_review_at: string | null; mastered: boolean }): boolean {
  if (w.mastered) return false
  if (!w.next_review_at) return true
  return new Date(w.next_review_at).getTime() <= Date.now()
}

export type ReviewResult = 'pass' | 'fuzzy' | 'fail'

export interface ReviewOutcome {
  reviewLevel: number
  nextReviewAt: Date
}

/**
 * 简单间隔重复：
 * 认识 -> 等级+1，间隔 0/1/3/7/15/30 天
 * 模糊 -> 等级不变，明天再来
 * 不认识 -> 打回 0 级，稍后重记
 */
export function applyReview(level: number, result: ReviewResult): ReviewOutcome {
  if (result === 'pass') {
    const nextLevel = Math.min(level + 1, INTERVALS_DAYS.length - 1)
    return { reviewLevel: nextLevel, nextReviewAt: addDays(new Date(), INTERVALS_DAYS[nextLevel]) }
  }
  if (result === 'fuzzy') {
    return { reviewLevel: level, nextReviewAt: addDays(new Date(), 1) }
  }
  return { reviewLevel: 0, nextReviewAt: new Date() }
}

export function fmtDue(w: { next_review_at: string | null; mastered?: boolean }): string {
  if (w.mastered) return '已掌握'
  if (!w.next_review_at) return '待复习'
  const due = new Date(w.next_review_at).getTime()
  const day = 24 * 60 * 60 * 1000
  const diff = due - Date.now()
  if (diff <= 0) return '待复习'
  const days = Math.ceil(diff / day)
  if (days <= 1) return '明天'
  return `${days} 天后`
}