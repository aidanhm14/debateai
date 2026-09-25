import assert from 'node:assert/strict';
import { handler } from '../app/netlify/functions/round-feedback-form.mjs';
const previous=process.env.ROUND_FEEDBACK_FORM_URL;
try {
  for (const url of ['', 'javascript:alert(1)', 'https://evil.test/form', 'https://docs.google.com.evil.test/forms/d/e/123/viewform', 'https://secret@docs.google.com/forms/d/e/123/viewform']) {
    process.env.ROUND_FEEDBACK_FORM_URL=url;
    assert.equal(JSON.parse((await handler({httpMethod:'GET'})).body).url,null);
  }
  for (const url of ['https://docs.google.com/forms/d/e/fixture/viewform','https://forms.gle/fixture']) {
    process.env.ROUND_FEEDBACK_FORM_URL=url;
    assert.deepEqual(JSON.parse((await handler({httpMethod:'GET'})).body),{url});
  }
  assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
} finally {if(previous===undefined)delete process.env.ROUND_FEEDBACK_FORM_URL;else process.env.ROUND_FEEDBACK_FORM_URL=previous;}
console.log('Round feedback configuration: allowlist, missing configuration, credential rejection and read-only method checks passed.');
