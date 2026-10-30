import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:audio_session/audio_session.dart';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_onnxruntime/flutter_onnxruntime.dart';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';

import '../domain/kokoro_input.dart';
import '../domain/phonemizer.dart';
import '../domain/speech.dart';
import '../domain/spoken_numbers.dart';
import '../domain/wav.dart';

const _modelUrl =
    'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/kokoro_vi.onnx';
const _modelBytes = 325731953;
const _modelSha256 =
    'da191277f58633649a9c0d2ae8012e80ef57ea8e2a56e30323c0f7df1ca29087';
const _speedNormal = 1.0;
const _heldSilenceSeconds = 5;

/// Kokoro Vietnamese through ONNX Runtime. Only [downloadModel] uses the network.
class KokoroSpeech implements Speech {
  KokoroSpeech({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;
  final _player = AudioPlayer();
  // iOS suspends a backgrounded app the moment its audio stops, which would
  // otherwise happen between two sentences. This loops silence under them.
  final _silence = AudioPlayer(handleInterruptions: false);
  final _voicePacks = <Voice, Float32List>{};
  CancelToken? _download;
  OrtSession? _session;
  Phonemizer? _phonemizer;
  Map<String, int>? _vocab;
  Completer<void>? _playing;
  int _clip = 0;

  Future<File> _modelFile() async {
    final directory = await getApplicationSupportDirectory();
    return File('${directory.path}/kokoro_vi.onnx');
  }

  @override
  Future<bool> modelReady() async => (await _modelFile()).exists();

  @override
  Future<void> downloadModel({
    required void Function(double progress) onProgress,
  }) async {
    final model = await _modelFile();
    final part = File('${model.path}.part');
    final done = await part.exists() ? await part.length() : 0;
    final cancel = _download = CancelToken();
    try {
      if (done < _modelBytes) {
        await _fetch(part, done, cancel, onProgress);
      }
      if (await _checksum(part) != _modelSha256) {
        await part.delete();
        throw const SpeechException('VOICE_DOWNLOAD_CORRUPT');
      }
      await part.rename(model.path);
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) return;
      throw const SpeechException('VOICE_DOWNLOAD_FAILED');
    } on IOException {
      throw const SpeechException('VOICE_DOWNLOAD_FAILED');
    }
  }

  Future<void> _fetch(
    File part,
    int done,
    CancelToken cancel,
    void Function(double progress) onProgress,
  ) async {
    final response = await _dio.get<ResponseBody>(
      _modelUrl,
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
        onProgress(received / _modelBytes);
      }
    } finally {
      await sink.close();
    }
  }

  Future<String> _checksum(File file) async =>
      (await sha256.bind(file.openRead()).first).toString();

  @override
  void cancelDownload() => _download?.cancel();

  Future<OrtSession> _loadSession() async =>
      _session ??= await OnnxRuntime().createSession((await _modelFile()).path);

  Future<Phonemizer> _loadPhonemizer() async {
    if (_phonemizer case final phonemizer?) return phonemizer;
    final table = await rootBundle.load('assets/speech/phonemes.tsv.gz');
    return _phonemizer = Phonemizer.fromGzippedTable(
      table.buffer.asUint8List(table.offsetInBytes, table.lengthInBytes),
    );
  }

  Future<Map<String, int>> _loadVocab() async {
    if (_vocab case final vocab?) return vocab;
    final raw = await rootBundle.loadString('assets/speech/vocab.json');
    final parsed = switch (jsonDecode(raw)) {
      final Map<String, dynamic> map => {
        for (final MapEntry(:key, :value) in map.entries)
          if (value is int) key: value,
      },
      _ => throw const SpeechException('VOICE_ASSETS_INVALID'),
    };
    return _vocab = parsed;
  }

  Future<Float32List> _loadVoice(Voice voice) async {
    if (_voicePacks[voice] case final pack?) return pack;
    final data = await rootBundle.load('assets/speech/voices/${voice.id}.bin');
    // Asset bytes may be unaligned for float32, so copy before viewing.
    final bytes = Uint8List.fromList(
      data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
    );
    return _voicePacks[voice] = bytes.buffer.asFloat32List();
  }

  @override
  Future<Float32List> synthesize(String text, Voice voice) async {
    final phonemizer = await _loadPhonemizer();
    final vocab = await _loadVocab();
    final pack = await _loadVoice(voice);
    final session = await _loadSession();

    final phonemes = phonemizer.phonemize(spellNumbers(text));
    final ids = encodePhonemes(phonemes, vocab);
    final style = styleFor(pack, phonemes.runes.length);
    final inputs = {
      'input_ids': await OrtValue.fromList(ids, [1, ids.length]),
      'ref_s': await OrtValue.fromList(style, [1, style.length]),
      'speed': await OrtValue.fromList(
        Float32List.fromList([_speedNormal]),
        const [],
      ),
    };
    try {
      final outputs = await session.run(inputs);
      final waveform = outputs['waveform'];
      if (waveform == null) throw const SpeechException('VOICE_FAILED');
      final samples = await waveform.asFlattenedList();
      for (final output in outputs.values) {
        await output.dispose();
      }
      return Float32List.fromList([
        for (final sample in samples)
          if (sample is num) sample.toDouble(),
      ]);
    } on PlatformException {
      throw const SpeechException('VOICE_FAILED');
    } finally {
      for (final input in inputs.values) {
        await input.dispose();
      }
    }
  }

  @override
  Future<void> play(Float32List samples) async {
    await _configureSession();
    await _holdAudio();
    final directory = await getTemporaryDirectory();
    // Two names in turn: the player may still hold the previous file open.
    final file = File('${directory.path}/speech-${_clip++ % 2}.wav');
    await file.writeAsBytes(pcm16Wav(samples), flush: true);
    final clip = _clip;
    await _player.setFilePath(file.path);
    // Stopped while the file was loading.
    if (clip != _clip) {
      await _silence.pause();
      return;
    }
    final playing = _playing = Completer<void>();
    // Subscribed after loading: the stream replays the last clip's `completed`.
    final finished = _player.processingStateStream.listen((state) {
      if (state == ProcessingState.completed && !playing.isCompleted) {
        playing.complete();
      }
    });
    unawaited(_player.play());
    await playing.future;
    await finished.cancel();
  }

  Future<void> _holdAudio() async {
    if (_silence.audioSource == null) {
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/silence.wav');
      final samples = Float32List(speechSampleRate * _heldSilenceSeconds);
      await file.writeAsBytes(pcm16Wav(samples), flush: true);
      await _silence.setFilePath(file.path);
      await _silence.setLoopMode(LoopMode.one);
    }
    if (!_silence.playing) unawaited(_silence.play());
  }

  bool _sessionConfigured = false;

  Future<void> _configureSession() async {
    if (_sessionConfigured) return;
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.speech());
    await session.setActive(true);
    _sessionConfigured = true;
  }

  @override
  Future<void> pause() async {
    await _player.pause();
    await _silence.pause();
  }

  @override
  Future<void> resume() async {
    await _holdAudio();
    unawaited(_player.play());
  }

  @override
  Future<void> stop() async {
    _clip++;
    await _player.stop();
    await _silence.pause();
    final playing = _playing;
    if (playing != null && !playing.isCompleted) playing.complete();
  }

  @override
  Future<void> setRate(double rate) => _player.setSpeed(rate);
}
