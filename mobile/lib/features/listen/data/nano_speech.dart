import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:audio_session/audio_session.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:path_provider/path_provider.dart';

import '../domain/nano_sampler.dart';
import '../domain/phonemizer.dart';
import '../domain/speech.dart';
import '../domain/wav.dart';
import 'cloud_voices.dart';
import 'nano_model.dart';
import 'onnx_nano_graphs.dart';

const _heldSilenceSeconds = 5;
const _maxChunkCharacters = 140;
const _chunkGapSeconds = 0.15;
const _quality = NanoQuality(steps: 8, sway: -1);

/// VieNeu-TTS v3 Nano through ONNX Runtime, plus cloud voices from [_cloud].
/// Device voices use the network only in [downloadModel].
class NanoSpeech implements Speech {
  NanoSpeech({required CloudVoices cloud, Dio? dio, this.quality = _quality})
    : _cloud = cloud,
      _model = NanoModel(directory: getApplicationSupportDirectory, dio: dio);

  final CloudVoices _cloud;
  final NanoModel _model;

  /// Replaced in the device benchmark.
  final NanoQuality quality;
  final _player = AudioPlayer();
  // iOS suspends a backgrounded app the moment its audio stops, which would
  // otherwise happen between two sentences. This loops silence under them.
  final _silence = AudioPlayer(handleInterruptions: false);
  final _voices = <DeviceVoice, NanoVoice>{};
  final _random = Random();
  Future<_Engine>? _engine;
  Phonemizer? _phonemizer;
  Map<String, int>? _vocab;
  Completer<void>? _playing;
  int _clip = 0;

  @override
  Future<bool> modelReady() => _model.ready();

  @override
  Future<void> downloadModel({
    required void Function(double progress) onProgress,
  }) => _model.download(onProgress: onProgress);

  @override
  void cancelDownload() => _model.cancelDownload();

  Future<_Engine> _loadEngine() => _engine ??= () async {
    final graphs = await OnnxNanoGraphs.load(_model);
    final blank = await _loadAsset('null');
    return _Engine(graphs, await graphs.condition(unconditionalIds, blank));
  }();

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

  Future<NanoVoice> _loadAsset(String id) async => NanoVoice.fromBytes(
    await rootBundle.load('assets/speech/voices/$id.bin'),
  );

  Future<NanoVoice> _loadVoice(DeviceVoice voice) async =>
      _voices[voice] ??= await _loadAsset(voice.id);

  @override
  Future<List<CloudVoice>> cloudVoices() => _cloud.list();

  @override
  Future<Float32List> synthesize(String text, Voice voice) => switch (voice) {
    DeviceVoice() => _synthesizeOnDevice(text, voice),
    CloudVoice() => _cloud.speak(text, voice),
  };

  Future<Float32List> _synthesizeOnDevice(
    String text,
    DeviceVoice voice,
  ) async {
    final phonemizer = await _loadPhonemizer();
    final vocab = await _loadVocab();
    final nano = await _loadVoice(voice);
    final engine = await _loadEngine();

    final parts = <Float32List>[];
    for (final chunk in speakableChunks(text, _maxChunkCharacters)) {
      final ids = encodePhonemes(phonemizer.phonemize(chunk), vocab);
      final conditioning = await engine.graphs.condition(ids, nano);
      try {
        parts.add(
          await sampleSpeech(
            graphs: engine.graphs,
            conditioning: conditioning,
            unconditional: engine.unconditional,
            quality: quality,
            noise: (length) => gaussianNoise(length, _random),
          ),
        );
      } finally {
        await conditioning.dispose();
      }
    }
    return _joined(parts);
  }

  Float32List _joined(List<Float32List> parts) {
    final gap = (speechSampleRate * _chunkGapSeconds).toInt();
    final length = parts.fold(0, (sum, part) => sum + part.length);
    final out = Float32List(length + gap * max(parts.length - 1, 0));
    var at = 0;
    for (final part in parts) {
      out.setAll(at, part);
      at += part.length + gap;
    }
    return out;
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

class _Engine {
  const _Engine(this.graphs, this.unconditional);

  final OnnxNanoGraphs graphs;
  final NanoConditioning unconditional;
}
