// Sourced providers only. A knowledge-only response cannot publish a card.
export async function searchFacts(prompt, {openaiKey=process.env.OPENAI_API_KEY, perplexityKey=process.env.PERPLEXITY_API_KEY, fetcher=fetch} = {}) {
  if (openaiKey) {
    const res=await fetcher('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(22000),
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+openaiKey},
      body:JSON.stringify({model:'gpt-6-astra',store:false,reasoning:{effort:'low'},max_output_tokens:2400,max_tool_calls:2,
        tools:[{type:'web_search',search_context_size:'low'}],include:['web_search_call.action.sources'],
        instructions:prompt.system+' Search authoritative primary sources. Include exact source URLs in the JSON. Do not append citation markers inside JSON values.',input:prompt.user})});
    if (!res.ok) throw new Error('Source provider HTTP '+res.status);
    const d=await res.json(), output=d.output || [];
    if (d.status !== 'completed') throw new Error('Incomplete source check');
    const content=output.filter(o=>o.type==='message').flatMap(o=>o.content || []);
    const searched=output.some(o=>o.type==='web_search_call'&&o.status==='completed');
    return {text:content.filter(c=>c.type==='output_text').map(c=>c.text).join(''),
      sources:searched ? [...output.filter(o=>o.type==='web_search_call').flatMap(o=>o.action?.sources || []),
        ...content.flatMap(c=>c.annotations || []).filter(a=>a.type==='url_citation')].filter(s=>s.url).map(s=>({url:s.url,title:s.title || s.url})) : [],
      model:'gpt-6-astra',provider:'openai'};
  }
  if (!perplexityKey) throw new Error('No source provider');
  const res=await fetcher('https://api.perplexity.ai/chat/completions',{method:'POST',signal:AbortSignal.timeout(22000),
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+perplexityKey},
    body:JSON.stringify({model:'sonar-pro',max_tokens:1200,temperature:0,messages:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]})});
  if(!res.ok)throw new Error('Source provider HTTP '+res.status);
  const d=await res.json();return {text:d.choices?.[0]?.message?.content || '',sources:d.search_results || (d.citations || []).map(url=>({url,title:url})),model:'sonar-pro',provider:'perplexity'};
}
