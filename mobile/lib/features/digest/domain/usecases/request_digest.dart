import '../entities/digest_request.dart';
import '../repositories/digest_repository.dart';

class RequestDigest {
  const RequestDigest(this._repository);

  final DigestRepository _repository;

  Stream<String> call(DigestRequest request) => _repository.stream(request);
}
