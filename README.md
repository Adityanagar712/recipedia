# Recipedia Pro

Recipe search (TheMealDB), pantry suggestions, 7-day meal planner, **Chef Chat** (Groq LLM, streaming) and direct WhatsApp ordering.

**Live demo:** _add your link here after deploying_

## How it works
```
Browser (index.html)  ──►  /api/chat (Vercel serverless)  ──►  Groq API
                              holds GROQ_API_KEY               streams reply back
Browser  ──►  TheMealDB (recipes)        Browser  ──►  wa.me (WhatsApp orders)
```
The Groq key lives only on the server. The proxy also forces the model, caps tokens and message size, checks the request origin, and rate-limits each IP.

## Project structure
```
index.html        the whole front end (HTML + CSS + JS)
config.js         public settings: MealDB key, WhatsApp number
api/chat.js       serverless proxy for Groq
vercel.json       function timeout
.env.example      environment variable template
```

## Deploy on Vercel
1. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Recipedia Pro"
   git branch -M main
   git remote add origin https://github.com/<you>/recipedia-pro.git
   git push -u origin main
   ```
2. Go to https://vercel.com, sign in with GitHub, then **Add New, Project**, import the repo and click **Deploy** (no build settings needed).
3. Open **Settings, Environment Variables** and add:
   - `GROQ_API_KEY` = your key from https://console.groq.com/keys
   - `GROQ_MODEL` = `openai/gpt-oss-20b` (optional)
4. Go to **Deployments**, open the latest one, and choose **Redeploy** so the variables take effect.
5. Open your `*.vercel.app` link. The status chip in the top bar should read **Chef online**.

## Run locally
```bash
npm i -g vercel
cp .env.example .env.local     # then paste your GROQ_API_KEY
vercel dev
```
Opening `index.html` by double-click will not work for the chatbot, because `/api/chat` needs the server function.

## Before you share the link
- Set a spend or usage limit for your key in the Groq console.
- Edit `config.js` and set `WHATSAPP_NUMBER` (country code + number, digits only), then commit and push.
- Never commit `.env` files. They are git-ignored.
- The rate limit is best effort on serverless. For heavy traffic, use a shared store such as Upstash Redis.

## Troubleshooting
| Banner / error | Fix |
|---|---|
| "GROQ_API_KEY is not set on the server" | Add the variable in Vercel, then redeploy |
| "The server's Groq API key was rejected" | Re-copy the full key from the Groq console |
| "/api/chat is not reachable" | Deploy to Vercel, or run `vercel dev` |
| Model error | Set `GROQ_MODEL` to a current Groq model, for example `llama-3.3-70b-versatile` |
