import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/domain/entities/chapter.dart';
import '../../books/presentation/formatting.dart';
import '../domain/listen_source.dart';
import '../domain/speech.dart';
import 'listen_bloc.dart';

String _failure(String code) => switch (code) {
  'VOICE_DOWNLOAD_FAILED' =>
    'Chưa tải được giọng đọc. Kiểm tra mạng rồi thử lại.',
  'VOICE_DOWNLOAD_CORRUPT' => 'File giọng đọc bị lỗi. Hãy tải lại.',
  'CLOUD_VOICE_FAILED' =>
    'Chưa gọi được giọng Vbee. Kiểm tra mạng, hoặc chọn giọng trên máy.',
  _ => 'Chưa đọc được đoạn này.',
};

String _voiceLine(Voice voice) => switch (voice) {
  DeviceVoice(:final label) => 'Giọng $label, chạy trên máy, không cần mạng',
  CloudVoice(:final label) => 'Giọng $label của Vbee, cần mạng',
};

String _rateLabel(double rate) =>
    rate == rate.roundToDouble() ? rate.toStringAsFixed(1) : rate.toString();

/// Everything about listening, in the ink panel that replaces the reader's footer.
class ListenPanel extends StatelessWidget {
  const ListenPanel({
    super.key,
    required this.blocks,
    required this.source,
    required this.minutes,
  });

  final List<TextBlock> blocks;
  final ListenSource source;

  /// Reading time of the version being listened to, at normal speed.
  final int minutes;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<ListenBloc>().state;
    final bloc = context.read<ListenBloc>();
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 16, 22, 10),
      decoration: const BoxDecoration(
        color: Palette.ink,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        top: false,
        child: switch (state.stage) {
          ListenOff() => const SizedBox.shrink(),
          ListenNeedsVoice() => _Message(
            text:
                'Tải giọng đọc (326 MB), một lần. Sau đó nghe không cần mạng.',
            action: 'Tải giọng đọc',
            onAction: () => bloc.add(const ListenDownloadConfirmed()),
            dismiss: 'Để sau',
            onDismiss: () => bloc.add(const ListenStopped()),
          ),
          ListenDownloading(:final progress) => _Progress(
            text: 'Đang tải giọng đọc, ${(progress * 100).floor()}%',
            value: progress,
            dismiss: 'Huỷ',
            onDismiss: () => bloc.add(const ListenStopped()),
          ),
          ListenPreparing() => _Progress(
            text: 'Đang chuẩn bị giọng đọc',
            dismiss: 'Tắt',
            onDismiss: () => bloc.add(const ListenStopped()),
          ),
          ListenFailed(:final code) => _Message(
            text: _failure(code),
            action: 'Thử lại',
            onAction: () => bloc.add(ListenRequested(blocks, source: source)),
            dismiss: 'Đóng',
            onDismiss: () => bloc.add(const ListenStopped()),
          ),
          final ListenPlaying playing => _Player(
            playing: playing,
            state: state,
            minutes: minutes,
          ),
        },
      ),
    );
  }
}

TextStyle get _onInk => readingStyle(size: 14, color: Palette.sheet);
TextStyle get _quiet =>
    readingStyle(size: 13, color: Palette.sheet.withValues(alpha: 0.72));

class _PanelButton extends StatelessWidget {
  const _PanelButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: onTap,
    style: TextButton.styleFrom(
      foregroundColor: Palette.sheet,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      minimumSize: const Size(44, 44),
    ),
    child: Text(label, style: _onInk),
  );
}

class _Message extends StatelessWidget {
  const _Message({
    required this.text,
    required this.action,
    required this.onAction,
    required this.dismiss,
    required this.onDismiss,
  });

  final String text;
  final String action;
  final VoidCallback onAction;
  final String dismiss;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(text, style: readingStyle(size: 15, color: Palette.sheet)),
      const SizedBox(height: 8),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _PanelButton(label: dismiss, onTap: onDismiss),
          FilledButton(
            onPressed: onAction,
            style: FilledButton.styleFrom(
              backgroundColor: Palette.marker,
              foregroundColor: Palette.ink,
            ),
            child: Text(
              action,
              style: readingStyle(
                size: 14,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
          ),
        ],
      ),
    ],
  );
}

class _Track extends StatelessWidget {
  const _Track({this.value});

  final double? value;

  @override
  Widget build(BuildContext context) => LinearProgressIndicator(
    value: value,
    minHeight: 3,
    borderRadius: BorderRadius.circular(2),
    color: Palette.marker,
    backgroundColor: Palette.sheet.withValues(alpha: 0.28),
  );
}

class _Progress extends StatelessWidget {
  const _Progress({
    required this.text,
    this.value,
    required this.dismiss,
    required this.onDismiss,
  });

  final String text;
  final double? value;
  final String dismiss;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _Track(value: value),
      const SizedBox(height: 6),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(child: Text(text, style: _onInk)),
          _PanelButton(label: dismiss, onTap: onDismiss),
        ],
      ),
    ],
  );
}

class _Player extends StatelessWidget {
  const _Player({
    required this.playing,
    required this.state,
    required this.minutes,
  });

  final ListenPlaying playing;
  final ListenState state;
  final int minutes;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<ListenBloc>();
    final left = (minutes * (1 - state.done) / state.rate).ceil();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Track(value: state.done),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Câu ${playing.index + 1} trên ${playing.total}',
              style: _quiet,
            ),
            Text('còn ${durationLabel(left)}', style: _quiet),
          ],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                child: _PanelButton(
                  label: 'Lùi một câu',
                  onTap: () => bloc.add(const ListenSkipped(-1)),
                ),
              ),
            ),
            IconButton(
              tooltip: playing.paused ? 'Đọc tiếp' : 'Tạm dừng',
              iconSize: 30,
              style: IconButton.styleFrom(
                backgroundColor: Palette.marker,
                foregroundColor: Palette.ink,
                minimumSize: const Size(56, 56),
              ),
              onPressed: () => bloc.add(const ListenPauseToggled()),
              icon: Icon(playing.paused ? Icons.play_arrow : Icons.pause),
            ),
            Expanded(
              child: Align(
                alignment: Alignment.centerRight,
                child: _PanelButton(
                  label: 'Tốc độ ${_rateLabel(state.rate)}',
                  onTap: () => bloc.add(const ListenRateCycled()),
                ),
              ),
            ),
          ],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: InkWell(
                onTap: () => _chooseVoice(context),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(_voiceLine(state.voice), style: _quiet),
                ),
              ),
            ),
            _PanelButton(
              label: 'Tắt',
              onTap: () => bloc.add(const ListenStopped()),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _chooseVoice(BuildContext context) async {
    final bloc = context.read<ListenBloc>();
    final cloud = context.read<Speech>().cloudVoices();
    final voice = await showModalBottomSheet<Voice>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          child: FutureBuilder<List<CloudVoice>>(
            future: cloud,
            builder: (context, snapshot) {
              final cloudVoices = snapshot.data ?? const <CloudVoice>[];
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _VoiceHeading('Trên máy'),
                  for (final voice in DeviceVoice.values)
                    _VoiceTile(voice: voice, chosen: bloc.state.voice),
                  if (cloudVoices.isNotEmpty) ...[
                    const _VoiceHeading('Vbee, cần mạng'),
                    for (final voice in cloudVoices)
                      _VoiceTile(voice: voice, chosen: bloc.state.voice),
                  ],
                ],
              );
            },
          ),
        ),
      ),
    );
    if (voice != null) bloc.add(ListenVoiceChosen(voice));
  }
}

class _VoiceHeading extends StatelessWidget {
  const _VoiceHeading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
    child: Text(text, style: readingStyle(size: 13, color: Palette.muted)),
  );
}

class _VoiceTile extends StatelessWidget {
  const _VoiceTile({required this.voice, required this.chosen});

  final Voice voice;
  final Voice chosen;

  @override
  Widget build(BuildContext context) => ListTile(
    title: Text(
      voice.label,
      style: readingStyle(
        size: 16,
        color: voice == chosen ? Palette.red : Palette.text,
      ),
    ),
    onTap: () => Navigator.of(context).pop(voice),
  );
}
