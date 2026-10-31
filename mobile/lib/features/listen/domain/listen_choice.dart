import 'speech.dart';

/// What the listener last picked, kept on this device.
class ListenChoice {
  const ListenChoice({required this.voice, required this.rate});

  final Voice voice;
  final double rate;
}

abstract interface class ListenChoiceStore {
  Future<ListenChoice?> load();
  Future<void> save(ListenChoice choice);
}

/// The voice to open with. An empty [offered] may only mean no network, so a
/// saved cloud voice stays until the list says it is gone.
Voice openingVoice(Voice? saved, List<CloudVoice> offered) => switch (saved) {
  final DeviceVoice voice => voice,
  final CloudVoice voice when offered.isEmpty || offered.contains(voice) =>
    voice,
  _ => offered.isEmpty ? DeviceVoice.diemTrinh : offered.first,
};
