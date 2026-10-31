import 'dart:async';

import 'package:ereader_mobile/features/books/domain/entities/chapter.dart';
import 'package:ereader_mobile/features/books/domain/entities/reading_length.dart';
import 'package:ereader_mobile/features/listen/domain/listen_choice.dart';
import 'package:ereader_mobile/features/listen/domain/listen_source.dart';
import 'package:ereader_mobile/features/listen/domain/speech.dart';
import 'package:ereader_mobile/features/listen/presentation/listen_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import '../books/fake_books_repository.dart';
import 'fake_listen_choice_store.dart';
import 'fake_speech.dart';

const source = ListenSource(
  book: loeb,
  chapter: chapterOne,
  option: LengthOption(ReadingLength.original, 8),
  next: chapterSix,
);

void main() {
  const blocks = [
    TextBlock(TextBlockKind.paragraph, 'Một. Hai. Ba. Bốn.'),
    TextBlock(TextBlockKind.paragraph, 'Năm.'),
  ];

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 1));

  String playingText(ListenBloc bloc) => switch (bloc.state.stage) {
    ListenPlaying(:final sentence) => sentence.text,
    final other => other.runtimeType.toString(),
  };

  test('reads sentences in order, ahead of time, and ends', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
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
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
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
      ..add(const ListenRequested(blocks, source: source));
    await settle();
    bloc.add(const ListenDownloadConfirmed());
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
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
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
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
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
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
    await settle();

    bloc.add(const ListenVoiceChosen(DeviceVoice.ducTri));
    await settle();

    expect(playingText(bloc), 'Một.');
    expect(speech.synthesized, contains(('Một.', DeviceVoice.ducTri)));
    await bloc.close();
  });

  test('a cloud voice reads without the device model', () async {
    const cloud = CloudVoice('vieneu-clone', 'Hạt Dẻ');
    final speech = FakeSpeech(ready: false);
    final bloc = ListenBloc(speech)
      ..add(const ListenVoiceChosen(cloud))
      ..add(const ListenRequested(blocks, source: source));
    await settle();

    expect(playingText(bloc), 'Một.');
    expect(speech.synthesized.first, ('Một.', cloud));
    await bloc.close();
  });

  group('a cloud voice', () {
    const cloud = CloudVoice('code', 'Giọng');
    // 150 characters read for about 10 seconds.
    final long = List.filled(30, ' ').indexed.map((e) {
      return 'Câu ${e.$1.toString().padLeft(2, '0')} ${'chữ ' * 36}'
          .trimRight();
    }).toList();
    final chapter = [
      for (final sentence in long)
        TextBlock(TextBlockKind.paragraph, '$sentence.'),
    ];

    Future<ListenBloc> listen(FakeSpeech speech) async {
      final bloc = ListenBloc(speech)
        ..add(const ListenVoiceChosen(cloud))
        ..add(ListenRequested(chapter, source: source));
      await settle();
      return bloc;
    }

    test('keeps a minute of audio ready, not the whole chapter', () async {
      final speech = FakeSpeech(ready: false);
      final bloc = await listen(speech);
      await settle();
      await settle();

      expect(speech.synthesized.length, inInclusiveRange(7, 9));
      await bloc.close();
    });

    test('keeps the minute full as sentences are read', () async {
      final speech = FakeSpeech(ready: false);
      final bloc = await listen(speech);
      await settle();
      final before = speech.synthesized.length;

      speech.finishSentence();
      await settle();
      await settle();

      expect(speech.synthesized.length, before + 1);
      await bloc.close();
    });

    test('fetches a few sentences at once, never all of them', () async {
      final gate = Completer<void>();
      final speech = FakeSpeech(ready: false)..synthesisGate = gate;
      final bloc = await listen(speech);
      await settle();

      expect(speech.mostAtOnce, 4);

      gate.complete();
      await settle();
      await settle();
      await settle();

      expect(speech.mostAtOnce, 4);
      expect(playingText(bloc), startsWith('Câu 00'));
      await bloc.close();
    });

    test('a faster rate reads further ahead', () async {
      final speech = FakeSpeech(ready: false);
      final bloc = await listen(speech);
      await settle();
      final atNormal = speech.synthesized.length;

      bloc.add(const ListenRateCycled());
      bloc.add(const ListenRateCycled());
      await settle();
      speech.finishSentence();
      await settle();
      await settle();

      expect(speech.synthesized.length, greaterThan(atNormal + 1));
      await bloc.close();
    });

    test('a sentence that failed ahead of time is asked for again', () async {
      final speech = FakeSpeech(ready: false)..failOnce.add(chapter[1].text);
      final bloc = await listen(speech);
      await settle();

      speech.finishSentence();
      await settle();
      await settle();

      expect(playingText(bloc), startsWith('Câu 01'));
      await bloc.close();
    });
  });

  group('starting a cloud voice', () {
    const hatDe = CloudVoice('hat-de', 'Hạt Dẻ');
    const vieNeu = CloudVoice('vieneu', 'VieNeu');
    final seven = [
      for (final word in ['Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy'])
        TextBlock(TextBlockKind.paragraph, '$word.'),
    ];

    Future<ListenBloc> listen(
      FakeSpeech speech,
      List<TextBlock> chapter,
    ) async {
      final bloc = ListenBloc(speech)
        ..add(const ListenVoiceChosen(vieNeu))
        ..add(ListenRequested(chapter, source: source));
      await settle();
      return bloc;
    }

    test('waits for five sentences, then plays the first', () async {
      final slow = Completer<void>();
      final speech = FakeSpeech(ready: false, slowText: {'Năm.': slow});
      final bloc = await listen(speech, seven);
      await settle();

      expect(speech.played, isEmpty);
      final stage = bloc.state.stage;
      expect(stage, isA<ListenPreparing>());
      expect((stage as ListenPreparing).ready, 4);
      expect(stage.needed, 5);

      slow.complete();
      await settle();
      await settle();

      expect(playingText(bloc), 'Một.');
      await bloc.close();
    });

    test('says the reader is waking when the first sentence is slow', () async {
      final first = Completer<void>();
      final speech = FakeSpeech(ready: false, slowText: {'Một.': first});
      final bloc =
          ListenBloc(speech, slowStart: const Duration(milliseconds: 5))
            ..add(const ListenVoiceChosen(vieNeu))
            ..add(ListenRequested(seven, source: source));
      await settle();
      expect((bloc.state.stage as ListenPreparing).slow, isFalse);

      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect((bloc.state.stage as ListenPreparing).slow, isTrue);

      first.complete();
      await settle();
      await settle();
      expect(playingText(bloc), 'Một.');
      await bloc.close();
    });

    test('a short chapter waits only for what it has', () async {
      final bloc = await listen(FakeSpeech(ready: false), blocks.sublist(1));
      await settle();
      expect(playingText(bloc), 'Năm.');
      await bloc.close();
    });

    test('running dry waits for five again, not one', () async {
      final speech = FakeSpeech(ready: false);
      final bloc = await listen(speech, seven);
      await settle();
      await settle();
      expect(playingText(bloc), 'Một.');

      bloc.add(const ListenVoiceChosen(hatDe));
      await settle();
      await settle();
      await settle();
      expect(playingText(bloc), 'Một.');
      await bloc.close();
    });

    test('plays what is ready when a later sentence fails', () async {
      final speech = FakeSpeech(ready: false)..failOnce.add('Ba.');
      final bloc = await listen(speech, seven);
      await settle();
      await settle();

      expect(playingText(bloc), 'Một.');
      await bloc.close();
    });

    test('reports at once when the first sentence fails', () async {
      final speech = FakeSpeech(
        ready: false,
        synthesisError: const SpeechException('VBEE_LIMIT'),
      );
      final bloc = await listen(speech, seven);
      await settle();

      expect(bloc.state.stage, isA<ListenFailed>());
      await bloc.close();
    });

    test('a device voice needing its download asks first', () async {
      final speech = FakeSpeech(ready: false);
      final bloc = await listen(speech, seven);
      await settle();
      await settle();

      bloc.add(const ListenVoiceChosen(DeviceVoice.maiAnh));
      await settle();
      await settle();

      expect(bloc.state.stage, isA<ListenNeedsVoice>());
      await bloc.close();
    });

    test('choosing the same voice after a failure resumes there', () async {
      final speech = FakeSpeech(ready: false);
      final bloc = await listen(speech, seven);
      await settle();
      speech.finishSentence();
      await settle();
      expect(playingText(bloc), 'Hai.');

      speech.failOnce.add('Bảy.');
      bloc.add(const ListenVoiceChosen(vieNeu));
      await settle();
      await settle();
      expect(playingText(bloc), 'Hai.');
      await bloc.close();
    });

    test('a voice can be changed during the wait', () async {
      final gate = Completer<void>();
      final speech = FakeSpeech(ready: false)..synthesisGate = gate;
      final bloc = await listen(speech, seven);
      await settle();

      bloc.add(const ListenVoiceChosen(hatDe));
      await settle();
      gate.complete();
      await settle();
      await settle();
      await settle();

      expect(speech.synthesized.last.$2, hatDe);
      expect(playingText(bloc), 'Một.');
      await bloc.close();
    });
  });

  group('remembering the voice', () {
    const hatDe = CloudVoice('hat-de', 'Hạt Dẻ');
    const vieNeu = CloudVoice('vieneu', 'VieNeu');

    Future<ListenBloc> listen(
      FakeSpeech speech,
      FakeListenChoiceStore store,
    ) async {
      final bloc = ListenBloc(speech, choices: store)
        ..add(const ListenRequested(blocks, source: source));
      await settle();
      await settle();
      await settle();
      return bloc;
    }

    test('starts on the first voice offered when nothing was chosen', () async {
      final bloc = await listen(
        FakeSpeech(ready: false, cloud: const [vieNeu, hatDe]),
        FakeListenChoiceStore(),
      );
      expect(bloc.state.voice, vieNeu);
      await bloc.close();
    });

    test('goes back to the last voice and rate', () async {
      final speech = FakeSpeech(cloud: const [vieNeu, hatDe]);
      final store = FakeListenChoiceStore(
        const ListenChoice(voice: DeviceVoice.maiAnh, rate: 1.5),
      );
      final bloc = await listen(speech, store);
      expect(bloc.state.voice, DeviceVoice.maiAnh);
      expect(bloc.state.rate, 1.5);
      expect(speech.rates.last, 1.5);
      await bloc.close();
    });

    test('a saved voice no longer offered gives way to the first', () async {
      final bloc = await listen(
        FakeSpeech(cloud: const [vieNeu]),
        FakeListenChoiceStore(const ListenChoice(voice: hatDe, rate: 1)),
      );
      expect(bloc.state.voice, vieNeu);
      await bloc.close();
    });

    test('a saved Vbee voice gives way to the first voice offered', () async {
      final bloc = await listen(
        FakeSpeech(cloud: const [vieNeu]),
        FakeListenChoiceStore(
          const ListenChoice(
            voice: CloudVoice(
              'hn_female_ngochuyen_full_48k-fhg',
              'HN - Ngọc Huyền',
            ),
            rate: 1,
          ),
        ),
      );
      expect(bloc.state.voice, vieNeu);
      await bloc.close();
    });

    test('a saved cloud voice stays when the list cannot be reached', () async {
      final bloc = await listen(
        FakeSpeech(),
        FakeListenChoiceStore(const ListenChoice(voice: hatDe, rate: 1)),
      );
      expect(bloc.state.voice, hatDe);
      await bloc.close();
    });

    test('without any cloud voice, the device voice reads', () async {
      final bloc = await listen(FakeSpeech(), FakeListenChoiceStore());
      expect(bloc.state.voice, defaultDeviceVoice);
      await bloc.close();
    });

    test('saves the voice and the rate when they change', () async {
      final store = FakeListenChoiceStore();
      final bloc = ListenBloc(FakeSpeech(), choices: store)
        ..add(const ListenVoiceChosen(hatDe))
        ..add(const ListenRateCycled());
      await settle();
      await settle();
      expect(store.saved?.voice, hatDe);
      expect(store.saved?.rate, 1.25);
      await bloc.close();
    });
  });

  test('a device voice still prepares two sentences, one at a time', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
    await settle();

    expect(speech.synthesized, hasLength(3));
    expect(speech.mostAtOnce, 1);
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
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
    await settle();

    await bloc.close();

    expect(speech.stops, greaterThan(0));
  });

  test('a failed sentence releases the player too', () async {
    final speech = FakeSpeech(
      synthesisError: const SpeechException('VOICE_FAILED'),
    );
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
    await settle();

    expect(bloc.state.stage, isA<ListenFailed>());
    expect(speech.stops, greaterThan(0));
    await bloc.close();
  });

  test('starts from the chosen sentence', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(
      speech,
    )..add(const ListenRequested(blocks, source: source, block: 0, offset: 11));
    await settle();

    expect(playingText(bloc), 'Ba.');
    await bloc.close();
  });

  test('choosing a sentence while reading jumps there', () async {
    final speech = FakeSpeech();
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source));
    await settle();

    bloc.add(const ListenRequested(blocks, source: source, block: 1));
    await settle();

    expect(playingText(bloc), 'Năm.');
    expect(speech.stops, greaterThan(0));
    await bloc.close();
  });

  test('the chosen sentence survives the first download', () async {
    final speech = FakeSpeech(ready: false);
    final bloc = ListenBloc(speech)
      ..add(const ListenRequested(blocks, source: source, block: 1));
    await settle();

    bloc.add(const ListenDownloadConfirmed());
    await settle();

    expect(playingText(bloc), 'Năm.');
    await bloc.close();
  });
}
