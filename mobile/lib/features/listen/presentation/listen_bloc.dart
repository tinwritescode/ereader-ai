import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../books/domain/entities/chapter.dart';
import '../domain/listen_choice.dart';
import '../domain/listen_source.dart';
import '../domain/speech.dart';
import '../domain/speech_plan.dart';

const _rates = [1.0, 1.25, 1.5, 0.8];
// Sentences made ready ahead of the one playing, so playback does not wait for the model.
const _deviceReadAhead = 2;
// A cloud voice takes seconds per sentence, so a thin buffer runs dry: keep a minute of speech ready.
const _cloudReadAheadSeconds = 60.0;
// Enough to outrun playback; the rest wait for a free slot.
const _cloudRequests = 4;
// Sentences a cloud voice has ready before it speaks, at the start and whenever it runs dry.
const _cloudStartSentences = 5;
// A wait this long with nothing back means the voice service is starting from zero.
const _slowStart = Duration(seconds: 8);

sealed class ListenStage {
  const ListenStage();
}

final class ListenOff extends ListenStage {
  const ListenOff();
}

final class ListenNeedsVoice extends ListenStage {
  const ListenNeedsVoice();
}

final class ListenDownloading extends ListenStage {
  const ListenDownloading(this.progress);

  final double progress;
}

final class ListenPreparing extends ListenStage {
  const ListenPreparing({this.ready = 0, this.needed = 0, this.slow = false});

  /// Sentences ready of those wanted before speaking; [needed] is 0 when nothing is counted.
  final int ready;
  final int needed;

  /// Nothing has come back for a while: the voice's machine is starting.
  final bool slow;
}

final class ListenPlaying extends ListenStage {
  const ListenPlaying({
    required this.sentence,
    required this.index,
    required this.total,
    required this.paused,
  });

  final SpokenSentence sentence;
  final int index;
  final int total;
  final bool paused;
}

final class ListenFailed extends ListenStage {
  const ListenFailed(this.code);

  final String code;
}

class ListenState {
  const ListenState({
    this.stage = const ListenOff(),
    this.voice = DeviceVoice.diemTrinh,
    this.rate = 1,
    this.done = 0,
    this.source,
  });

  final ListenStage stage;
  final Voice voice;
  final double rate;

  /// Share of the chapter's sentences already read, from 0 to 1.
  final double done;

  /// What was last asked for. See [heard] for what is being read now.
  final ListenSource? source;

  /// What the voice is on, whichever page is showing; null when it is off.
  ListenSource? get heard => stage is ListenOff ? null : source;

  ListenState copyWith({
    ListenStage? stage,
    Voice? voice,
    double? rate,
    double? done,
    ListenSource? source,
  }) => ListenState(
    stage: stage ?? this.stage,
    voice: voice ?? this.voice,
    rate: rate ?? this.rate,
    done: done ?? this.done,
    source: source ?? this.source,
  );
}

sealed class ListenEvent {
  const ListenEvent();
}

final class ListenRequested extends ListenEvent {
  const ListenRequested(
    this.blocks, {
    required this.source,
    this.block = 0,
    this.offset = 0,
  });

  final List<TextBlock> blocks;
  final ListenSource source;

  /// Where to start: a block, and a character inside it.
  final int block;
  final int offset;
}

final class ListenDownloadConfirmed extends ListenEvent {
  const ListenDownloadConfirmed();
}

final class ListenPauseToggled extends ListenEvent {
  const ListenPauseToggled();
}

final class ListenSkipped extends ListenEvent {
  const ListenSkipped(this.sentences);

  final int sentences;
}

final class ListenRateCycled extends ListenEvent {
  const ListenRateCycled();
}

final class ListenVoiceChosen extends ListenEvent {
  const ListenVoiceChosen(this.voice);

  final Voice voice;
}

final class ListenStopped extends ListenEvent {
  const ListenStopped();
}

final class _SentenceReached extends ListenEvent {
  const _SentenceReached(this.index);

  final int index;
}

final class _Buffering extends ListenEvent {
  const _Buffering({
    required this.generation,
    required this.index,
    required this.ready,
    required this.needed,
    this.slow = false,
  });

  final int generation;
  final int index;
  final int ready;
  final int needed;
  final bool slow;
}

final class _RunFailed extends ListenEvent {
  const _RunFailed(this.code);

  final String code;
}

final class _RunEnded extends ListenEvent {
  const _RunEnded();
}

class ListenBloc extends Bloc<ListenEvent, ListenState> {
  ListenBloc(
    this._speech, {
    ListenChoiceStore? choices,
    Duration slowStart = _slowStart,
  }) : _choices = choices,
       _slowAfter = slowStart,
       super(const ListenState()) {
    on<ListenRequested>(_onRequested);
    on<ListenDownloadConfirmed>(_onDownloadConfirmed);
    on<ListenPauseToggled>(_onPauseToggled);
    on<ListenSkipped>(_onSkipped);
    on<ListenRateCycled>(_onRateCycled);
    on<ListenVoiceChosen>(_onVoiceChosen);
    on<ListenStopped>(_onStopped);
    on<_SentenceReached>(_onSentenceReached);
    on<_Buffering>(_onBuffering);
    on<_RunFailed>(_onRunFailed);
    on<_RunEnded>(
      (_, emit) => emit(state.copyWith(stage: const ListenOff(), done: 1)),
    );
  }

  final Speech _speech;
  final ListenChoiceStore? _choices;
  final Duration _slowAfter;
  // Set once the opening voice is decided, or the listener has picked one.
  var _voiceSettled = false;
  List<TextBlock> _blocks = const [];
  List<SpokenSentence> _plan = const [];
  var _audio = <int, Future<Float32List>>{};
  // Sentences in [_audio] whose audio has arrived.
  var _ready = <int>{};
  Future<void> _modelQueue = Future.value();
  // The sentence the voice is on while the cloud voice has more to fetch.
  int? _playhead;
  int _cloudRunning = 0;
  // Each run owns one generation; a newer one makes an older run stop by itself.
  int _generation = 0;
  int _current = 0;
  int _from = 0;
  bool _paused = false;
  Completer<void>? _unpaused;

  /// The sentences of the chapter being read, as the voice asks for them.
  List<String> get sentences => [for (final s in _plan) s.text];

  Future<void> _onRequested(
    ListenRequested event,
    Emitter<ListenState> emit,
  ) async {
    if (!identical(event.blocks, _blocks)) {
      _blocks = event.blocks;
      _plan = planSpeech(_blocks);
      _forgetAudio();
      _playhead = null;
    }
    if (_plan.isEmpty) return;
    _from = sentenceAt(_plan, event.block, event.offset);
    emit(state.copyWith(source: event.source));
    if (state.stage is ListenDownloading) return;
    if (!_voiceSettled) {
      emit(state.copyWith(stage: const ListenPreparing()));
      await _settleVoice(emit);
    }
    if (state.voice is CloudVoice || await _speech.modelReady()) {
      _generation++;
      await _speech.stop();
      _start(_from, emit);
    } else {
      emit(state.copyWith(stage: const ListenNeedsVoice()));
    }
  }

  Future<void> _onDownloadConfirmed(
    ListenDownloadConfirmed event,
    Emitter<ListenState> emit,
  ) async {
    emit(state.copyWith(stage: const ListenDownloading(0)));
    try {
      await _speech.downloadModel(
        onProgress: (progress) {
          if (!emit.isDone) {
            emit(state.copyWith(stage: ListenDownloading(progress)));
          }
        },
      );
    } on SpeechException catch (error) {
      emit(state.copyWith(stage: ListenFailed(error.code)));
      return;
    }
    if (await _speech.modelReady()) _start(_from, emit);
  }

  Future<void> _settleVoice(Emitter<ListenState> emit) async {
    _voiceSettled = true;
    final saved = await _choices?.load();
    final offered = await _speech.cloudVoices();
    emit(
      state.copyWith(
        voice: openingVoice(saved?.voice, offered),
        rate: saved?.rate,
      ),
    );
  }

  void _start(int index, Emitter<ListenState> emit) {
    _generation++;
    _current = index;
    _paused = false;
    _release();
    emit(state.copyWith(stage: const ListenPreparing()));
    unawaited(_run(_generation, index));
  }

  Future<void> _run(int generation, int from) async {
    try {
      // The player may still hold the rate from before this run.
      await _speech.setRate(state.rate);
      for (var index = from; index < _plan.length; index++) {
        final samples = _synthesized(index);
        _readAhead(index);
        if (state.voice is CloudVoice &&
            (index == from || !_ready.contains(index))) {
          await _buffer(generation, index);
        }
        final audio = await samples;
        if (_paused) await (_unpaused ??= Completer<void>()).future;
        if (generation != _generation) return;
        add(_SentenceReached(index));
        await _speech.play(audio);
        if (generation != _generation) return;
        _audio.remove(index);
        _ready.remove(index);
      }
      await _speech.stop();
      add(const _RunEnded());
    } on SpeechException catch (error) {
      if (generation != _generation) return;
      await _speech.stop();
      add(_RunFailed(error.code));
    }
  }

  /// Waits until the sentences from [index] are ready in a row. One failing
  /// past the first ends the wait: what came before it can still be heard.
  Future<void> _buffer(int generation, int index) async {
    final end = min(index + _cloudStartSentences, _plan.length);
    final needed = end - index;
    final wanted = [for (var i = index; i < end; i++) i];
    if (_ready.containsAll(wanted)) return;
    void report(int ready) => add(
      _Buffering(
        generation: generation,
        index: index,
        ready: ready,
        needed: needed,
      ),
    );
    report(0);
    final slow = Timer(
      _slowAfter,
      () => add(
        _Buffering(
          generation: generation,
          index: index,
          ready: 0,
          needed: needed,
          slow: true,
        ),
      ),
    );
    try {
      for (final sentence in wanted) {
        try {
          await _synthesized(sentence);
        } on SpeechException {
          if (sentence == index) rethrow;
          return;
        }
        slow.cancel();
        if (generation != _generation) return;
        report(sentence - index + 1);
      }
    } finally {
      slow.cancel();
    }
  }

  void _readAhead(int index) {
    switch (state.voice) {
      case DeviceVoice():
        for (var ahead = 1; ahead <= _deviceReadAhead; ahead++) {
          if (index + ahead < _plan.length) {
            _synthesized(index + ahead).ignore();
          }
        }
      case CloudVoice():
        _playhead = index;
        _fetchAhead();
    }
  }

  /// Fills the minute after the playhead, nearest sentence first. Runs whenever
  /// a request ends, so a free slot goes to whatever is needed by then.
  void _fetchAhead() {
    final playhead = _playhead;
    final voice = state.voice;
    if (isClosed || playhead == null || voice is! CloudVoice) return;
    // A faster rate spends the same audio in less time.
    final seconds = _cloudReadAheadSeconds * state.rate;
    final last = playhead + sentencesWithin(_plan, playhead, seconds);
    for (var index = playhead + 1; index <= last; index++) {
      if (_cloudRunning >= _cloudRequests) return;
      if (!_audio.containsKey(index)) _fetch(index, voice);
    }
  }

  Future<Float32List> _fetch(int index, CloudVoice voice) {
    final audio = _audio;
    final ready = _ready;
    _cloudRunning++;
    final job = _speech.synthesize(_plan[index].text, voice);
    job.then<void>(
      (_) {
        _cloudRunning--;
        ready.add(index);
        _fetchAhead();
      },
      onError: (Object _) {
        _cloudRunning--;
        // Not kept: the sentence is asked for again when the voice reaches it.
        audio.remove(index);
      },
    );
    return audio[index] = job;
  }

  Future<Float32List> _synthesized(int index) {
    final kept = _audio[index];
    if (kept != null) return kept;
    return switch (state.voice) {
      final CloudVoice voice => _fetch(index, voice),
      final DeviceVoice voice => _audio[index] = _queued(index, voice),
    };
  }

  /// The model runs one sentence at a time, whoever asks.
  Future<Float32List> _queued(int index, DeviceVoice voice) {
    final text = _plan[index].text;
    final job = _modelQueue.then((_) => _speech.synthesize(text, voice));
    _modelQueue = job.then<void>((_) {}, onError: (Object _) {});
    return job;
  }

  void _release() {
    final unpaused = _unpaused;
    _unpaused = null;
    if (unpaused != null && !unpaused.isCompleted) unpaused.complete();
  }

  void _forgetAudio() {
    _audio = {};
    _ready = {};
  }

  void _remember() => unawaited(
    _choices?.save(ListenChoice(voice: state.voice, rate: state.rate)),
  );

  void _onBuffering(_Buffering event, Emitter<ListenState> emit) {
    if (event.generation != _generation) return;
    _current = event.index;
    emit(
      state.copyWith(
        stage: ListenPreparing(
          ready: event.ready,
          needed: event.needed,
          slow: event.slow,
        ),
      ),
    );
  }

  void _onSentenceReached(_SentenceReached event, Emitter<ListenState> emit) {
    _current = event.index;
    emit(
      state.copyWith(
        stage: ListenPlaying(
          sentence: _plan[event.index],
          index: event.index,
          total: _plan.length,
          paused: _paused,
        ),
        done: event.index / _plan.length,
      ),
    );
  }

  Future<void> _onPauseToggled(
    ListenPauseToggled event,
    Emitter<ListenState> emit,
  ) async {
    final stage = state.stage;
    if (stage is! ListenPlaying) return;
    _paused = !_paused;
    emit(
      state.copyWith(
        stage: ListenPlaying(
          sentence: stage.sentence,
          index: stage.index,
          total: stage.total,
          paused: _paused,
        ),
      ),
    );
    if (_paused) {
      await _speech.pause();
    } else {
      _release();
      await _speech.resume();
    }
  }

  Future<void> _onSkipped(
    ListenSkipped event,
    Emitter<ListenState> emit,
  ) async {
    if (state.stage is! ListenPlaying) return;
    final target = (_current + event.sentences).clamp(0, _plan.length - 1);
    _generation++;
    await _speech.stop();
    _start(target, emit);
  }

  Future<void> _onRateCycled(
    ListenRateCycled event,
    Emitter<ListenState> emit,
  ) async {
    final rate = _rates[(_rates.indexOf(state.rate) + 1) % _rates.length];
    emit(state.copyWith(rate: rate));
    _remember();
    await _speech.setRate(rate);
  }

  Future<void> _onVoiceChosen(
    ListenVoiceChosen event,
    Emitter<ListenState> emit,
  ) async {
    _voiceSettled = true;
    emit(state.copyWith(voice: event.voice));
    _forgetAudio();
    _remember();
    final stage = state.stage;
    if (stage is! ListenPlaying &&
        stage is! ListenPreparing &&
        stage is! ListenFailed) {
      return;
    }
    _generation++;
    await _speech.stop();
    if (event.voice is DeviceVoice && !await _speech.modelReady()) {
      _from = _current;
      emit(state.copyWith(stage: const ListenNeedsVoice()));
      return;
    }
    _start(_current, emit);
  }

  Future<void> _onStopped(
    ListenStopped event,
    Emitter<ListenState> emit,
  ) async {
    await _halt();
    _forgetAudio();
    emit(state.copyWith(stage: const ListenOff(), done: 0));
  }

  void _onRunFailed(_RunFailed event, Emitter<ListenState> emit) =>
      emit(state.copyWith(stage: ListenFailed(event.code)));

  Future<void> _halt() async {
    _generation++;
    _playhead = null;
    _release();
    _speech.cancelDownload();
    await _speech.stop();
  }

  @override
  Future<void> close() async {
    await _halt();
    return super.close();
  }
}
