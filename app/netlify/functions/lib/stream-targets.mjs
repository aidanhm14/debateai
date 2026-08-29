// Pure configuration resolver for tournament broadcast simulcasting.
// RTMP URLs contain platform stream keys and must never be returned by a
// public function, written to the stream document, or placed in a cohost URL.

const PLATFORM_ORDER = ['twitch', 'youtube', 'tiktok', 'primary'];
const DEFAULT_ENABLED_PLATFORMS = ['tiktok'];
const LABELS = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  primary: 'External',
};

function cleanRtmp(value) {
  const url = String(value || '').trim();
  if (!url || url.length > 2048 || !/^rtmps?:\/\/[^\s]+$/i.test(url)) return '';
  return url;
}

function cleanTwitch(value) {
  const match = String(value || '').trim().toLowerCase().match(/^[a-z0-9_]{1,60}$/);
  return match ? match[0] : '';
}

function cleanYouTubeChannel(value) {
  const match = String(value || '').trim().match(/^[A-Za-z0-9_-]{6,80}$/);
  return match ? match[0] : '';
}

function cleanTikTokUser(value) {
  const match = String(value || '').trim().replace(/^@/, '').match(/^[A-Za-z0-9._]{2,40}$/);
  return match ? match[0] : '';
}

function enabledPlatforms(value) {
  const requested = String(value || DEFAULT_ENABLED_PLATFORMS.join(','))
    .toLowerCase().split(',').map((item) => item.trim()).filter(Boolean);
  return new Set(requested.filter((platform) => PLATFORM_ORDER.includes(platform)));
}

export function streamTargets(env = {}) {
  // TikTok-only is the current operating policy. Keeping the allowlist in
  // front of the stored credentials means older Twitch and YouTube secrets
  // can remain in Netlify without silently rejoining the next broadcast.
  const enabled = enabledPlatforms(env.STREAM_ENABLED_PLATFORMS);
  const explicit = {
    twitch: cleanRtmp(env.STREAM_TWITCH_RTMP_URL),
    youtube: cleanRtmp(env.STREAM_YOUTUBE_RTMP_URL),
    tiktok: cleanRtmp(env.STREAM_TIKTOK_RTMP_URL),
  };
  const legacy = cleanRtmp(env.STREAM_RTMP_URL);
  if (legacy) {
    // Keep the single-target variable working. The public channel setting
    // identifies which platform it belongs to once newer targets are added.
    let platform = 'primary';
    if (cleanTwitch(env.STREAM_TWITCH_CHANNEL)) platform = 'twitch';
    else if (cleanYouTubeChannel(env.STREAM_YOUTUBE_CHANNEL_ID)) platform = 'youtube';
    if (!explicit[platform]) explicit[platform] = legacy;
  }

  const seen = new Set();
  return PLATFORM_ORDER.flatMap((platform) => {
    if (!enabled.has(platform)) return [];
    const rtmpUrl = explicit[platform] || '';
    if (!rtmpUrl || seen.has(rtmpUrl)) return [];
    seen.add(rtmpUrl);
    return [{
      platform,
      label: LABELS[platform],
      endpoint: 'rtmp_' + platform,
      rtmpUrl,
    }];
  });
}

export function safeStudioTargets(targets = []) {
  return targets.map(({ platform, label, endpoint }) => ({ platform, label, endpoint }));
}

export function dailyEndpointPayload(targets = []) {
  return targets.map(({ rtmpUrl }) => ({ endpoint: rtmpUrl }));
}

export function publicPlatforms(targets = []) {
  return targets.map(({ platform }) => platform);
}

export function publicRestreamLinks(targets = [], env = {}) {
  const active = new Set(publicPlatforms(targets));
  const links = [];
  const twitch = cleanTwitch(env.STREAM_TWITCH_CHANNEL);
  const youtube = cleanYouTubeChannel(env.STREAM_YOUTUBE_CHANNEL_ID);
  const tiktok = cleanTikTokUser(env.STREAM_TIKTOK_USERNAME);
  if (active.has('twitch') && twitch) {
    links.push({ platform: 'twitch', label: 'Twitch', url: 'https://www.twitch.tv/' + twitch });
  }
  if (active.has('youtube') && youtube) {
    links.push({ platform: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/channel/' + youtube + '/live' });
  }
  if (active.has('tiktok') && tiktok) {
    links.push({ platform: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@' + tiktok + '/live' });
  }
  return links;
}

export function platformLabel(value) {
  return LABELS[value] || 'External';
}
