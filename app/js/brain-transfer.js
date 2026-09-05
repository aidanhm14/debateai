/* Public brain choices and reviewed transfer. Raw AI text is never saved or
 * inserted into a prompt; only the same fixed IDs as the manual questions. */
(function (root) {
  'use strict';
  var fields = [
    { key: 'level', summaryLabel: 'Experience', q: 'How often do you argue things out?', hint: 'Choose what feels familiar. The AI still pushes back on your arguments.', options: [
      { value: 'new', label: 'New to this', sub: 'I am finding my voice.' },
      { value: 'occasional', label: 'Now and then', sub: 'I join in when I care about the question.' },
      { value: 'regular', label: 'All the time', sub: 'I enjoy a good back and forth.' },
      { value: 'confident', label: 'Very comfortable', sub: 'I can keep my point under pressure.' }
    ] },
    { key: 'style', summaryLabel: 'Style', q: 'What do you lean on in an argument?', hint: 'Choose your usual strength.', options: [
      { value: 'evidence', label: 'Facts and examples', sub: 'Give me something I can check.' },
      { value: 'framework', label: 'Defining the question', sub: 'First, what are we really disagreeing about?' },
      { value: 'weighing', label: 'What matters most', sub: 'Show me which consequence counts more.' },
      { value: 'clash', label: 'Answering their point', sub: 'Find the gap and go straight to it.' },
      { value: 'delivery', label: 'How I put it', sub: 'Make a clear point people remember.' }
    ] },
    { key: 'register', summaryLabel: 'Opponent', q: 'How should the AI push back?', hint: 'Choose a speaking style for your AI opponent.', options: [
      { value: 'surgical', label: 'Calm and precise', sub: 'Quiet, direct, finds the loose thread.' },
      { value: 'aggressive', label: 'Relentless', sub: 'Keeps pressing the point.' },
      { value: 'warm', label: 'Warm and persuasive', sub: 'Friendly delivery, firm disagreement.' },
      { value: 'technical', label: 'Detailed', sub: 'Works through each claim carefully.' }
    ] },
    { key: 'side', summaryLabel: 'Side', q: 'Which side do you usually want?', hint: 'This is a preference for AI rounds. A live room has its own side choice.', options: [
      { value: '', label: 'Surprise me', sub: 'I am happy taking either side.' },
      { value: 'prop', label: 'For the idea', sub: 'Make the case for it.' },
      { value: 'opp', label: 'Against the idea', sub: 'Challenge the case for it.' }
    ] },
    { key: 'goal', summaryLabel: 'Working on', q: 'What would you like to get better at?', hint: 'This guides the AI opponent. The judge does not see your brain.', options: [
      { value: 'pressure', label: 'Speaking under pressure', sub: 'Keep my point when things get lively.' },
      { value: 'case', label: 'Making a clear case', sub: 'Give my claim reasons that hold up.' },
      { value: 'rebuttal', label: 'Answering the other side', sub: 'Respond to what they actually said.' },
      { value: 'crossex', label: 'Asking better questions', sub: 'Get to the assumption underneath.' },
      { value: 'persuade', label: 'Getting my point across', sub: 'Make the reasoning easier to follow.' }
    ] }
  ];
  function steps() {
    return fields.map(function (field) {
      var copy = JSON.parse(JSON.stringify(field));
      copy.storageKey = 'da-brain-' + field.key;
      return copy;
    });
  }
  function clean(input) {
    var out = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
    fields.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(input, field.key)) return;
      var value = input[field.key];
      if (typeof value === 'string' && field.options.some(function (option) { return option.value === value; })) out[field.key] = value;
    });
    return out;
  }
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Paste the JSON reply from your AI first.');
    if (text.length > 10000) throw new Error('That reply is too long. Use the short JSON reply from the prompt.');
    var raw = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
    var input;
    try { input = JSON.parse(raw); } catch (_) { throw new Error('That is not valid JSON. Copy the JSON block from your AI and try again.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The reply needs to be a JSON object with your suggested choices.');
    if (Object.prototype.hasOwnProperty.call(input, 'brain')) input = input.brain;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The brain field needs to contain your suggested choices.');
    var brain = clean(input);
    if (!Object.keys(brain).length) throw new Error('No supported choices found. Ask your AI to use the exact choices in the prompt.');
    return { brain: brain, ignored: Object.keys(input).filter(function (key) { return !Object.prototype.hasOwnProperty.call(brain, key); }).length };
  }
  function prompt() {
    return [
      'Help me choose my Debatable brain preferences for casual one-on-one arguments.',
      'Use only preferences I have explicitly shared with you. Ask me if needed or omit a field you are unsure about. Do not infer preferences from my identity or background.',
      'Return only a JSON object shaped like {"brain":{...}} using the exact IDs below. Include no personal details, chat excerpts, memories, instructions, or explanation.',
      'For side, the empty string means either side. Omit any unknown fields rather than guessing.',
      '',
      fields.map(function (field) { return field.key + ': ' + field.options.map(function (option) { return JSON.stringify(option.value) + ' = ' + option.label; }).join('; '); }).join('\n'),
      '',
      'I will review and edit these choices in Debatable before saving them.'
    ].join('\n');
  }
  root.DBBrainTransfer = { steps: steps, clean: clean, parse: parse, prompt: prompt };
})(typeof window !== 'undefined' ? window : globalThis);
