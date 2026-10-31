import 'package:ereader_mobile/features/listen/data/prefs_listen_choice_store.dart';
import 'package:ereader_mobile/features/listen/domain/listen_choice.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('has nothing before the first choice', () async {
    expect(await PrefsListenChoiceStore().load(), isNull);
  });

  test('brings back a device voice', () async {
    final store = PrefsListenChoiceStore();
    await store.save(const ListenChoice(voice: DeviceVoice.maiAnh, rate: 1.25));
    final loaded = await store.load();
    expect(loaded?.voice, DeviceVoice.maiAnh);
    expect(loaded?.rate, 1.25);
  });

  test('brings back a cloud voice, replacing a device voice', () async {
    final store = PrefsListenChoiceStore();
    await store.save(const ListenChoice(voice: DeviceVoice.maiAnh, rate: 1));
    await store.save(
      const ListenChoice(voice: CloudVoice('vieneu', 'VieNeu'), rate: 1),
    );
    final voice = (await store.load())?.voice;
    expect(voice, const CloudVoice('vieneu', 'VieNeu'));
    expect(voice?.label, 'VieNeu');
  });

  test(
    'a saved Kokoro voice gives way to the default, keeping the rate',
    () async {
      SharedPreferences.setMockInitialValues({
        'listen.device': 'maiLinh',
        'listen.rate': 1.25,
      });
      final loaded = await PrefsListenChoiceStore().load();
      expect(loaded?.voice, defaultDeviceVoice);
      expect(loaded?.rate, 1.25);
    },
  );
}
