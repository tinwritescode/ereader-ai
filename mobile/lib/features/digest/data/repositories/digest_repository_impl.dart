import '../../domain/entities/digest_request.dart';
import '../../domain/entities/digest_result.dart';
import '../../domain/repositories/digest_repository.dart';
import '../datasources/digest_remote_data_source.dart';
import '../datasources/digest_sse_parser.dart';
import '../models/digest_result_model.dart';

class DigestRepositoryImpl implements DigestRepository {
  const DigestRepositoryImpl(this._remote);

  final DigestRemoteDataSource _remote;

  @override
  Stream<String> stream(DigestRequest request) =>
      _remote.stream(request).expand(parseDigestFrames);

  @override
  Future<DigestResult> get(String digestId) async {
    return DigestResultModel.fromJson(await _remote.get(digestId));
  }
}
