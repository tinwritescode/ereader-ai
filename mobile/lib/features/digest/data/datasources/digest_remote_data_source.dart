import '../../domain/entities/digest_request.dart';

abstract interface class DigestRemoteDataSource {
  Stream<String> stream(DigestRequest request);

  Future<Map<String, dynamic>> get(String digestId);
}

class InMemoryDigestRemoteDataSource implements DigestRemoteDataSource {
  @override
  Stream<String> stream(DigestRequest request) async* {
    yield 'event: chunk\ndata: {"text":"Digest for ${request.chapterId}"}\n\n';
    yield 'event: complete\ndata: {"digestId":"${request.chapterId}"}\n\n';
  }

  @override
  Future<Map<String, dynamic>> get(String digestId) async {
    return {
      'cacheKey': 'local:$digestId',
      'targetWords': 2000,
      'content': 'Cached digest',
      'cached': true,
    };
  }
}
