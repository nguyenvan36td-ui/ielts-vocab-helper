# 雅思词汇助手

雅思专属生词工具：做题遇到不会的词 → 查词（免费词典 API）→ AI 生成中文释义 + 词根词缀/词源 + 联想记忆法 + 雅思同义替换 → 存入云端生词本 → 手机/电脑随时闪卡复习（间隔重复）。

## 技术架构
- 前端：React 19 + Vite + TypeScript
- 云端：Supabase（邮箱密码登录 + PostgreSQL 数据库 + Edge Function）
- 查词：Free Dictionary API（免费、实时）
- AI 助记：DeepSeek API（key 保存在服务端，生成一次后缓存，重复词不重复扣费）

## 本地运行
```bash
npm install
npm run dev
```
浏览器打开 http://localhost:5173（未配置 Supabase 时会提示配置指引）。

---

## 一、申请 DeepSeek API Key（AI 助记用）
1. 打开 https://platform.deepseek.com 注册并登录
2. 左侧菜单「API Keys」→ 创建 API Key（`sk-` 开头）
3. 新用户一般有赠送额度；不够时在「费用」页充值，生成一个词大约几厘钱，很便宜

## 二、创建 Supabase 项目（云同步用）
1. 打开 https://supabase.com 注册（可用 GitHub 账号），登录后 New Project
2. 套餐选免费 Free，创建完成后记住：
   - 项目 URL（形如 `https://xxxx.supabase.co`）
   - Project Ref（形如 `xxxx`，在项目首页/URL 里）
3. 左侧 Project Settings → API：
   - 复制 `Project URL` 填入根目录 `.env` 的 `VITE_SUPABASE_URL`
   - 复制 `anon public key` 填入 `.env` 的 `VITE_SUPABASE_ANON_KEY`
4. （可选）关闭邮箱确认，方便直接注册登录：
   Authentication → Sign In / Up → 把 `Confirm email` 关掉
5. 左侧 SQL Editor → New query → 把 `supabase/seed.sql` 全部内容粘贴进去 → Run

## 三、部署 AI 函数（存放 DeepSeek key）
### 方式 A：Supabase CLI（推荐）
```bash
npm install -g supabase
supabase login
supabase init
supabase link --project-ref 你的项目Ref
```
把 `.env.supabase.example` 复制为 `.env.supabase`，填入你的 DeepSeek key，然后：
```bash
supabase secrets set --env-file .env.supabase
supabase functions deploy generate-mnemonic
```
部署成功后在 Edge Functions 页能看到 `generate-mnemonic`（默认带 JWT 鉴权，安全）。

### 方式 B：网页直接部署（装不了 CLI 时）
1. 左侧 Edge Functions → Create new function，名字填 `generate-mnemonic`
2. 把 `supabase/functions/generate-mnemonic/index.ts` 内容粘贴进 `index.ts`，
   并创建 `_shared/cors.ts` 粘贴 `supabase/functions/_shared/cors.ts` 内容
3. Deploy，然后在 Settings → Edge Functions → Secrets 添加 `DEEPSEEK_API_KEY`

## 四、部署前端（可选，手机背词靠它）
1. 把这个项目推到 GitHub 仓库
2. 打开 https://vercel.com 登录 → Add New Project → 导入该仓库
3. 在环境变量里添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`（值同第二步）
4. Deploy，得到 `https://xxx.vercel.app`
5. 手机浏览器打开该网址，用同一个账号登录，即可随时背电脑上查过的词；
   也可在手机浏览器菜单「添加到主屏幕」，用起来像 App

## 常见问题
- 查词失败/超时：免费词典 API 偶发不稳定，稍后重试即可
- AI 助记生成失败：检查 `DEEPSEEK_API_KEY` 是否已设置、函数是否已部署、DeepSeek 余额是否充足
- 注册后一直无法登录：多半是邮箱确认还开着，按 二.4 关闭
- 安全说明：Supabase 的 anon key 公开是正常设计，数据库已开启行级安全（RLS），每个用户只能读写自己的数据；DeepSeek key 只存在于服务端

## 功能清单
- [x] 邮箱+密码登录/注册
- [x] 联网查词（音标/英文释义/例句/同义词）
- [x] AI 记忆法（中文释义/词根词缀/词源/联想记忆法/词族/雅思同义替换/用法提示）
- [x] 生词本（搜索、筛选、删除、标记掌握）
- [x] 闪卡复习（认识/模糊/不认识，间隔重复 0/1/3/7/15/30 天）
- [x] 多设备云端同步