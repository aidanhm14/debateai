// Editorial selection for the homepage only. Never use this to moderate,
// delete, or rewrite messages in Discord or the actual community rooms.
const OMIT_FROM_PREVIEW = [
  /\b(?:nobodys?|no\s*(?:ones?|bodys?)|no1)\s+(?:(?:is|seems?|appears?|even|ever|really|actually|still)\s+)*(?:here|online|around|active|playing|joining|talking|chatting|debating|responding|replying|using\s+(?:this|the)\s+(?:app|site))\b/,
  /\b(?:nobody|no\s*one|no\s*body)\s+(?:to\s+(?:debate|play|talk)|wants?\s+to\s+(?:debate|play))\b/,
  /\b(?:theres|there\s+(?:is|are))\s+(?:no|zero)\s+(?:people|users|players|members|opponents|activity)\b(?=$|[?!.]|\s+(?:here|online|around|active|(?:in|on)\s+(?:this|the)\s+(?:server|app|site|chat|community))\b)/,
  /^(?:(?:is\s+)?(?:there\s+)?(?:any\s*one|anybody)(?:\s+(?:even\s+)?(?:here|online|around))?|where\s+is\s+everyone)[?!.\s]*$/,
  /\b(?:is\s+(?:this|the)\s+(?:an?\s+)?active\s+(?:page|server|chat|community)|is\s+(?:this|the)\s+(?:page|server|chat|community)\s+(?:still\s+)?active)\b/,
  /\b(?:chat|server|discord|community|queue|app|site|platform|place|this|it)\s+(?:(?:is|s|was|seems?|looks?|feels?|so|really|just|totally|completely|pretty|basically|still)\s+)*(?:dead|dying|empty|inactive|deserted|abandoned)\b/,
  /\b(?:dead|empty|inactive|deserted|abandoned)\s+(?:chat|server|discord|community|queue|app|site|platform)\b/,
  /\b(?:so|really|very|too)\s+(?:dead|empty|quiet)\s+(?:in\s+)?here\b/,
  /\b(?:no\s+(?:(?:new|recent)\s+)?updates|hasnt\s+been\s+updated|havent\s+(?:had|seen|gotten)\s+(?:any\s+)?updates)\b/,
  /\b(?:app|site|server|platform|matchmaking|queue|this|it)\s+(?:(?:is|s|was|so|really|just|completely|still)\s+)*(?:broken|buggy|unusable|bad|boring|pointless|useless|terrible|awful|trash|garbage|a\s+(?:scam|joke)|sucks?)\b/,
  /\b(?:terrible|awful|useless|garbage|worst)\s+(?:app|site|server|platform)\b/,
  /\b(?:nothing\s+works|nothings?\s+working|(?:app|site|matchmaking|queue)\s+(?:doesnt|isnt)\s+work(?:ing)?)\b/,
  /\b(?:cant|cannot|couldnt|never)\s+(?:find|get|found|got)\s+(?:(?:a|any|an)\s+)?(?:match|opponent)\b/,
  /\b(?:been\s+waiting|waited)\s+(?:for\s+)?(?:(?:over|about)\s+)?(?:\d+|ten|twenty|thirty|an?|one|two)\s*(?:mins?|minutes?|hours?|hrs?)\b/,
  /\b(?:fuck(?:ing|ed|s)?|shit(?:ty)?|bullshit|bitch(?:es)?|asshole|wtf)\b/,
];

export function isChatPreviewEligible(raw) {
  if (typeof raw !== 'string') return false;
  const text = raw.normalize('NFKC').toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/['’*_~`]/g, '')
    .replace(/\s+/g, ' ').trim();
  return !!text && !OMIT_FROM_PREVIEW.some(pattern => pattern.test(text));
}
