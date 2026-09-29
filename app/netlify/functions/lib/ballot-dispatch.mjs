// Shared bounded dispatch. Never use a client-supplied callback URL.
export async function sendBallotJob(job) {
  const secret=String(process.env.INTERNAL_JUDGE_KEY || '');
  if(secret.length<16)throw new Error('Background judging is not configured');
  const origin=process.env.DEPLOY_PRIME_URL || process.env.URL || 'https://itsdebatable.com';
  const response=await fetch(new URL('/.netlify/functions/ballot-recovery-background',origin),{
    method:'POST',headers:{'content-type':'application/json','x-internal-judge-key':secret},
    body:JSON.stringify(job),signal:AbortSignal.timeout(8000),redirect:'error',
  });
  if(response.status!==202)throw new Error('Background invocation rejected');
}
