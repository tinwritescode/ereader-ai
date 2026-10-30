import 'package:flutter_test/flutter_test.dart';
import 'package:ereader_mobile/features/digest/data/datasources/digest_remote_data_source.dart';
import 'package:ereader_mobile/features/digest/data/repositories/digest_repository_impl.dart';
import 'package:ereader_mobile/features/digest/domain/entities/digest_request.dart';
import 'package:ereader_mobile/features/digest/domain/usecases/request_digest.dart';
import 'package:ereader_mobile/features/digest/presentation/bloc/digest_bloc.dart';

void main() {
  test('streams digest through the Bloc boundary', () async {
    final repository = DigestRepositoryImpl(InMemoryDigestRemoteDataSource());
    final bloc = DigestBloc(RequestDigest(repository));
    addTearDown(bloc.close);

    final states = <DigestState>[];
    final subscription = bloc.stream.listen(states.add);
    addTearDown(subscription.cancel);

    bloc.add(
      const DigestRequested(
        DigestRequest(
          chapterId: 'chapter-1',
          targetLang: 'vi',
          targetMinutes: 10,
        ),
      ),
    );
    await Future<void>.delayed(Duration.zero);

    expect(states.last, isA<DigestComplete>());
    expect((states.last as DigestComplete).text, 'Digest for chapter-1');
  });

  test('shows only chunk text from multi-field SSE frames', () async {
    final states = await _collectStates([
      ': heartbeat\n\n',
      'id: 1\nevent: chunk\ndata: {"digestId":"d","sectionIndex":0,"text":"Hello "}\n\n',
      'id: 2\nevent: chunk\ndata: {"digestId":"d","sectionIndex":1,"text":"world"}\n\n',
      'id: 3\nevent: complete\ndata: {"digestId":"d"}\n\n',
    ]);

    expect(states.last, isA<DigestComplete>());
    expect((states.last as DigestComplete).text, 'Hello world');
  });

  test('ends in failure when the stream sends an error event', () async {
    final states = await _collectStates([
      'event: chunk\ndata: {"text":"Hello"}\n\n',
      'event: error\ndata: {"message":"LLM unavailable"}\n\n',
    ]);

    expect(states.last, isA<DigestFailure>());
    expect((states.last as DigestFailure).message, contains('LLM unavailable'));
  });
}

Future<List<DigestState>> _collectStates(List<String> frames) async {
  final repository = DigestRepositoryImpl(_FakeDigestRemoteDataSource(frames));
  final bloc = DigestBloc(RequestDigest(repository));
  addTearDown(bloc.close);

  final states = <DigestState>[];
  final subscription = bloc.stream.listen(states.add);
  addTearDown(subscription.cancel);

  bloc.add(
    const DigestRequested(
      DigestRequest(
        chapterId: 'chapter-1',
        targetLang: 'vi',
        targetMinutes: 10,
      ),
    ),
  );
  await Future<void>.delayed(Duration.zero);
  return states;
}

class _FakeDigestRemoteDataSource implements DigestRemoteDataSource {
  const _FakeDigestRemoteDataSource(this._frames);

  final List<String> _frames;

  @override
  Stream<String> stream(DigestRequest request) => Stream.fromIterable(_frames);

  @override
  Future<Map<String, dynamic>> get(String digestId) =>
      throw UnimplementedError();
}
