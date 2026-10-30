import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../books/domain/entities/chapter.dart';
import '../domain/speech.dart';
import '../domain/speech_plan.dart';

const _rates = [1.0, 1.25, 1.5, 0.8];
// Sentences made ready ahead of the one playing, so playback does not wait for the model.
const _readAhead = 2;

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
  const ListenPreparing();
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
  });

  final ListenStage stage;
  final Voice voice;
  final double rate;

  /// Share of the chapter's sentences already read, from 0 to 1.
  final double done;

  ListenState copyWith({
    ListenStage? stage,
    Voice? voice,
    double? rate,
    double? done,
  }) => ListenState(
    stage: stage ?? this.stage,
    voice: voice ?? this.voice,
    rate: rate ?? this.rate,
    done: done ?? this.done,
  );
}

sealed class ListenEvent {
  const ListenEvent();
}

final class ListenRequested extends ListenEvent {
  const ListenRequested(this.blocks, {this.block = 0, this.offset = 0});

  final List<TextBlock> blocks;

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

final class _RunFailed extends ListenEvent {
  const _RunFailed(this.code);

  final String code;
}

final class _RunEnded extends ListenEvent {
  const _RunEnded();
}

class ListenBloc extends Bloc<ListenEvent, ListenState> {
  ListenBloc(this._speech) : super(const ListenState()) {
    on<ListenRequested>(_onRequested);
    on<ListenDownloadConfirmed>(_onDownloadConfirmed);
    on<ListenPauseToggled>(_onPauseToggled);
    on<ListenSkipped>(_onSkipped);
    on<ListenRateCycled>(_onRateCycled);
    on<ListenVoiceChosen>(_onVoiceChosen);
    on<ListenStopped>(_onStopped);
    on<_SentenceReached>(_onSentenceReached);
    on<_RunFailed>(_onRunFailed);
    on<_RunEnded>((_, emit) => emit(state.copyWith(stage: const ListenOff())));
  }

  final Speech _speech;
  List<TextBlock> _blocks = const [];
  List<SpokenSentence> _plan = const [];
  var _audio = <int, Future<Float32List>>{};
  Future<void> _modelQueue = Future.value();
  // Each run owns one generation; a newer one makes an older run stop by itself.
  int _generation = 0;
  int _current = 0;
  int _from = 0;
  bool _paused = false;
  Completer<void>? _unpaused;

  Future<void> _onRequested(
    ListenRequested event,
    Emitter<ListenState> emit,
  ) async {
    if (!identical(event.blocks, _blocks)) {
      _blocks = event.blocks;
      _plan = planSpeech(_blocks);
      _audio = {};
    }
    if (_plan.isEmpty) return;
    _from = sentenceAt(_plan, event.block, event.offset);
    if (state.stage is ListenDownloading) return;
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

  void _start(int index, Emitter<ListenState> emit) {
    _generation++;
    _paused = false;
    _release();
    emit(state.copyWith(stage: const ListenPreparing()));
    unawaited(_run(_generation, index));
  }

  Future<void> _run(int generation, int from) async {
    try {
      // The player outlives this bloc, so it may hold the last chapter's rate.
      await _speech.setRate(state.rate);
      for (var index = from; index < _plan.length; index++) {
        final samples = _synthesized(index);
        for (var ahead = 1; ahead <= _readAhead; ahead++) {
          if (index + ahead < _plan.length) {
            _synthesized(index + ahead).ignore();
          }
        }
        final audio = await samples;
        if (_paused) await (_unpaused ??= Completer<void>()).future;
        if (generation != _generation) return;
        add(_SentenceReached(index));
        await _speech.play(audio);
        if (generation != _generation) return;
        _audio.remove(index);
      }
      await _speech.stop();
      add(const _RunEnded());
    } on SpeechException catch (error) {
      if (generation != _generation) return;
      await _speech.stop();
      add(_RunFailed(error.code));
    }
  }

  /// The model runs one sentence at a time, whoever asks.
  Future<Float32List> _synthesized(int index) => _audio[index] ??= () {
    final text = _plan[index].text;
    final voice = state.voice;
    final job = _modelQueue.then((_) => _speech.synthesize(text, voice));
    _modelQueue = job.then<void>((_) {}, onError: (Object _) {});
    return job;
  }();

  void _release() {
    final unpaused = _unpaused;
    _unpaused = null;
    if (unpaused != null && !unpaused.isCompleted) unpaused.complete();
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
    await _speech.setRate(rate);
  }

  Future<void> _onVoiceChosen(
    ListenVoiceChosen event,
    Emitter<ListenState> emit,
  ) async {
    emit(state.copyWith(voice: event.voice));
    _audio = {};
    if (state.stage is! ListenPlaying) return;
    _generation++;
    await _speech.stop();
    _start(_current, emit);
  }

  Future<void> _onStopped(
    ListenStopped event,
    Emitter<ListenState> emit,
  ) async {
    await _halt();
    _audio = {};
    emit(state.copyWith(stage: const ListenOff(), done: 0));
  }

  void _onRunFailed(_RunFailed event, Emitter<ListenState> emit) =>
      emit(state.copyWith(stage: ListenFailed(event.code)));

  Future<void> _halt() async {
    _generation++;
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
