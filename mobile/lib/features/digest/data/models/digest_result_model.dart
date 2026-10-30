import '../../domain/entities/digest_result.dart';

class DigestResultModel extends DigestResult {
  const DigestResultModel({
    required super.cacheKey,
    required super.targetWords,
    required super.content,
    required super.cached,
  });

  factory DigestResultModel.fromJson(Map<String, dynamic> json) {
    return DigestResultModel(
      cacheKey: json['cacheKey'] as String,
      targetWords: json['targetWords'] as int,
      content: json['content'] as String,
      cached: json['cached'] as bool? ?? false,
    );
  }
}
