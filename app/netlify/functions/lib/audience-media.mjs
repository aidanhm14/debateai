// Audio is an explicit casual-call invitation, never a side effect of a
// camera-only approval or a self-serve human check.
export function audienceAudioAllowed(round, approval) {
  return ['open', 'conversation'].includes(round?.format)
    && approval?.audio === true;
}
