import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../domain/speech.dart';
import '../domain/wav.dart';

/// Cloud voices through the backend, which holds the voice service's key.
class CloudVoices {
  CloudVoices(this._dio);

  final Dio _dio;

  /// Empty when the backend offers none or cannot be reached: device voices still work.
  Future<List<CloudVoice>> list() async {
    try {
      final response = await _dio.get<Object?>('/speech/voices');
      return switch (response.data) {
        {'voices': final List<Object?> voices} => [
          for (final voice in voices)
            if (voice case {
              'code': final String code,
              'name': final String name,
            })
              CloudVoice(code, name),
        ],
        _ => const [],
      };
    } on DioException {
      return const [];
    }
  }

  Future<Float32List> speak(String text, CloudVoice voice) async {
    try {
      final response = await _dio.post<List<int>>(
        '/speech',
        data: {'text': text, 'voiceCode': voice.code},
        options: Options(responseType: ResponseType.bytes),
      );
      final bytes = response.data;
      if (bytes == null) throw const SpeechException('CLOUD_VOICE_FAILED');
      return wavSamples(Uint8List.fromList(bytes));
    } on DioException catch (error) {
      // The body is bytes here, so the status tells the plan's limit apart.
      throw SpeechException(
        error.response?.statusCode == 429 ? 'VBEE_LIMIT' : 'CLOUD_VOICE_FAILED',
      );
    }
  }
}
