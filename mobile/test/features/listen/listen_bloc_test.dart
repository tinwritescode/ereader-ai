import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:ereader_mobile/features/listen/presentation/listen_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_speech.dart';

void main() {
  const blocks = [
    TextBlock(TextBlockKind.paragraph, 'Một. Hai. Ba. Bốn.'),
    TextBlock(TextBlockKind.paragraph, 'Năm.'),
  ];

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  String playingText(ListenBloc bloc) => switch (bloc.state.stage) {
    ListenPlaying(:final sentence) => sentence.text,
    final other => other.runtimeType.toString(),
  };

  test('reads sentences in order, ahead of time, and ends', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();

    expect(playingText(bloc), 'Một.');
    expect(speech.synthesized.map((s) => s.$1), ['Một.', 'Hai.', 'Ba.']);

    for (var i = 0; i < 5; i++) {
      speech.finishSentence();
      await settle();
    }

    expect(bloc.state.stage, isA<ListenOff>());
    expect(speech.played, [1, 2, 3, 4, 5]);
    // Stopping releases what keeps the app running behind a locked screen.
    expect(speech.stops, greaterThan(0));
    await bloc.close();
  });

  test('asks before downloading the voice, then starts by itself', () async {
    final speech = FakeSpeech(ready: false);
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();
    expect(bloc.state.stage, isA<ListenNeedsVoice>());
    expect(speech.synthesized, isEmpty);

    bloc.add(const ListenDownloadConfirmed());
    await settle();

    expect(playingText(bloc), 'Một.');
    await bloc.close();
  });

  test('reports a failed download', () async {
    final speech = FakeSpeech(
      ready: false,
      downloadError: const SpeechException('VOICE_DOWNLOAD_FAILED'),
    );
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks))
      ..add(const ListenDownloadConfirmed());
    await settle();

    expect(
      bloc.state.stage,
      isA<ListenFailed>().having(
        (f) => f.code,
        'code',
        'VOICE_DOWNLOAD_FAILED',
      ),
    );
    await bloc.close();
  });

  test('pausing holds the next sentence until resumed', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();

    bloc.add(const ListenPauseToggled());
    await settle();
    expect(speech.paused, isTrue);
    speech.finishSentence();
    await settle();
    expect(speech.played, [1]);

    bloc.add(const ListenPauseToggled());
    await settle();
    expect(speech.paused, isFalse);
    expect(speech.played, [1, 2]);
    await bloc.close();
  });

  test('skipping moves by sentences and stays inside the chapter', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();

    bloc.add(const ListenSkipped(2));
    await settle();
    expect(playingText(bloc), 'Ba.');

    bloc.add(const ListenSkipped(-9));
    await settle();
    expect(playingText(bloc), 'Một.');
    await bloc.close();
  });

  test('a new voice restarts the sentence with that voice', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();

    bloc.add(const ListenVoiceChosen(DeviceVoice.ducAn));
    await settle();

    expect(playingText(bloc), 'Một.');
    expect(speech.synthesized, contains(('Một.', DeviceVoice.ducAn)));
    await bloc.close();
  });

  test('a Vbee voice reads without the device model', () async {
    const vbee = CloudVoice(
      'hn_female_ngochuyen_full_48k-fhg',
      'HN - Ngọc Huyền',
    );
    final speech = FakeSpeech(ready: false);
    final bloc = ListenBloc(speech)
      ..add(const ListenVoiceChosen(vbee))
      ..add(const ListenRequested(blocks));
    await settle();

    expect(playingText(bloc), 'Một.');
    expect(speech.synthesized.first, ('Một.', vbee));
    await bloc.close();
  });

  test('cycles the playback rate', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)..add(const ListenRateCycled());
    await settle();

    expect(bloc.state.rate, 1.25);
    expect(speech.rates, [1.25]);
    await bloc.close();
  });

  test('closing silences the player', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();

    await bloc.close();

    expect(speech.stops, greaterThan(0));
  });

  test('a failed sentence releases the player too', () async {
    final speech = FakeSpeech(
      synthesisError: const SpeechException('VOICE_FAILED'),
    );
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();

    expect(bloc.state.stage, isA<ListenFailed>());
    expect(speech.stops, greaterThan(0));
    await bloc.close();
  });

  test('starts from the chosen sentence', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, block: 0, offset: 11));
    await settle();

    expect(playingText(bloc), 'Ba.');
    await bloc.close();
  });

  test('choosing a sentence while reading jumps there', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)..add(const ListenRequested(blocks));
    await settle();

    bloc.add(const ListenRequested(blocks, block: 1));
    await settle();

    expect(playingText(bloc), 'Năm.');
    expect(speech.stops, greaterThan(0));
    await bloc.close();
  });

  test('the chosen sentence survives the first download', () async {
    final speech = FakeSpeech(ready: false);
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, block: 1));
    await settle();

    bloc.add(const ListenDownloadConfirmed());
    await settle();

    expect(playingText(bloc), 'Năm.');
    await bloc.close();
  });
}
