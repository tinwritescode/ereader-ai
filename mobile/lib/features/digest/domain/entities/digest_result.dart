class DigestResult {
  const DigestResult({
    required this.cacheKey,
    required this.targetWords,
    required this.content,
    required this.cached,
  });

  final String cacheKey;
  final int targetWords;
  final String content;
  final bool cached;
}
