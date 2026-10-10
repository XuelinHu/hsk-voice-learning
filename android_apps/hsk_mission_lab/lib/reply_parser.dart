class ParsedCoachReply {
  const ParsedCoachReply({
    required this.message,
    required this.shadowing,
    required this.requirement,
  });

  final String message;
  final String shadowing;
  final String requirement;
}

ParsedCoachReply parseCoachReply(String rawContent) {
  const shadowingMarker = '【跟读句】';
  const requirementMarker = '【练习要求】';
  final content = rawContent.trim();
  final shadowingIndex = content.indexOf(shadowingMarker);
  final requirementIndex = content.indexOf(requirementMarker);
  final indexes = <int>[
    if (shadowingIndex >= 0) shadowingIndex,
    if (requirementIndex >= 0) requirementIndex,
  ];
  final messageEnd = indexes.isEmpty
      ? content.length
      : indexes.reduce((a, b) => a < b ? a : b);
  final message = content.substring(0, messageEnd).trim();
  final shadowing = shadowingIndex < 0
      ? ''
      : content
            .substring(
              shadowingIndex + shadowingMarker.length,
              requirementIndex > shadowingIndex
                  ? requirementIndex
                  : content.length,
            )
            .trim();
  final requirement = requirementIndex < 0
      ? '完整跟读示范句，回放自己的录音并比较语速与声调。'
      : content.substring(requirementIndex + requirementMarker.length).trim();
  return ParsedCoachReply(
    message: message.isEmpty ? content : message,
    shadowing: shadowing,
    requirement: requirement,
  );
}
