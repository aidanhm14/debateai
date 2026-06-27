// Focus an existing DebateIt voice-round tab if one is open; otherwise
// open a fresh one. The round's own "Float over apps" button (Document
// Picture-in-Picture) does the actual floating — this is just a launcher.
var ROUND_URL = 'https://debateai.com/voice-debate?float=1';

document.getElementById('go').addEventListener('click', function () {
  chrome.tabs.query({ url: 'https://debateai.com/voice-debate*' }, function (tabs) {
    if (tabs && tabs.length) {
      var t = tabs[0];
      chrome.tabs.update(t.id, { active: true });
      if (t.windowId != null && chrome.windows) chrome.windows.update(t.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: ROUND_URL });
    }
    window.close();
  });
});
