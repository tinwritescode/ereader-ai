import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:ereader_mobile/features/listen/data/nano_model.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:flutter_test/flutter_test.dart';

/// Serves [files] by name, honouring a range header unless told not to.
class _Server implements HttpClientAdapter {
  _Server(this.files);

  final Map<String, List<int>> files;
  final requests = <String>[];
  var honoursRange = true;
  String? droppedFile;
  int? dropAfter;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final name = options.path.split('/').last;
    final range = options.headers['range'] as String;
    requests.add('$name $range');
    final from = int.parse(range.substring(6, range.length - 1));
    final resumed = honoursRange && from > 0;
    final body = (files[name] ?? const []).sublist(resumed ? from : 0);
    final drop = name == droppedFile ? dropAfter : null;
    return ResponseBody(
      Stream.fromIterable([
        Uint8List.fromList(drop == null ? body : body.sublist(0, drop)),
      ]).asyncExpand((chunk) async* {
        yield chunk;
        if (drop != null) {
          droppedFile = null;
          throw DioException.connectionError(
            requestOptions: options,
            reason: 'dropped',
          );
        }
      }),
      resumed ? HttpStatus.partialContent : HttpStatus.ok,
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late Directory directory;
  final bodies = {
    'one.onnx': utf8.encode('first file'),
    'two.onnx': utf8.encode('the second file'),
  };
  ModelFile file(String name) => ModelFile(
    name,
    bodies[name]!.length,
    sha256.convert(bodies[name]!).toString(),
  );

  (NanoModel, _Server) modelFor(Map<String, List<int>> served) {
    final server = _Server(served);
    return (
      NanoModel(
        directory: () async => directory,
        dio: Dio()..httpClientAdapter = server,
        files: [file('one.onnx'), file('two.onnx')],
        repository: 'https://model.test',
      ),
      server,
    );
  }

  setUp(() => directory = Directory.systemTemp.createTempSync('nano-model'));
  tearDown(() => directory.deleteSync(recursive: true));

  test('downloads every file with one rising progress', () async {
    final (model, _) = modelFor(bodies);
    expect(await model.ready(), isFalse);

    final progress = <double>[];
    await model.download(onProgress: progress.add);

    expect(await model.ready(), isTrue);
    expect(progress, orderedEquals([...progress]..sort()));
    expect(progress.last, 1);
    expect(
      File('${directory.path}/nano/two.onnx').readAsStringSync(),
      'the second file',
    );
  });

  test(
    'picks up a dropped file at the byte it reached, keeping the rest',
    () async {
      final (model, server) = modelFor(bodies);
      server
        ..droppedFile = 'two.onnx'
        ..dropAfter = 4;
      await expectLater(
        model.download(onProgress: (_) {}),
        throwsA(isA<SpeechException>()),
      );
      expect(await model.ready(), isFalse);

      server.requests.clear();
      await model.download(onProgress: (_) {});

      expect(server.requests, ['two.onnx bytes=4-']);
      expect(await model.ready(), isTrue);
      expect(
        File('${directory.path}/nano/two.onnx').readAsStringSync(),
        'the second file',
      );
    },
  );

  test('starts a file over when the server ignores the range', () async {
    final (model, server) = modelFor(bodies);
    File('${directory.path}/nano/one.onnx.part')
      ..createSync(recursive: true)
      ..writeAsStringSync('xxxx');
    server.honoursRange = false;

    await model.download(onProgress: (_) {});

    expect(await model.ready(), isTrue);
  });

  test(
    'refuses a file that fails its checksum, and leaves no partial',
    () async {
      final (model, _) = modelFor({
        ...bodies,
        'two.onnx': utf8.encode('the secoND file'),
      });

      await expectLater(
        model.download(onProgress: (_) {}),
        throwsA(
          isA<SpeechException>().having(
            (error) => error.code,
            'code',
            'VOICE_DOWNLOAD_CORRUPT',
          ),
        ),
      );

      expect(await model.ready(), isFalse);
      expect(
        File('${directory.path}/nano/two.onnx.part').existsSync(),
        isFalse,
      );
    },
  );

  test('frees the old Kokoro model only once this one is ready', () async {
    final old = File('${directory.path}/kokoro_vi.onnx')
      ..writeAsStringSync('old');
    final (model, _) = modelFor(bodies);

    expect(await model.ready(), isFalse);
    expect(old.existsSync(), isTrue);

    await model.download(onProgress: (_) {});
    expect(old.existsSync(), isFalse);
  });

  test('frees the old model for an app that already has this one', () async {
    final (model, _) = modelFor(bodies);
    await model.download(onProgress: (_) {});
    final old = File('${directory.path}/kokoro_vi.onnx')
      ..writeAsStringSync('old');

    expect(await model.ready(), isTrue);
    expect(old.existsSync(), isFalse);
  });

  test('the pinned files add up to the size the app tells the reader', () {
    final total = nanoModelFiles.fold(0, (sum, file) => sum + file.bytes);
    expect(total, 281700111);
    expect((total / 1e6).round(), 282);
  });
}
