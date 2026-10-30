import '../entities/digest_request.dart';
import '../entities/digest_result.dart';

abstract interface class DigestRepository {
  Stream<String> stream(DigestRequest request);

  Future<DigestResult> get(String digestId);
}
