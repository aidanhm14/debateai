// Crop only the public, fixed-layout DBRoomSnapshot thumbnail. Never read
// a round's private clean frame, and never apply these coordinates to an
// owner-picked frame or an arbitrary recording still.
export function faceThumbnailSvg(publicJpeg) {
  const image = Buffer.from(publicJpeg).toString('base64');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
<rect width="640" height="360" fill="#16161a"/>
<svg x="0" y="0" width="319" height="360" viewBox="8 36 308 234" preserveAspectRatio="xMidYMid slice" overflow="hidden"><image width="640" height="360" href="data:image/jpeg;base64,${image}"/></svg>
<svg x="321" y="0" width="319" height="360" viewBox="324 36 308 234" preserveAspectRatio="xMidYMid slice" overflow="hidden"><image width="640" height="360" href="data:image/jpeg;base64,${image}"/></svg>
</svg>`;
}
