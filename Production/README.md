# ASME Interpreter — Production website

This folder contains the Next.js frontend and server APIs for deployment. Configure the Vercel project's **Root Directory** as `Production`. The laptop retrieval service, its setup instructions, and ASME PDFs are maintained separately on the owner's computer and are not included in this repository.

## Local development

1. Install Node.js 20.19 or newer.
2. From this folder, install dependencies and prepare local configuration:

   ```powershell
   npm install
   Copy-Item .env.example .env.local
   ```

3. Configure `NOVA_SUPABASE_URL`, `NOVA_SUPABASE_ANON_KEY`, and at least one official AI provider key in `.env.local`. Set `ASME_LAPTOP_RETRIEVAL_URL` and `ASME_LAPTOP_RETRIEVAL_TOKEN` when the laptop service and HTTPS tunnel are ready. Set `TAVILY_API_KEY` to enable ASME-related web research fallback.
4. Start the website:

   ```powershell
   npm run dev
   ```

The app requires an existing Nova AI account. Supabase is used for sign-in; the ASME source PDFs remain in the Laptop folder. Local `.env.local` files are ignored by Git.

## PDF-first answers and web fallback

The chat backend first asks the Laptop service for relevant passages. The laptop index is built once with `npm run index` in the `Laptop` folder; each passage retains its PDF filename and page. The AI receives selected passages, not the entire PDF. If the laptop cannot be reached, no PDF passages match, keyword coverage is weak, a requested edition comparison is missing an edition, or the user explicitly asks for research, the backend can search ASME-related web sources when Tavily is configured. Web results are clearly supplementary research, never proof of an ASME Code requirement. Answers must not invent clauses, editions, or Code limits; verify engineering decisions against the applicable licensed Code edition.

## Deploy to Vercel

1. Push the workspace repository to GitHub. Root ignore rules exclude PDF files, local indexes, secrets, and dependencies.
2. In Vercel, import the repository and set **Root Directory** to `Production`.
3. Set the server-side environment variables from `.env.example`: Nova Supabase URL/anon key, AI provider key(s), the laptop HTTPS tunnel URL/token, and optional Tavily key. Never use `NEXT_PUBLIC_` for secrets.
4. Deploy. Redeploy after changing environment variables.

The deployed site reaches the Laptop folder only through its configured HTTPS tunnel. The laptop, retrieval service, and tunnel must remain online. A temporary Cloudflare Quick Tunnel URL changes on restart and has no uptime guarantee; use a stable named tunnel/domain for ongoing use. Until the tunnel and Vercel variables are configured and tested against the deployed URL, laptop PDF retrieval is not connected.

## Validation

```powershell
npm run test:retrieval
npx tsc --noEmit
npm run build
```
