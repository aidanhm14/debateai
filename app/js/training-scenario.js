(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBTrainingScenario = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var types = Object.freeze({
    sales: { title: 'Sales training', path: '/sales-training' },
    lawyer: { title: 'Lawyer training', path: '/lawyer-training' },
    negotiation: { title: 'Negotiation training', path: '/negotiation-training' },
    belief: { title: 'Belief expression training', path: '/belief-expression-training' }
  });
  var limits = { situation: 1200, counterpart: 300, goal: 400 };
  function parse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.type !== 'string' || !Object.prototype.hasOwnProperty.call(types, value.type)) {
      throw new Error('Choose a type of training first.');
    }
    var result = { type: value.type };
    Object.keys(limits).forEach(function (key) {
      if (typeof value[key] !== 'string') throw new Error('Add your situation, who you are talking to, and your goal.');
      var text = value[key].replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      if (!text) throw new Error('Add your situation, who you are talking to, and your goal.');
      if (text.length > limits[key]) throw new Error('Keep ' + key + ' under ' + limits[key] + ' characters.');
      result[key] = text;
    });
    return result;
  }
  function key(type) { return 'debatable-training-v1:' + type; }
  function read(storage, type) {
    var result = parse(JSON.parse(storage.getItem(key(type))));
    if (result.type !== type) throw new Error('Open your training setup again.');
    return result;
  }
  return { types: types, limits: limits, parse: parse, key: key, read: read };
});
