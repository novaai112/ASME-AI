# ASME Interpreter — Production

This GitHub repository contains only the Next.js website and backend in [`Production/`](./Production/README.md). Set the Vercel project **Root Directory** to `Production`.

The separate `Laptop` folder and its ASME PDFs, local index, and retrieval service stay on the owner's computer and are not part of this repository. The Production backend can connect to that service over a configured HTTPS tunnel; this connection is not automatic. Never upload PDFs, indexes, or secrets to GitHub or Vercel.
