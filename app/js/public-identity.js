/* Stable public aliases for Debatable.
   Real account names stay available for private account and admin views.
   Community, matchmaking, and leaderboard surfaces can call:

     DBIdentity.forUser(firebaseUser) -> { name, username }
     DBIdentity.forId(uidOrSeed)      -> { name, username }
     DBIdentity.forBrowser()          -> { name, username }

   The same seed always returns the same pair, so aliases do not jump
   between renders. Browser-only guests keep one seed in localStorage. */
(function (global) {
  'use strict';

  var SEED_KEY = 'debatable-public-alias-seed';
  var FIRST = [
    'Ari', 'Amara', 'Anika', 'Aya', 'Benji', 'Cleo', 'Dev', 'Eli',
    'Farah', 'Inez', 'Jae', 'Kai', 'Kenji', 'Leila', 'Lina', 'Mara',
    'Mei', 'Mika', 'Nia', 'Nico', 'Noor', 'Omar', 'Priya', 'Ravi',
    'Ren', 'Rin', 'Samira', 'Sana', 'Sasha', 'Theo', 'Yuna', 'Zoya'
  ];
  var LAST = [
    'Arden', 'Ashby', 'Bell', 'Blake', 'Cedar', 'Chen', 'Cole', 'Dane',
    'Ellis', 'Frost', 'Gray', 'Hale', 'Hart', 'Iyer', 'Jain', 'Khan',
    'Lane', 'Lin', 'Mori', 'Nash', 'Park', 'Quinn', 'Reed', 'Rivera',
    'Rowan', 'Sato', 'Shah', 'Stone', 'Vale', 'West', 'Wren', 'Young'
  ];
  var ADJECTIVES = [
    'agile', 'bold', 'calm', 'clear', 'curious', 'direct', 'electric',
    'fair', 'fast', 'fearless', 'focused', 'keen', 'lucid', 'nimble',
    'quiet', 'rapid', 'ready', 'sharp', 'steady', 'witty'
  ];
  var NOUNS = [
    'ballot', 'bench', 'case', 'clash', 'closer', 'crossfire', 'flow',
    'forum', 'gavel', 'motion', 'opener', 'point', 'rebuttal', 'round',
    'speaker', 'speech', 'squad', 'stance', 'warrant', 'whip'
  ];

  function hash(value) {
    var s = String(value || 'debater');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function browserSeed() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(SEED_KEY);
      if (saved) return saved;
      var fresh = '';
      if (global.crypto && global.crypto.getRandomValues) {
        var bytes = new Uint32Array(2);
        global.crypto.getRandomValues(bytes);
        fresh = bytes[0].toString(36) + bytes[1].toString(36);
      } else {
        fresh = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
      if (global.localStorage) global.localStorage.setItem(SEED_KEY, fresh);
      return fresh;
    } catch (e) {
      return 'guest-' + Math.random().toString(36).slice(2);
    }
  }

  function forId(id) {
    var seed = String(id || browserSeed());
    var nameHash = hash('name:' + seed);
    var userHash = hash('username:' + seed);
    var first = FIRST[nameHash % FIRST.length];
    var last = LAST[Math.floor(nameHash / FIRST.length) % LAST.length];
    var adjective = ADJECTIVES[userHash % ADJECTIVES.length];
    var noun = NOUNS[Math.floor(userHash / ADJECTIVES.length) % NOUNS.length];
    var suffix = String(hash('suffix:' + seed) % 10000).padStart(4, '0');
    return {
      name: first + ' ' + last,
      username: adjective + '_' + noun + '_' + suffix
    };
  }

  function forUser(user) {
    return forId(user && user.uid ? user.uid : browserSeed());
  }

  global.DBIdentity = {
    forId: forId,
    forUser: forUser,
    forBrowser: function () { return forId(browserSeed()); }
  };
})(window);
