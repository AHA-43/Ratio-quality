# Firebase setup (simple version)

1. https://console.firebase.google.com → Add project (e.g. `ratio-quality`). Upgrade to **Blaze** (needed for Storage).
2. Build → **Authentication** → Get started → enable **Email/Password**. Add users manually (Users tab). Do not share the app link for sign-up; Settings → "User actions" → untick "Enable create (sign-up)".
3. Build → **Firestore Database** → Create (production mode). Pick the region carefully — it cannot change later.
4. Build → **Storage** → Get started (same region).
5. Project settings → Your apps → Web (`</>`) → copy the config into `artifacts/ratio-quality/.env.local` (see `.env.example`).
6. On your computer: `npm i -g firebase-tools && firebase login && firebase use <projectId>`
   then `firebase deploy --only firestore:rules,storage,hosting` after `pnpm --filter @workspace/ratio-quality build`.

Without `.env.local` the app runs exactly as before (local only, no login).
