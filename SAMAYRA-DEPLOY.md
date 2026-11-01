# SAMAYRA AI — OmniRoute-powered Telegram bot

This branch turns the OmniRoute API engine into the AI backend for SAMAYRA. The existing OpenAI-compatible routing endpoint remains available at `/v1/chat/completions`; the Telegram bot calls it locally and does not expose the router key to Telegram users.

## Render deployment

- Runtime: Node 22.22.2+ (or Node 24+)
- Build command: `npm ci && npm run build:api-only`
- Start command: `node scripts/start-samayra.mjs`
- Health check path: `/api/monitoring/health`

Set these environment variables in Render (never commit secrets):

| Variable | Required | Purpose |
|---|---:|---|
| `TELEGRAM_BOT_TOKEN` | Yes for Telegram | Token from BotFather |
| `BOT_OWNER_ID` | Recommended | Telegram numeric owner ID for owner-only commands |
| `TELEGRAM_BOT_USERNAME` | Recommended | Bot username without @, for group mentions |
| `SAMAYRA_MODEL` | Recommended | OmniRoute model ID; use a model enabled in the router |
| `SAMAYRA_API_KEY` | If API auth enabled | API key for the local OmniRoute endpoint |
| `PORT` | Render sets this | Web/API port |
| `OMNIROUTE_HEADLESS` | Set by launcher | Disables dashboard pages and optional dashboard boot services |

The launcher sets headless mode and runs the API server and Telegram long-polling client in one Render process. If `TELEGRAM_BOT_TOKEN` is absent, it runs API-only so the health endpoint remains available.

## Current bot commands

- `/start`, `/help`
- `/mode` and `/mode <savage|sweet|flirty|dark romance|funny|gangster|formal>`
- `/forget` clears in-memory short-term chat context
- Owner-only `/panel` and `/health`
- Reply-based `/ban`, `/unban`, `/mute`, `/unmute`, `/warn`, `/pin`

In groups SAMAYRA only answers when mentioned or replied to, avoiding unsolicited group spam. The initial implementation uses in-memory conversation context; persistent memory, durable moderation logs, welcome customization, anti-flood, locks, whispers, XO and broadcast are follow-up modules. No image-generation feature is included.

## Important limits

This first integration is a functional foundation, not a finished production bot. Render Free can sleep, and in-memory context resets on restart/sleep. Bot moderation commands require the bot to be an administrator with the relevant permissions. Configure a valid OmniRoute model/provider before expecting AI replies.
