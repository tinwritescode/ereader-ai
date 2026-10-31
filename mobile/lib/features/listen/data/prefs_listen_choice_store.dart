import 'package:shared_preferences/shared_preferences.dart';

import '../domain/listen_choice.dart';
import '../domain/speech.dart';

const _device = 'listen.device';
const _cloudCode = 'listen.cloudCode';
const _cloudLabel = 'listen.cloudLabel';
const _rate = 'listen.rate';

class PrefsListenChoiceStore implements ListenChoiceStore {
  @override
  Future<ListenChoice?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_cloudCode);
    final label = prefs.getString(_cloudLabel);
    final voice = code != null && label != null
        ? CloudVoice(code, label)
        : DeviceVoice.values.asNameMap()[prefs.getString(_device)];
    if (voice == null) return null;
    return ListenChoice(voice: voice, rate: prefs.getDouble(_rate) ?? 1);
  }

  @override
  Future<void> save(ListenChoice choice) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_rate, choice.rate);
    switch (choice.voice) {
      case final DeviceVoice voice:
        await prefs.setString(_device, voice.name);
        await prefs.remove(_cloudCode);
        await prefs.remove(_cloudLabel);
      case final CloudVoice voice:
        await prefs.setString(_cloudCode, voice.code);
        await prefs.setString(_cloudLabel, voice.label);
        await prefs.remove(_device);
    }
  }
}
