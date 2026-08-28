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

  // The RTMP URL contains the stream key. Keeping this condition inside
  // the URL builder makes it impossible for a cohost invite to leak it,
  // even if a future caller accidentally supplies rtmp for both roles.
  if (role === 'lead' && options.rtmp) query.set('rtmp', String(options.rtmp));
  return '/studio?' + query.toString();
}

export const STREAM_TOKEN_SECONDS = STREAM_SECONDS;
