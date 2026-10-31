import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';

import '../domain/speech.dart';

const _repository =
    'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano/resolve/aba295eb96a6fa6003ebe417cc1f2802a7adc1dc';
const _kokoroModel = 'kokoro_vi.onnx';

/// One graph of the voice model, pinned by its size and checksum.
class ModelFile {
  const ModelFile(this.name, this.bytes, this.sha256);

  final String name;
  final int bytes;
  final String sha256;
}

const nanoModelFiles = [
  ModelFile(
    'text_encoder.onnx',
    26519943,
    '204f02cccae1f16ccb2d3840f05721a37fe250b82cbd456337a0ccb49615e4bf',
  ),
  ModelFile(
    'duration_predictor.onnx',
    727809,
    '20fd7fa60006d0a48ee82e0451b3f920d2052588c083c756cce669f3947c0a68',
  ),
  ModelFile(
    'vector_estimator.onnx',
    155132418,
    'c6c1d4398ca35d3ad1bd3f0459413d1b975d09e7f2f3a2b4493a7b92bbf6ce93',
  ),
  ModelFile(
    'codec_decoder.onnx',
    99319941,
    'b0ab15e7828a39d53679e25b1ba4ba415a61311307202a6323130b9e1cc3029d',
  ),
];

/// The voice model's files on the device. Each is checked and moved into place
/// on its own, so a dropped download resumes at the file and byte it reached.
class NanoModel {
  NanoModel({
    required Future<Directory> Function() directory,
    Dio? dio,
    this.files = nanoModelFiles,
    this.repository = _repository,
  }) : _directory = directory,
       _dio = dio ?? Dio();

  final Future<Directory> Function() _directory;
  final Dio _dio;
  final List<ModelFile> files;
  final String repository;
  CancelToken? _download;

  Future<String> path(ModelFile file) async {
    final directory = await _directory();
    return '${directory.path}/nano/${file.name}';
  }

  /// Whether every file is in place. The old Kokoro model goes once this is true.
  Future<bool> ready() async {
    for (final file in files) {
      if (!await File(await path(file)).exists()) return false;
    }
    await _removeKokoro();
    return true;
  }

  Future<void> _removeKokoro() async {
    final directory = await _directory();
    for (final name in [_kokoroModel, '$_kokoroModel.part']) {
      final old = File('${directory.path}/$name');
      if (await old.exists()) await old.delete();
    }
  }

  /// Resumes the download. [onProgress] goes from 0 to 1 over all the files.
  Future<void> download({
    required void Function(double progress) onProgress,
  }) async {
    final total = files.fold(0, (sum, file) => sum + file.bytes);
    final cancel = _download = CancelToken();
    var finished = 0;
    try {
      for (final file in files) {
        final target = File(await path(file));
        if (!await target.exists()) {
          await target.parent.create(recursive: true);
          await _fetch(file, target, cancel, (received) {
            onProgress((finished + received) / total);
          });
        }
        finished += file.bytes;
        onProgress(finished / total);
      }
      await _removeKokoro();
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) return;
      throw const SpeechException('VOICE_DOWNLOAD_FAILED');
    } on IOException {
      throw const SpeechException('VOICE_DOWNLOAD_FAILED');
    }
  }

  void cancelDownload() => _download?.cancel();

  Future<void> _fetch(
    ModelFile file,
    File target,
    CancelToken cancel,
    void Function(int received) onReceived,
  ) async {
    final part = File('${target.path}.part');
    final done = await part.exists() ? await part.length() : 0;
    if (done < file.bytes) await _receive(file, part, done, cancel, onReceived);
    final checksum = await sha256.bind(part.openRead()).first;
    if (checksum.toString() != file.sha256) {
      await part.delete();
      throw const SpeechException('VOICE_DOWNLOAD_CORRUPT');
    }
    await part.rename(target.path);
  }

  Future<void> _receive(
    ModelFile file,
    File part,
    int done,
    CancelToken cancel,
    void Function(int received) onReceived,
  ) async {
    final response = await _dio.get<ResponseBody>(
      '$repository/${file.name}',
      cancelToken: cancel,
      options: Options(
        responseType: ResponseType.stream,
        headers: {'range': 'bytes=$done-'},
      ),
    );
    // A server that ignores the range sends the file from the start.
    final resumed = response.statusCode == HttpStatus.partialContent;
    final sink = part.openWrite(
      mode: resumed ? FileMode.append : FileMode.write,
    );
    var received = resumed ? done : 0;
    try {
      await for (final chunk in response.data!.stream) {
        sink.add(chunk);
        received += chunk.length;
        onReceived(received);
      }
    } finally {
      await sink.close();
    }
  }
}
