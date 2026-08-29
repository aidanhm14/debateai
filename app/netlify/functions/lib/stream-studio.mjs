const STREAM_SECONDS = 12 * 60 * 60;

export function streamerName(value, fallback = 'Host') {
  const clean = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || fallback).slice(0, 60);
}

export function ownerTokenProperties(roomName, options = {}) {
  const role = options.role === 'cohost' ? 'cohost' : 'lead';
  const nowSec = Number.isFinite(options.nowSec)
    ? Math.floor(options.nowSec)
    : Math.floor(Date.now() / 1000);
  const properties = {
    room_name: roomName,
    is_owner: true,
    exp: nowSec + STREAM_SECONDS,
    eject_at_token_exp: true,
    user_name: streamerName(options.userName, role === 'cohost' ? 'Cohost' : 'Host'),
  };

  // Only the lead token may auto-start the recording. A cohost joining
  // later is another camera and microphone, not a second recording trigger.
  if (role === 'lead' && options.withRecording) {
    properties.start_cloud_recording = true;
  }
  if (role === 'cohost') {
    properties.enable_recording_ui = false;
  }
  return properties;
}

export function studioPath(options = {}) {
  const role = options.role === 'cohost' ? 'cohost' : 'lead';
  const query = new URLSearchParams({ url: String(options.url || '') });
  if (options.token) query.set('t', String(options.token));
  if (options.title) query.set('title', String(options.title));
  query.set('name', streamerName(options.userName, role === 'cohost' ? 'Cohost' : 'Host'));
  query.set('role', role);

  // Simulcast keys remain server-side. The lead receives a one-time start
  // token plus safe endpoint names; a cohost receives neither.
  if (role === 'lead') {
    if (options.roomName) query.set('room', String(options.roomName).slice(0, 128));
    if (options.restreamToken) query.set('rs', String(options.restreamToken).slice(0, 128));
    (Array.isArray(options.restreams) ? options.restreams : []).forEach((target) => {
      const platform = String(target && target.platform || '').toLowerCase();
      const endpoint = String(target && target.endpoint || '');
      if (/^[a-z]{2,20}$/.test(platform) && /^rtmp_[a-z]{2,20}$/.test(endpoint)) {
        query.append('out', platform + ':' + endpoint);
      }
    });
  }
  return '/studio?' + query.toString();
}

export const STREAM_TOKEN_SECONDS = STREAM_SECONDS;
