// Copies the pdf.js browser build into /public so the Division 2 page viewer can render the user's own PDF
// in the browser (no laptop needed). Runs after `npm install` so the files always match the installed version.
import { copyFile, mkdir } from "node:fs/promises"
const from = new URL("../node_modules/pdfjs-dist/build/", import.meta.url)
const to = new URL("../public/pdfjs/", import.meta.url)
await mkdir(to, { recursive: true })
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) await copyFile(new URL(file, from), new URL(file, to))
console.info("pdf.js browser build copied to public/pdfjs")
