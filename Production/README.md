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

The chat backend first asks the Laptop service for relevant passages. The laptop index is built once with `npm run index` in the `Laptop` folder; each passage retains its PDF filename and page. Prompt instructions such as “read,” “explain,” and “PDF” are removed from the retrieval query so they do not outrank engineering terms. Broad Division 2 Part 5 questions retrieve targeted passages for its assessment sections. The AI receives selected passages, not the entire PDF. The laptop does not need to be online for the website to respond: if it cannot be reached, no PDF passages match, keyword coverage is weak, a requested edition comparison is missing an edition, or the user explicitly asks for research, the backend searches ASME-related web sources when Tavily is configured. Without Tavily, the model can still answer, but it must clearly state that Code requirements could not be verified against the PDFs. Web results are clearly supplementary research, never proof of an ASME Code requirement. A browser-level network error means the request did not reach Vercel, so server-side PDF/web fallback cannot run for that request. Answers must not invent clauses, editions, or Code limits; verify engineering decisions against the applicable licensed Code edition.

## Built-in ASME Engine (works when every AI is down)

`lib/asme-engine.ts` is the site's own answer writer. It needs no API key and no network. When every AI provider is out of quota, rejected, timed out, or not configured, the chat route hands the question and whatever PDF passages were retrieved to the engine, which streams back a finished answer instead of an error:

- **Calculators** for Division 1 UG-27 shell/sphere thickness and UG-99/UG-100 test pressure (refuses on unit mismatch or Division 2/3). The same calculator output is also given to the AI models as "verified calculator result" so they do not do the arithmetic themselves.
- **Reference glossary** of established terms (MAWP, MDMT, PWHT, Part 5 failure modes, stamps, NBIC…), always labelled as general reference, not Code text.
- **Extractive composer** that ranks sentences from the retrieved PDF passages against the question and writes a cited answer with a source table, flags editions/Divisions that were asked for but not retrieved, and labels the owner's study notes as "not the Code". With no evidence it says it could not verify — it never guesses a clause.

The answer is badged **Built-in ASME Engine** in the UI. `GET /api/status` (signed-in users) reports provider key counts, laptop online/offline and PDF count.

## Division 2 Part 5 Brain (no AI needed)

Any Division 2 Part 5 question (plastic collapse, local failure, buckling, fatigue, ratcheting, creep, bolts…) is answered **instantly with no AI, no network and no quota** by `lib/part5/brain.ts`, using the structured map in `lib/part5/outline.ts` (our own wording, with equation numbers). Under the answer, tap a calculator to open a pop-up that asks for each variable (symbol, name, unit), then shows the worked calculation steps (`lib/part5/calculators.ts`, 16 calculators, every equation checked against the 2025 PDF and unit-tested). **Ask AI to elaborate** re-sends the question to the AI writers (and the built-in engine still catches a failure). Header buttons open the **Part 5 Explorer**, the **Calculators** list and the **System status** panel.

Exact paragraph text ("Full text from my PDF") is read from your own PDF through the laptop service, so the licensed text is never stored in this repository: copy `Laptop/build-part5.mjs` + the new `Laptop/server.mjs` next to your Part 5 PDF and run `npm run part5` once, then restart the service.

## Whole Division 2 library (all nine Parts)

The header **Division 2 Library** lists every section of Parts 1–9 (generated from your 2025 PDF), a detailed offline guide for Part 5, Part 4.3 (shells and heads) and Part 8.2 (test pressure), and **34 calculators**. **No laptop needed for figures:** in **View PDF pages** choose your PDF once and it is stored only in this browser (IndexedDB) — pages, tables, graphs and exact text then open instantly, even offline. For *any* section, **Full text from my PDF** and **View PDF pages** (figures, tables, graphs, equations rendered as images) are read live from your own PDF through the laptop service, so no ASME text or figure is stored in this repository. Laptop setup: put `div2.mjs`, `build-div2.mjs`, the new `server.mjs` and `package.json` next to `ASME Sec VIII Div2 2025.pdf`, run `npm run div2` once (about 1–2 minutes), then restart the service.

## Deploy to Vercel

1. Push the workspace repository to GitHub. Root ignore rules exclude PDF files, local indexes, secrets, and dependencies.
2. In Vercel, import the repository and set **Root Directory** to `Production`.
3. Set the server-side environment variables from `.env.example`: Nova Supabase URL/anon key, AI provider key(s), the laptop HTTPS tunnel URL/token, and optional Tavily key. Never use `NEXT_PUBLIC_` for secrets.
4. Deploy. Redeploy after changing environment variables.

The deployed site reaches the Laptop folder only through its configured HTTPS tunnel. The laptop, retrieval service, and tunnel must remain online. A temporary Cloudflare Quick Tunnel URL changes on restart and has no uptime guarantee; use a stable named tunnel/domain for ongoing use. Until the tunnel and Vercel variables are configured and tested against the deployed URL, laptop PDF retrieval is not connected.

## Troubleshooting

- **Laptop retrieval returns HTTP 401:** `ASME_LAPTOP_RETRIEVAL_TOKEN` in Vercel must exactly match `ASME_RETRIEVAL_TOKEN` in the laptop's `.env.local`. After changing the laptop file, restart `npm start`; after changing Vercel variables, redeploy. Do not share either token.
- **Gemini rejects a key:** replace revoked or incorrectly restricted keys in Vercel. A server-side key must have access to the Gemini API and must not be restricted to browser referrers. Remove stale keys from both the plural key pool and any single-key variables. Keep another provider configured for failover when possible.
- **Requests taking too long:** optional NVIDIA reranking has a short deadline and is skipped for broad Part 5 answers; targeted local PDF search and lexical ranking are used instead. Provider connection attempts and response streams are bounded, model output is capped to keep answers responsive, and the full chat request has a 4.5-minute deadline. If the full Part 5 answer still times out, ask about one section at a time (for example plastic collapse or buckling). If every configured provider rejects its keys or is unavailable, the assistant cannot produce an answer.

## Validation

```powershell
npm run test:retrieval
npx tsc --noEmit
npm run build
```
