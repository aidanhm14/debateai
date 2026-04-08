import { verifyIdToken, extractBearerToken } from './lib/auth.mjs';
import { corsResponse, jsonResponse, errorResponse } from './lib/response.mjs';

export default async (request) => {
  if (request.method === 'OPTIONS') return corsResponse(request);
  if (request.method !== 'POST') return errorResponse('Method not allowed', 405, request);

  // Require Firebase authentication
  const token = extractBearerToken(request);
  if (!token) return errorResponse('Authentication required', 401, request);

  try {
    await verifyIdToken(token);
  } catch (err) {
    return errorResponse('Authentication failed. Please sign in again.', 401, request);
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return errorResponse('API not configured', 500, request);

  try {
    const body = await request.json();
    const query = (body.query || '').trim();

    // Input validation
    if (!query) return errorResponse('Missing query', 400, request);
    if (query.length > 500) return errorResponse('Query too long (max 500 characters)', 400, request);
    if (query.length < 3) return errorResponse('Query too short', 400, request);

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a news research assistant. Provide detailed, factual summaries of recent news developments. Focus on stories with genuine ethical, policy, or philosophical tensions that would make good debate topics. Include specific details: names, dates, places, stakes. Be thorough but concise.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      return errorResponse('News search temporarily unavailable. Please try again.', response.status, request);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    return jsonResponse({ text }, 200, request);
  } catch (e) {
    return errorResponse('Something went wrong. Please try again.', 500, request);
  }
};

export const config = { path: '/api/perplexity' };
