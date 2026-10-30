class DigestRequest {
  const DigestRequest({
    required this.chapterId,
    required this.targetLang,
    required this.targetMinutes,
    this.wpm = 200,
  });

  final String chapterId;
  final String targetLang;
  final int targetMinutes;
  final int wpm;
}
