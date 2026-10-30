import 'dart:async';
import 'dart:typed_data';

import 'package:ereader_mobile/features/listen/domain/speech.dart';

/// Records what was spoken. Each [play] waits for [finishSentence].
class FakeSpeech implements Speech {
  FakeSpeech({this.ready = true, this.downloadError});

  bool ready;
  final SpeechException? downloadError;
  final synthesized = <(String, Voice)>[];
  final played = <int>[];
  final rates = <double>[];
  var paused = false;
  var stops = 0;
  Completer<void>? _playing;

  void finishSentence() => _playing?.complete();

  @override
  Future<bool> modelReady() async => ready;

  @override
  Future<void> downloadModel({
    required void Function(double progress) onProgress,
  }) async {
    onProgress(0.5);
    final error = downloadError;
    if (error != null) throw error;
    ready = true;
  }

  @override
  void cancelDownload() {}

  @override
  Future<Float32List> synthesize(String text, Voice voice) async {
    synthesized.add((text, voice));
    return Float32List.fromList([synthesized.length.toDouble()]);
  }

  @override
  Future<void> play(Float32List samples) {
    played.add(samples.first.toInt());
    return (_playing = Completer<void>()).future;
  }

  @override
  Future<void> pause() async => paused = true;

  @override
  Future<void> resume() async => paused = false;

  @override
  Future<void> stop() async {
    stops++;
    final playing = _playing;
    if (playing != null && !playing.isCompleted) playing.complete();
  }

  @override
  Future<void> setRate(double rate) async => rates.add(rate);
}
