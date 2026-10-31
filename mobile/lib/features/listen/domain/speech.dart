import 'dart:typed_data';

/// A voice to read with: one on the device, or one from our voice service over the network.
sealed class Voice {
  String get label;
}

/// Voices shipped with the app, as `assets/speech/voices/<id>.bin`.
enum DeviceVoice implements Voice {
  minhQuan('minh_quan', 'Minh Quân'),
  manhDung('manh_dung', 'Mạnh Dũng'),
  anhKhoi('anh_khoi', 'Anh Khôi'),
  ducTri('duc_tri', 'Đức Trí'),
  huuQuan('huu_quan', 'Hữu Quân'),
  adam('adam', 'Adam'),
  myDuyen('my_duyen', 'Mỹ Duyên'),
  maiAnh('mai_anh', 'Mai Anh'),
  xuanTien('xuan_tien', 'Xuân Tiên'),
  trucLy('truc_ly', 'Trúc Ly'),
  aiHan('ai_han', 'Ái Hân');

  const DeviceVoice(this.id, this.label);

  final String id;
  @override
  final String label;
}

/// The device voice to read with when none was chosen.
const defaultDeviceVoice = DeviceVoice.minhQuan;

/// A cloud voice, rendered by our voice service through the backend.
final class CloudVoice implements Voice {
  const CloudVoice(this.code, this.label);

  final String code;
  @override
  final String label;

  @override
  bool operator ==(Object other) => other is CloudVoice && other.code == code;

  @override
  int get hashCode => code.hashCode;
}

class SpeechException implements Exception {
  const SpeechException(this.code);

  final String code;

  @override
  String toString() => 'SpeechException($code)';
}

/// Reads text aloud. Throws [SpeechException].
abstract interface class Speech {
  /// Whether the device voices can read. Cloud voices never need the model.
  Future<bool> modelReady();

  /// Resumes a partial download. [onProgress] goes from 0 to 1.
  Future<void> downloadModel({
    required void Function(double progress) onProgress,
  });

  void cancelDownload();

  /// The cloud voices on offer; empty when the backend has none or is unreachable.
  Future<List<CloudVoice>> cloudVoices();

  Future<Float32List> synthesize(String text, Voice voice);

  /// Completes when the samples finish playing or [stop] is called.
  /// Audio stays held between calls until [pause] or [stop], so a locked phone
  /// does not suspend the app while the next sentence is being prepared.
  Future<void> play(Float32List samples);
  Future<void> pause();
  Future<void> resume();
  Future<void> stop();
  Future<void> setRate(double rate);
}
