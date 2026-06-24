# freelance_daigest

Daily automated scraper for freelancermap.de contract job offers + LLM-generated application messages via self-hosted OpenWebUI/Ollama, with a minimalist dashboard to review, chat-refine, note, and track send status per offer.

## Stack
- Backend: TypeScript + Express 5 + better-sqlite3 + Drizzle ORM + node-cron + cheerio + jose (Keycloak JWT) + axios (OpenWebUI client)
- Frontend: React 19 + Vite 6 + Tailwind v4 + react-router 7 + @tanstack/react-query + oidc-client-ts (PKCE, silent renew)
- Infra: Multi-stage Dockerfiles, Coolify-ready

## Layout
```
backend/        Express API + scraper + cron + OpenWebUI client + Keycloak verify
frontend/       React dashboard + login + chat window + CV upload
data/           SQLite volume (created on first run)
```

CVs are uploaded as PDFs from the dashboard and stored in the database. No CV file is needed in the repo.

## Quick start (local)

1. `cp .env.example .env` and fill in real Keycloak/OpenWebUI URLs.
2. `docker compose up --build`
3. Visit `http://localhost:8080`, sign in via Keycloak.
4. Click **CV** in the header and upload your CV as a PDF. It becomes the active CV used for proposal generation. Upload more any time and switch which is active.

For dev with hot reload:
- `npm install` at repo root (workspaces)
- `npm -w backend run dev` (port 3000)
- `npm -w frontend run dev` (port 5173, proxies /api to 3000)

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/health                 | Liveness |
| GET    | /api/auth/config            | Keycloak config for frontend |
| GET    | /api/offers                 | List offers (filter, sort, order, limit, offset) |
| GET    | /api/offers/:id             | Single offer + chat messages |
| PATCH  | /api/offers/:id             | Update notes / sent / archived |
| DELETE | /api/offers/:id             | Soft delete |
| POST   | /api/offers/:id/generate    | Generate initial proposal via OpenWebUI |
| GET    | /api/offers/:id/messages    | List chat messages |
| POST   | /api/offers/:id/messages    | Send user message; assistant reply persisted |
| POST   | /api/scrape/run             | Manually trigger daily scrape (202 async) |
| POST   | /api/cv                     | Upload PDF CV (raw body, application/pdf, ≤5 MB). New upload becomes active. |
| GET    | /api/cv                     | Active CV metadata + 500-char preview (404 if none) |
| GET    | /api/cv/history             | All CVs newest-first (no content) |
| PATCH  | /api/cv/:id/activate         | Mark a CV active (deactivates others) |
| DELETE | /api/cv/:id                 | Delete a CV (auto-activates newest remaining if active was deleted) |

All `/api/*` routes (except `/api/auth/config` and `/api/health`) require `Authorization: Bearer <Keycloak JWT>`.

## Configuration

See `.env.example` for all backend env vars. Critical ones:
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` — OIDC config
- `OPENWEBUI_BASE_URL`, `OPENWEBUI_API_KEY`, `OPENWEBUI_MODEL` — LLM endpoint
- `CRON_SCHEDULE` — daily scrape time (default `0 6 * * *`)
- `SEARCH_TERMS` — comma-separated (default `fullstack,frontend,entwickler`)
- `AUTH_DISABLED=true` — for local dev without Keycloak

Frontend build-time vars (must be `VITE_`-prefixed):
- `VITE_OIDC_AUTHORITY` — full realm URL, e.g. `https://keycloak.example.com/realms/freelance`
- `VITE_OIDC_CLIENT_ID` — Keycloak client id (e.g. `freelance-daigest`)
- `VITE_OIDC_SCOPES` — default `openid profile email`
- `VITE_API_BASE_URL` (default `/api`)

## Keycloak setup

Create a public OIDC client (`freelance-daigest`) with:
- Client protocol: `openid-connect`
- Access type: `public`
- Authentication flow: `Authorization Code Flow with PKCE` enabled
- Standard Flow Enabled: `true`; Direct Access Grants + Implicit Flow: `false`
- Valid redirect URIs: `http://localhost:5173/callback`, `http://localhost:5173/silent-renew`, `http://localhost:8080/callback`, `http://localhost:8080/silent-renew`, your Coolify frontend `/callback` and `/silent-renew` URLs
- Valid post logout redirect URIs: same origins `/login`
- Web origins: same origins
- Advanced → PKCE Code Challenge Method: `S256`

### Realm token settings (REQUIRED for silent refresh)

The frontend silently refreshes the access token before it expires. For this to work the realm must keep the SSO session alive longer than the access token, otherwise the user is bounced to `/login` on the first idle interval:

- **Access Token Lifespan**: `5m` (or any value ≥ 2 minutes; if your access token expires every minute, you will see frequent redirects even with the refresh loop in place)
- **SSO Session Idle**: `1d` or higher (must be > Access Token Lifespan)
- **SSO Session Max**: `7d` or higher (must be ≥ SSO Session Idle)
- Client → Advanced → **Refresh Token Max Reuse Count**: default (1) is fine
- **Use Refresh Tokens** / refresh token grant: enabled (default for public clients with PKCE)

If the user still gets kicked out: in the Keycloak admin UI for the realm go to **Tokens → Access Token Lifespan** and **Sessions → SSO Session Idle/Max** and adjust the values above.

## OpenWebUI setup

1. Deploy OpenWebUI with an Ollama backend.
2. Create an API token in OpenWebUI (Settings → Account → API Keys).
3. Identify the model name you want to use (e.g., `llama3.1:latest` or a custom model with a CV-aware system prompt).
4. Set `OPENWEBUI_BASE_URL`, `OPENWEBUI_API_KEY`, `OPENWEBUI_MODEL` env vars.

The backend sends the active CV (uploaded via the dashboard) as the system prompt on each call; on first call OpenWebUI returns a `chat_id` that is persisted on the offer, enabling thread resume for subsequent chat turns. Switching the active CV takes effect immediately on the next proposal generation (chat threads that already started keep their existing chat_id but pick up the new CV on new generations for other offers).

## Tests

- Backend: `npm -w backend test` (vitest)
- Frontend: `npm -w frontend test` (vitest + jsdom)

## Coolify deployment

1. Create a project, add the backend as a service from `backend/Dockerfile`.
2. Add the frontend as a service from `frontend/Dockerfile` (set build args `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_SCOPES`).
3. Add a persistent volume mounted at `/app/data` for the backend (SQLite file — also stores uploaded CVs).
4. Set all env vars in Coolify's environment editor.
5. Ensure the frontend container can reach `backend:3000` (Coolify service mesh or shared network).
6. After first login, use the **CV** button in the dashboard header to upload your CV as a PDF.

## Notes / risks

- **freelancermap may rate-limit / block**: Scraper uses a descriptive User-Agent, configurable delay (default 1500ms), and contact email header. If blocked, consider Playwright.
- **OpenWebUI `chat_id` resume**: Uses OpenWebUI's `chat_id` to resume threads. If your OpenWebUI version doesn't support this, set `OPENWEBUI_DISABLE_THREAD_RESUME=true` and backend will resend full message history instead.
- **SQLite in Docker**: Always mount `/app/data` as a volume in Coolify to persist data across rebuilds.