// Dry run by default. Set the normal GOOGLE_* server credentials.
import { getDb } from '../app/netlify/functions/lib/firestore.mjs';
import { reconcileRatings } from '../app/netlify/functions/lib/rating-reconcile-run.mjs';
export { reconcileRatings };

if(process.argv[1]?.endsWith('/reconcile-ratings.mjs')){const db=getDb();try{console.log(JSON.stringify(await reconcileRatings(db,{apply:process.argv.includes('--apply')}),null,2));}finally{await db.terminate();}}
