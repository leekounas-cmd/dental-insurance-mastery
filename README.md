# Dental Insurance Mastery

A complete Duolingo-style training app for dental insurance — 32 chapters, quizzes, scenarios, AI-powered lessons, and mastery tracking.

## Deploy to Vercel (Drag & Drop)

1. Go to https://vercel.com/new
2. Click "Upload" or drag this entire folder in
3. Wait for it to build and deploy (~60 seconds)
4. You'll get a URL like `dental-insurance-mastery.vercel.app`

## Enable AI Features (Optional but Recommended)

The app works without AI — all 32 chapters, quizzes, reference search, and scenarios work out of the box. To enable:
- AI-generated deep lessons (1500-2500 word lessons per chapter)
- Infinite quiz generation (new questions every round)
- AI-powered search answers

Add your Anthropic API key:
1. In Vercel, go to your project → Settings → Environment Variables
2. Add: `ANTHROPIC_API_KEY` = your key (get one at https://console.anthropic.com)
3. Redeploy

## Share

Send the Vercel URL to anyone — it works on any phone or computer browser. No account needed. Each person's progress saves to their own browser via localStorage.
