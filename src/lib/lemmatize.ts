/**
 * 英文词形还原（原型化）：
 * 输入可能是过去式、复数、三单、进行式等变体，这里生成候选原型（按可能性排序）。
 * 调用方用词典逐个校验候选词，选第一个能查到的；全部失败则回退原输入。
 */

/** 不规则变体 → 原型（复数形式表示多个候选，按优先级排列） */
const IRREGULAR: Record<string, string[]> = {
  // be / have / do / go
  am: ['be'], is: ['be'], are: ['be'], was: ['be'], were: ['be'], been: ['be'], being: ['be'],
  has: ['have'], had: ['have'], having: ['have'],
  does: ['do'], did: ['do'], done: ['do'], doing: ['do'],
  goes: ['go'], went: ['go'], gone: ['go'], going: ['go'],
  // 常见不规则动词（过去式/过去分词/三单/进行式 → 原型）
  says: ['say'], said: ['say'], saying: ['say'],
  makes: ['make'], made: ['make'], making: ['make'],
  takes: ['take'], took: ['take'], taken: ['take'], taking: ['take'],
  comes: ['come'], came: ['come'], coming: ['come'],
  sees: ['see'], saw: ['see'], seen: ['see'], seeing: ['see'],
  knows: ['know'], knew: ['know'], known: ['know'], knowing: ['know'],
  gets: ['get'], got: ['get'], gotten: ['get'], getting: ['get'],
  gives: ['give'], gave: ['give'], given: ['give'], giving: ['give'],
  finds: ['find'], found: ['find'], finding: ['find'],
  thinks: ['think'], thought: ['think'], thinking: ['think'],
  tells: ['tell'], told: ['tell'], telling: ['tell'],
  becomes: ['become'], became: ['become'], becoming: ['become'],
  shows: ['show'], showed: ['show'], shown: ['show'], showing: ['show'],
  feels: ['feel'], felt: ['feel'], feeling: ['feel'],
  puts: ['put'], putting: ['put'],
  brings: ['bring'], brought: ['bring'], bringing: ['bring'],
  begins: ['begin'], began: ['begin'], begun: ['begin'], beginning: ['begin'],
  keeps: ['keep'], kept: ['keep'], keeping: ['keep'],
  holds: ['hold'], held: ['hold'], holding: ['hold'],
  writes: ['write'], wrote: ['write'], written: ['write'], writing: ['write'],
  stands: ['stand'], stood: ['stand'], standing: ['stand'],
  hears: ['hear'], heard: ['hear'], hearing: ['hear'],
  lets: ['let'], letting: ['let'],
  sets: ['set'], setting: ['set'],
  meets: ['meet'], met: ['meet'], meeting: ['meet'],
  runs: ['run'], ran: ['run'], running: ['run'],
  pays: ['pay'], paid: ['pay'], paying: ['pay'],
  sits: ['sit'], sat: ['sit'], sitting: ['sit'],
  speaks: ['speak'], spoke: ['speak'], spoken: ['speak'], speaking: ['speak'],
  leads: ['lead'], led: ['lead'], leading: ['lead'],
  grows: ['grow'], grew: ['grow'], grown: ['grow'], growing: ['grow'],
  loses: ['lose'], lost: ['lose'], losing: ['lose'],
  falls: ['fall'], fell: ['fall'], fallen: ['fall'], falling: ['fall'],
  sends: ['send'], sent: ['send'], sending: ['send'],
  builds: ['build'], built: ['build'],
  understands: ['understand'], understood: ['understand'], understanding: ['understand'],
  draws: ['draw'], drew: ['draw'], drawn: ['draw'], drawing: ['draw'],
  breaks: ['break'], broke: ['break'], broken: ['break'], breaking: ['break'],
  spends: ['spend'], spent: ['spend'], spending: ['spend'],
  cuts: ['cut'], cutting: ['cut'],
  rises: ['rise'], rose: ['rise'], risen: ['rise'], rising: ['rise'],
  drives: ['drive'], drove: ['drive'], driven: ['drive'], driving: ['drive'],
  buys: ['buy'], bought: ['buy'], buying: ['buy'],
  wears: ['wear'], wore: ['wear'], worn: ['wear'], wearing: ['wear'],
  chooses: ['choose'], chose: ['choose'], chosen: ['choose'], choosing: ['choose'],
  catches: ['catch'], caught: ['catch'], catching: ['catch'],
  wins: ['win'], won: ['win'], winning: ['win'],
  teaches: ['teach'], taught: ['teach'], teaching: ['teach'],
  eats: ['eat'], ate: ['eat'], eaten: ['eat'], eating: ['eat'],
  fights: ['fight'], fought: ['fight'], fighting: ['fight'],
  throws: ['throw'], threw: ['throw'], thrown: ['throw'], throwing: ['throw'],
  sleeps: ['sleep'], slept: ['sleep'], sleeping: ['sleep'],
  sings: ['sing'], sang: ['sing'], sung: ['sing'], singing: ['sing'],
  drinks: ['drink'], drank: ['drink'], drunk: ['drink'], drinking: ['drink'],
  rides: ['ride'], rode: ['ride'], ridden: ['ride'], riding: ['ride'],
  hits: ['hit'], hitting: ['hit'],
  beats: ['beat'], beaten: ['beat'], beating: ['beat'],
  hurts: ['hurt'], hurting: ['hurt'],
  costs: ['cost'], costing: ['cost'],
  sells: ['sell'], sold: ['sell'], selling: ['sell'],
  hangs: ['hang'], hung: ['hang'], hanging: ['hang'],
  swims: ['swim'], swam: ['swim'], swum: ['swim'], swimming: ['swim'],
  shakes: ['shake'], shook: ['shake'], shaken: ['shake'], shaking: ['shake'],
  lends: ['lend'], lent: ['lend'], lending: ['lend'],
  flies: ['fly'], flew: ['fly'], flown: ['fly'], flying: ['fly'],
  forgets: ['forget'], forgot: ['forget'], forgotten: ['forget'], forgetting: ['forget'],
  forgives: ['forgive'], forgave: ['forgive'], forgiven: ['forgive'], forgiving: ['forgive'],
  freezes: ['freeze'], froze: ['freeze'], frozen: ['freeze'], freezing: ['freeze'],
  steals: ['steal'], stole: ['steal'], stolen: ['steal'], stealing: ['steal'],
  bites: ['bite'], bit: ['bite'], bitten: ['bite'], biting: ['bite'],
  hides: ['hide'], hid: ['hide'], hidden: ['hide'], hiding: ['hide'],
  feeds: ['feed'], fed: ['feed'], feeding: ['feed'],
  deals: ['deal'], dealt: ['deal'], dealing: ['deal'],
  learns: ['learn'], learnt: ['learn'], learning: ['learn'],
  smelt: ['smell'], spilt: ['spill'],
  lights: ['light'], lit: ['light'], lighting: ['light'],
  shoots: ['shoot'], shot: ['shoot'], shooting: ['shoot'],
  sticks: ['stick'], stuck: ['stick'], sticking: ['stick'],
  strikes: ['strike'], struck: ['strike'], striking: ['strike'],
  sweeps: ['sweep'], swept: ['sweep'], sweeping: ['sweep'],
  weeps: ['weep'], wept: ['weep'], weeping: ['weep'],
  digs: ['dig'], dug: ['dig'], digging: ['dig'],
  spins: ['spin'], spun: ['spin'], spinning: ['spin'],
  rings: ['ring'], rang: ['ring'], rung: ['ring'], ringing: ['ring'],
  sinks: ['sink'], sank: ['sink'], sunk: ['sink'], sinking: ['sink'],
  springs: ['spring'], sprang: ['spring'], sprung: ['spring'], springing: ['spring'],
  swings: ['swing'], swung: ['swing'], swinging: ['swing'],
  blows: ['blow'], blew: ['blow'], blown: ['blow'], blowing: ['blow'],
  arises: ['arise'], arose: ['arise'], arisen: ['arise'], arising: ['arise'],
  awakes: ['awake'], awoke: ['awake'], awoken: ['awake'], awaking: ['awake'],
  bears: ['bear'], bore: ['bear'], born: ['bear'], borne: ['bear'], bearing: ['bear'],
  bends: ['bend'], bent: ['bend'], bending: ['bend'],
  binds: ['bind'], bound: ['bind'], binding: ['bind'],
  bleeds: ['bleed'], bled: ['bleed'], bleeding: ['bleed'],
  breeds: ['breed'], bred: ['breed'], breeding: ['breed'],
  creeps: ['creep'], crept: ['creep'], creeping: ['creep'],
  flees: ['flee'], fled: ['flee'], fleeing: ['flee'],
  flings: ['fling'], flung: ['fling'], flinging: ['fling'],
  grinds: ['grind'], ground: ['grind'], grinding: ['grind'],
  kneels: ['kneel'], knelt: ['kneel'], kneeling: ['kneel'],
  lays: ['lay'], laid: ['lay'], laying: ['lay'],
  leaps: ['leap'], leapt: ['leap'], leaping: ['leap'],
  slides: ['slide'], slid: ['slide'], sliding: ['slide'],
  slings: ['sling'], slung: ['sling'], slinging: ['sling'],
  splits: ['split'], splitting: ['split'],
  spoils: ['spoil'], spoilt: ['spoil'], spoiling: ['spoil'],
  spreads: ['spread'], spreading: ['spread'],
  stings: ['sting'], stung: ['sting'], stinging: ['sting'],
  strides: ['stride'], strode: ['stride'], stridden: ['stride'], striding: ['stride'],
  strives: ['strive'], strove: ['strive'], striven: ['strive'], striving: ['strive'],
  swears: ['swear'], swore: ['swear'], sworn: ['swear'], swearing: ['swear'],
  tears: ['tear'], tore: ['tear'], torn: ['tear'], tearing: ['tear'],
  wakes: ['wake'], woke: ['wake'], woken: ['wake'], waking: ['wake'],
  winds: ['wind'], wound: ['wind'], winding: ['wind'],
  speeds: ['speed'], sped: ['speed'], speeding: ['speed'],
  withdraws: ['withdraw'], withdrew: ['withdraw'], withdrawn: ['withdraw'], withdrawing: ['withdraw'],
  withstands: ['withstand'], withstood: ['withstand'], withstanding: ['withstand'],
  proves: ['prove'], proved: ['prove'], proven: ['prove'], proving: ['prove'],
  bets: ['bet'], betting: ['bet'],
  bursts: ['burst'], bursting: ['burst'],
  casts: ['cast'], casting: ['cast'],
  clings: ['cling'], clung: ['cling'], clinging: ['cling'],
  dwells: ['dwell'], dwelt: ['dwell'], dwelling: ['dwell'],
  forbids: ['forbid'], forbade: ['forbid'], forbidden: ['forbid'], forbidding: ['forbid'],
  forecasts: ['forecast'], forecasting: ['forecast'],
  foresees: ['foresee'], foresaw: ['foresee'], foreseen: ['foresee'], foreseeing: ['foresee'],
  forsakes: ['forsake'], forsook: ['forsake'], forsaken: ['forsake'], forsaking: ['forsake'],
  misleads: ['mislead'], misled: ['mislead'], misleading: ['mislead'],
  misunderstands: ['misunderstand'], misunderstood: ['misunderstand'], misunderstanding: ['misunderstand'],
  overtakes: ['overtake'], overtook: ['overtake'], overtaken: ['overtake'], overtaking: ['overtake'],
  overcomes: ['overcome'], overcame: ['overcome'], overcoming: ['overcome'],
  overhears: ['overhear'], overheard: ['overhear'], overhearing: ['overhear'],
  oversees: ['oversee'], oversaw: ['oversee'], overseen: ['oversee'], overseeing: ['oversee'],
  overthrows: ['overthrow'], overthrew: ['overthrow'], overthrown: ['overthrow'], overthrowing: ['overthrow'],
  undergoes: ['undergo'], underwent: ['undergo'], undergone: ['undergo'], undergoing: ['undergo'],
  upholds: ['uphold'], upheld: ['uphold'], upholding: ['uphold'],
  upsets: ['upset'], upsetting: ['upset'],
  withholds: ['withhold'], withheld: ['withhold'], withholding: ['withhold'],
  broadcasts: ['broadcast'], broadcasting: ['broadcast'],
  seeks: ['seek'], sought: ['seek'], seeking: ['seek'],
  // 名词不规则复数
  children: ['child'], men: ['man'], women: ['woman'], mice: ['mouse'], geese: ['goose'],
  feet: ['foot'], teeth: ['tooth'], oxen: ['ox'], lice: ['louse'],
  phenomena: ['phenomenon'], criteria: ['criterion'], strata: ['stratum'],
  spectra: ['spectrum'], memoranda: ['memorandum'], addenda: ['addendum'],
  errata: ['erratum'], bacteria: ['bacterium'], fungi: ['fungus'], nuclei: ['nucleus'],
  radii: ['radius'], foci: ['focus'], loci: ['locus'], cacti: ['cactus'], alumni: ['alumnus'],
  stimuli: ['stimulus'], curricula: ['curriculum'], syllabi: ['syllabus'],
  indices: ['index'], matrices: ['matrix'], vertices: ['vertex'],
  analyses: ['analysis'], bases: ['basis'], crises: ['crisis'], theses: ['thesis'],
  hypotheses: ['hypothesis'], emphases: ['emphasis'], diagnoses: ['diagnosis'],
  prognoses: ['prognosis'], oases: ['oasis'], syntheses: ['synthesis'],
  parentheses: ['parenthesis'],
  // 易误判的 -ie 变体
  ties: ['tie'], tied: ['tie'], tying: ['tie'],
  dies: ['die'], died: ['die'], dying: ['die'],
  lies: ['lie'], lied: ['lie'], lain: ['lie'], lying: ['lie'],
  leaves: ['leaf', 'leave'], left: ['leave'],
}

/** 本身就是原型、不应切词尾的词 */
const STOPLIST = new Set([
  // 以 -s/-es 结尾的原型词
  'news', 'status', 'series', 'species', 'means', 'lens', 'focus', 'bonus', 'minus', 'plus',
  'surplus', 'virus', 'campus', 'genius', 'nucleus', 'radius', 'atlas', 'alias', 'bias',
  'maths', 'mathematics', 'physics', 'economics', 'politics', 'statistics', 'ethics',
  'athletics', 'gymnastics', 'linguistics', 'logistics', 'electronics', 'graphics',
  'classics', 'optics', 'semantics', 'tactics', 'acoustics', 'aesthetics', 'genetics',
  'thermodynamics', 'dynamics', 'ceramics', 'comics', 'mechanics', 'robotics',
  'informatics', 'telecommunications',
  'thanks', 'goods', 'clothes', 'customs', 'arms', 'funds', 'wages', 'savings', 'earnings',
  'belongings', 'surroundings', 'outskirts', 'premises', 'headquarters', 'scissors',
  'trousers', 'pants', 'glasses', 'jeans', 'shorts', 'pyjamas', 'remains', 'ashes',
  'contents', 'damages', 'expenses', 'proceeds', 'regards', 'riches', 'stairs', 'troops',
  'congratulations', 'measles', 'mumps', 'diabetes', 'whereabouts', 'crossroads',
  'sometimes', 'outdoors', 'indoors', 'besides', 'ours', 'yours', 'theirs', 'hers',
  // 以 -ed/-ing 结尾但本身就是原型
  'seed', 'feed', 'weed', 'heed', 'morning', 'evening', 'during', 'outing', 'darling',
  'according', 'willing', 'clothing', 'building', 'meaning', 'feeling', 'meeting',
  'training', 'shopping', 'parking', 'painting', 'engineering', 'gardening', 'housing',
  'sophisticated', 'shed',
])

function isVowel(ch: string): boolean {
  return 'aeiou'.includes(ch)
}

function isConsonant(ch: string): boolean {
  return /^[a-z]$/.test(ch) && !isVowel(ch)
}

function push(out: string[], word: string, cand: string): void {
  if (cand && cand !== word && !out.includes(cand)) out.push(cand)
}

/** -ed/-ing 词尾候选（mode: 'ed' | 'ing'） */
function stemVariants(stem: string, mode: 'ed' | 'ing'): string[] {
  const out: string[] = []
  if (!stem) return out
  const last = stem[stem.length - 1]
  // 双写词尾：stopped→[stopp, stop]、filled→[fill, fil]（长形式在前，词典会否决错的）
  if (stem.length >= 2 && last === stem[stem.length - 2]) {
    out.push(stem, stem.slice(0, -1))
    return out
  }
  out.push(stem)
  if (isVowel(last)) {
    // agreed→agree（ed：补 e）；agreeing→agree（ing：原型就是词干）
    if (mode === 'ed') out.unshift(stem + 'e')
    return out
  }
  const prev = stem[stem.length - 2]
  const prev2 = stem.length >= 3 ? stem[stem.length - 3] : ''
  const cvc = isConsonant(last) && isVowel(prev) && isConsonant(prev2)
  const softS = last === 's'
  if (stem.length <= 2) {
    out.unshift(stem + 'e') // using→use
  } else if (cvc && stem.length <= 4 && !'wxy'.includes(last)) {
    out.unshift(stem + 'e') // hop→hope、lik→like、bas→base
  } else if (last === 'v') {
    out.unshift(stem + 'e') // observ→observe
  } else if (last === 't' && prev === 'a') {
    out.unshift(stem + 'e') // creat→create
  } else if (last === 'd' && (prev === 'i' || prev === 'u' || (prev === 'a' && stem.length > 4))) {
    out.unshift(stem + 'e') // provid→provide、includ→include、persuad→persuade
  } else if (last === 'n' && prev === 'i' && prev2 !== 'a') {
    out.unshift(stem + 'e') // defin→define（-ain 类如 contain 保持原型）
  } else if (last === 'l' && isConsonant(prev)) {
    out.unshift(stem + 'e') // tabl→table、exampl→example
  } else if (last === 'r' && (prev === 'i' || prev === 'u' || prev === 'a' || isConsonant(prev))) {
    out.unshift(stem + 'e') // requir→require、ensur→ensure、compar→compare、centr→centre
  } else if ('gc'.includes(last) || softS) {
    out.unshift(stem + 'e') // chang→change、danc→dance、rais→raise
  } else if (cvc) {
    out.push(stem + 'e') // 长 CVC：原型优先，补 e 兜底
  }
  return out
}

/**
 * 返回候选原型列表（不含原词，原词由调用方最后兜底），按可能性从高到低排序。
 */
export function lemmatizeCandidates(raw: string): string[] {
  const w = raw.trim().toLowerCase()
  if (!w) return []
  const out: string[] = []
  const irregular = IRREGULAR[w]
  if (irregular) {
    for (const c of irregular) push(out, w, c)
    return out
  }
  if (STOPLIST.has(w) || w.length < 4) return []
  if (w.endsWith('ying')) {
    push(out, w, w.slice(0, -3) + 'y')
  } else if (w.endsWith('ied')) {
    push(out, w, w.slice(0, -3) + 'y')
    push(out, w, w.slice(0, -1))
  } else if (w.endsWith('ies')) {
    push(out, w, w.slice(0, -3) + 'y')
    push(out, w, w.slice(0, -3) + 'ie')
  } else if (w.endsWith('ves')) {
    push(out, w, w.slice(0, -3) + 'f')
    push(out, w, w.slice(0, -3) + 'fe')
  } else if (w.endsWith('ing') && w.length - 3 >= 2) {
    for (const c of stemVariants(w.slice(0, -3), 'ing')) push(out, w, c)
  } else if (w.endsWith('ed') && w.length - 2 >= 2) {
    for (const c of stemVariants(w.slice(0, -2), 'ed')) push(out, w, c)
  } else if (w.endsWith('es')) {
    for (const c of stemVariants(w.slice(0, -2), 'ed')) push(out, w, c)
  } else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
    const stem = w.slice(0, -1)
    if (stem.length >= 3) push(out, w, stem)
  }
  return out
}