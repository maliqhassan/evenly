/**
 * One-off: add `role: "authenticated"` to every existing Firebase user.
 * Run locally with a service account (NEVER ship this key in the app):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run backfill
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

initializeApp();

async function main() {
  const auth = getAuth();
  let pageToken: string | undefined;
  let updated = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (user.customClaims?.role !== 'authenticated') {
        await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: 'authenticated' });
        updated++;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`Updated ${updated} user(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
