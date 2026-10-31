import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_onnxruntime/flutter_onnxruntime.dart';

import '../domain/nano_sampler.dart';
import '../domain/speech.dart';
import 'nano_model.dart';

const _latentChannels = 144;
const _intraOpThreads = 4;

/// The model's four graphs through ONNX Runtime, loaded one at a time so their
/// peak memory does not stack.
class OnnxNanoGraphs implements NanoGraphs {
  OnnxNanoGraphs._(this._text, this._duration, this._flow, this._decoder);

  static Future<OnnxNanoGraphs> load(NanoModel model) async {
    final options = OrtSessionOptions(
      intraOpNumThreads: _intraOpThreads,
      interOpNumThreads: 1,
    );
    Future<OrtSession> session(String name) async =>
        OnnxRuntime().createSession(
          await model.path(model.files.firstWhere((f) => f.name == name)),
          options: options,
        );
    return OnnxNanoGraphs._(
      await session('text_encoder.onnx'),
      await session('duration_predictor.onnx'),
      await session('vector_estimator.onnx'),
      await session('codec_decoder.onnx'),
    );
  }

  final OrtSession _text;
  final OrtSession _duration;
  final OrtSession _flow;
  final OrtSession _decoder;

  @override
  Future<NanoConditioning> condition(Int64List ids, NanoVoice voice) async {
    final length = ids.length;
    final idsValue = await OrtValue.fromList(ids, [1, length]);
    final style = await OrtValue.fromList(voice.style, const [1, 50, 256]);
    try {
      final outputs = await _text.run({'ids': idsValue, 'style': style});
      final context = outputs['ctx'];
      if (context == null) throw const SpeechException('VOICE_FAILED');
      return _OnnxConditioning(
        duration: _duration,
        flow: _flow,
        context: context,
        mask: await OrtValue.fromList(List.filled(length, true), [1, length]),
        speaker: await OrtValue.fromList(voice.speaker, const [1, 192]),
        style: await OrtValue.fromList(voice.style, const [1, 50, 256]),
      );
    } on PlatformException {
      throw const SpeechException('VOICE_FAILED');
    } finally {
      await idsValue.dispose();
      await style.dispose();
    }
  }

  @override
  Future<Float32List> decode(Float32List latent, int frames) async {
    final x = await OrtValue.fromList(latent, [1, _latentChannels, frames]);
    try {
      final outputs = await _decoder.run({'x': x});
      return await _floats(outputs, 'wav');
    } on PlatformException {
      throw const SpeechException('VOICE_FAILED');
    } finally {
      await x.dispose();
    }
  }
}

Future<Float32List> _floats(Map<String, OrtValue> outputs, String name) async {
  final value = outputs[name];
  if (value == null) throw const SpeechException('VOICE_FAILED');
  final list = await value.asFlattenedList();
  for (final output in outputs.values) {
    await output.dispose();
  }
  return Float32List.fromList([
    for (final item in list)
      if (item is num) item.toDouble(),
  ]);
}

class _OnnxConditioning implements NanoConditioning {
  _OnnxConditioning({
    required OrtSession duration,
    required OrtSession flow,
    required OrtValue context,
    required OrtValue mask,
    required OrtValue speaker,
    required OrtValue style,
  }) : _duration = duration,
       _flow = flow,
       _context = context,
       _mask = mask,
       _speaker = speaker,
       _style = style;

  final OrtSession _duration;
  final OrtSession _flow;
  final OrtValue _context;
  final OrtValue _mask;
  final OrtValue _speaker;
  final OrtValue _style;

  @override
  Future<double> logSeconds() async {
    try {
      final outputs = await _duration.run({
        'ctx': _context,
        'ctx_mask': _mask,
        'spk': _speaker,
      });
      return (await _floats(outputs, 'log_seconds')).first;
    } on PlatformException {
      throw const SpeechException('VOICE_FAILED');
    }
  }

  @override
  Future<Float32List> velocity(Float32List latent, int frames, double t) async {
    final x = await OrtValue.fromList(latent, [1, _latentChannels, frames]);
    final time = await OrtValue.fromList(Float32List.fromList([t]), const [1]);
    try {
      final outputs = await _flow.run({
        'x': x,
        't': time,
        'ctx': _context,
        'ctx_mask': _mask,
        'spk': _speaker,
        'style': _style,
      });
      return await _floats(outputs, 'v');
    } on PlatformException {
      throw const SpeechException('VOICE_FAILED');
    } finally {
      await x.dispose();
      await time.dispose();
    }
  }

  @override
  Future<void> dispose() async {
    for (final value in [_context, _mask, _speaker, _style]) {
      await value.dispose();
    }
  }
}
