const SHADOWING_MARKER = '【跟读句】';
const REQUIREMENT_MARKER = '【练习要求】';

export function parseCoachReply(rawContent) {
  const content = String(rawContent ?? '').trim();
  const shadowingIndex = content.indexOf(SHADOWING_MARKER);
  const requirementIndex = content.indexOf(REQUIREMENT_MARKER);
  const markerIndexes = [shadowingIndex, requirementIndex].filter((index) => index >= 0);
  const messageEnd = markerIndexes.length ? Math.min(...markerIndexes) : content.length;
  const message = content.slice(0, messageEnd).trim() || content;
  const shadowing = shadowingIndex >= 0
    ? content.slice(
      shadowingIndex + SHADOWING_MARKER.length,
      requirementIndex > shadowingIndex ? requirementIndex : content.length,
    ).trim()
    : '';
  const requirement = requirementIndex >= 0
    ? content.slice(requirementIndex + REQUIREMENT_MARKER.length).trim()
    : '完整跟读教练示范句，播放自己的录音并比较语速与声调。';

  return { message, shadowing, requirement };
}
