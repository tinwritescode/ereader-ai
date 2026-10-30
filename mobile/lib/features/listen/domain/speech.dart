import 'dart:typed_data';

/// Voices shipped with the app, as `assets/speech/voices/<id>.bin`.
enum Voice {
  diemTrinh('diem_trinh', 'Diễm Trinh'),
  maiLinh('mai_linh', 'Mai Linh'),
  maiLoan('mai_loan', 'Mai Loan'),
  myYen('my_yen', 'Mỹ Yến'),
  ngocHuyen('ngoc_huyen', 'Ngọc Huyền'),
  thucTrinh('thuc_trinh', 'Thục Trinh'),
  ducAn('duc_an', 'Đức An'),
  ducDuy('duc_duy', 'Đức Duy'),
  hungThinh('hung_thinh', 'Hưng Thịnh'),
  manhDung('manh_dung', 'Mạnh Dũng'),
  phatTai('phat_tai', 'Phát Tài'),
  thanhDat('thanh_dat', 'Thành Đạt'),
  tuanNgoc('tuan_ngoc', 'Tuấn Ngọc'),
  storyvert('storyvert', 'Storyvert');

  const Voice(this.id, this.label);

  final String id;
  final String label;
}

class SpeechException implements Exception {
  const SpeechException(this.code);

  final String code;

  @override
  String toString() => 'SpeechException($code)';
}

/// Reads text aloud on the device. Throws [SpeechException].
abstract interface class Speech {
  Future<bool> modelReady();

  /// Resumes a partial download. [onProgress] goes from 0 to 1.
  Future<void> downloadModel({
    required void Function(double progress) onProgress,
  });

  void cancelDownload();

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
