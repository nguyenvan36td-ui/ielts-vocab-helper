-- 雅思词汇助手：建表 + 行级安全策略（在 Supabase SQL Editor 中整体执行）
create extension if not exists "pgcrypto";

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word text not null,
  phonetic text,
  en_meaning text,
  zh_meaning text,
  example text,
  synonyms text[] default '{}',
  root_analysis text,
  mnemonic text,
  word_family text[] default '{}',
  ai_synonyms text[] default '{}',
  exam_hint text,
  ai_status text not null default 'none' check (ai_status in ('none', 'pending', 'done', 'error')),
  mastered boolean not null default false,
  review_level int not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique (user_id, word)
);

create index if not exists words_user_idx on public.words (user_id);
create index if not exists words_due_idx on public.words (user_id, mastered, next_review_at);

alter table public.words enable row level security;

drop policy if exists "words_own_select" on public.words;
create policy "words_own_select" on public.words for select using (auth.uid() = user_id);

drop policy if exists "words_own_insert" on public.words;
create policy "words_own_insert" on public.words for insert with check (auth.uid() = user_id);

drop policy if exists "words_own_update" on public.words;
create policy "words_own_update" on public.words for update using (auth.uid() = user_id);

drop policy if exists "words_own_delete" on public.words;
create policy "words_own_delete" on public.words for delete using (auth.uid() = user_id);