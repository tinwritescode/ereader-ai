import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/formatting.dart';
import '../../tasks/presentation/chapter_voice_sheet.dart';
import '../domain/speech.dart';
import 'listen_bloc.dart';

/// What went wrong, and what to do about it.
(String, String) _failure(String code) => switch (code) {
  'VOICE_DOWNLOAD_FAILED' => (
    'Chưa tải được giọng đọc',
    'Kiểm tra mạng rồi thử lại.',
  ),
  'VOICE_DOWNLOAD_CORRUPT' => ('File giọng đọc bị lỗi', 'Hãy tải lại.'),
  'CLOUD_VOICE_FAILED' => (
    'Chưa gọi được giọng qua mạng',
    'Kiểm tra mạng, hoặc chọn giọng trên máy.',
  ),
  'VBEE_LIMIT' => (
    'Hết phút giọng qua mạng',
    'Tháng này đã dùng hết. Chọn giọng trên máy để nghe tiếp từ câu này.',
  ),
  _ => ('Chưa đọc được đoạn này', 'Thử lại, hoặc chọn giọng khác.'),
};

/// Shared with the mini player: the two say the same thing during the wait.
String preparingLine(int ready, int needed, {bool slow = false}) => slow
    ? 'Máy đọc đang khởi động'
    : needed == 0
    ? 'Đang chuẩn bị giọng đọc'
    : 'Đã có $ready trên $needed câu';

String _rateLabel(double rate) =>
    rate == rate.roundToDouble() ? rate.toStringAsFixed(1) : rate.toString();

/// Everything about listening, in the ink panel that replaces the reader's footer.
class ListenPanel extends StatelessWidget {
  const ListenPanel({super.key, required this.minutes});

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
            title: 'Tải giọng đọc (282 MB), một lần',
            text: 'Sau đó nghe không cần mạng.',
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
          ListenPreparing(needed: 0) => _Progress(
            text: preparingLine(0, 0),
            dismiss: 'Tắt',
            onDismiss: () => bloc.add(const ListenStopped()),
          ),
          ListenPreparing(:final ready, :final needed, :final slow) => _Waiting(
            ready: ready,
            needed: needed,
            slow: slow,
            voice: state.voice,
          ),
          ListenFailed(code: 'VBEE_LIMIT') => _Message(
            title: _failure('VBEE_LIMIT').$1,
            text: _failure('VBEE_LIMIT').$2,
            action: 'Chọn giọng',
            onAction: () => _chooseVoice(context),
            dismiss: 'Đóng',
            onDismiss: () => bloc.add(const ListenStopped()),
          ),
          ListenFailed(:final code) => _Message(
            title: _failure(code).$1,
            text: _failure(code).$2,
            action: 'Thử lại',
            // Choosing the same voice picks up from the sentence that failed.
            onAction: () => bloc.add(ListenVoiceChosen(state.voice)),
            second: 'Chọn giọng',
            onSecond: () => _chooseVoice(context),
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
TextStyle get _written => handStyle(size: 25, color: Palette.marker);

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
    required this.title,
    required this.text,
    required this.action,
    required this.onAction,
    this.second,
    this.onSecond,
    required this.dismiss,
    required this.onDismiss,
  });

  final String title;
  final String text;
  final String action;
  final VoidCallback onAction;
  final String? second;
  final VoidCallback? onSecond;
  final String dismiss;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final second = this.second;
    final onSecond = this.onSecond;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: _written),
        const SizedBox(height: 2),
        Text(text, style: _onInk),
        const SizedBox(height: 8),
        Row(
          children: [
            _PanelButton(label: dismiss, onTap: onDismiss),
            const Spacer(),
            if (second != null && onSecond != null) ...[
              _PanelButton(label: second, onTap: onSecond),
              const SizedBox(width: 8),
            ],
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

/// The wait, counted the way a notebook counts: four strokes and a slash.
class _Tally extends StatelessWidget {
  const _Tally({required this.ready, required this.needed});

  final int ready;
  final int needed;

  static const _strokes = [
    (left: 6.0, top: 4.0, length: 50.0, turn: 0.035),
    (left: 24.0, top: 4.0, length: 50.0, turn: -0.035),
    (left: 42.0, top: 4.0, length: 50.0, turn: 0.05),
    (left: 60.0, top: 4.0, length: 50.0, turn: -0.02),
    (left: 34.0, top: -8.0, length: 74.0, turn: 1.08),
  ];

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 96,
    height: 58,
    child: Stack(
      clipBehavior: Clip.none,
      children: [
        for (final (index, stroke) in _strokes.take(needed).indexed)
          Positioned(
            left: stroke.left,
            top: stroke.top,
            child: Transform.rotate(
              angle: stroke.turn,
              child: Container(
                width: 4,
                height: stroke.length,
                decoration: BoxDecoration(
                  color: index < ready
                      ? Palette.marker
                      : Palette.sheet.withValues(alpha: 0.24),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _Waiting extends StatelessWidget {
  const _Waiting({
    required this.ready,
    required this.needed,
    required this.slow,
    required this.voice,
  });

  final int ready;
  final int needed;
  final bool slow;
  final Voice voice;

  @override
  Widget build(BuildContext context) {
    final bloc = context.read<ListenBloc>();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: _Tally(ready: ready, needed: needed),
        ),
        const SizedBox(height: 2),
        Text(preparingLine(ready, needed, slow: slow), style: _written),
        const SizedBox(height: 2),
        Text(
          slow
              ? 'Lượt đầu sau khi nghỉ mất khoảng một phút, các câu sau đọc ngay.'
              : 'Đủ $needed câu là ${voice.label} đọc, để nghe liền mạch.',
          style: _quiet,
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _PanelButton(
              label: 'Tắt',
              onTap: () => bloc.add(const ListenStopped()),
            ),
            _PanelButton(
              label: 'Đổi giọng',
              onTap: () => _chooseVoice(context),
            ),
          ],
        ),
      ],
    );
  }
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
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Text(
                state.voice.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: _written,
              ),
            ),
            _PanelButton(
              label: 'Đổi giọng',
              onTap: () => _chooseVoice(context),
            ),
          ],
        ),
        const SizedBox(height: 4),
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
        const SizedBox(height: 4),
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
                minimumSize: const Size(60, 60),
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
            if (mayPrepareChapter(context))
              _PanelButton(
                label: 'Tạo sẵn cả chương',
                onTap: () => chooseChapterVoice(context),
              )
            else
              const SizedBox.shrink(),
            _PanelButton(
              label: 'Tắt',
              onTap: () => bloc.add(const ListenStopped()),
            ),
          ],
        ),
      ],
    );
  }
}

Future<void> _chooseVoice(BuildContext context) async {
  final bloc = context.read<ListenBloc>();
  final speech = context.read<Speech>();
  final offer = (speech.cloudVoices(), speech.modelReady()).wait;
  final voice = await showModalBottomSheet<Voice>(
    context: context,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: FutureBuilder<(List<CloudVoice>, bool)>(
          future: offer,
          builder: (context, snapshot) {
            final cloudVoices = snapshot.data?.$1 ?? const <CloudVoice>[];
            final modelReady = snapshot.data?.$2 ?? true;
            final chosen = bloc.state.voice;
            final device = DeviceVoice.values;
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Chọn giọng đọc',
                  style: readingStyle(
                    size: 16,
                    weight: FontWeight.w600,
                    color: Palette.ink,
                  ),
                ),
                if (cloudVoices.isNotEmpty) ...[
                  const _VoiceHeading('Giọng qua mạng, tính vào phút của gói'),
                  for (final voice in cloudVoices)
                    _CloudVoiceTile(voice: voice, chosen: chosen),
                ],
                const _VoiceHeading('Trên máy, nghe không cần mạng'),
                if (!modelReady)
                  Text(
                    'Tải một lần, 282 MB.',
                    style: readingStyle(size: 13, color: Palette.muted),
                  ),
                for (var index = 0; index < device.length; index += 2)
                  Row(
                    children: [
                      Expanded(
                        child: _DeviceVoiceTile(
                          voice: device[index],
                          chosen: chosen,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: index + 1 < device.length
                            ? _DeviceVoiceTile(
                                voice: device[index + 1],
                                chosen: chosen,
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
              ],
            );
          },
        ),
      ),
    ),
  );
  if (voice != null) bloc.add(ListenVoiceChosen(voice));
}

class _VoiceHeading extends StatelessWidget {
  const _VoiceHeading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 2),
    child: Text(text, style: readingStyle(size: 13, color: Palette.muted)),
  );
}

class _CloudVoiceTile extends StatelessWidget {
  const _CloudVoiceTile({required this.voice, required this.chosen});

  final CloudVoice voice;
  final Voice chosen;

  @override
  Widget build(BuildContext context) {
    final isChosen = voice == chosen;
    return InkWell(
      onTap: () => Navigator.of(context).pop(voice),
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Palette.rule)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                voice.label,
                style: isChosen ? handStyle(size: 23) : readingStyle(size: 16),
              ),
            ),
            if (isChosen)
              Text(
                'đang dùng',
                style: readingStyle(size: 12.5, color: Palette.muted),
              ),
          ],
        ),
      ),
    );
  }
}

class _DeviceVoiceTile extends StatelessWidget {
  const _DeviceVoiceTile({required this.voice, required this.chosen});

  final DeviceVoice voice;
  final Voice chosen;

  @override
  Widget build(BuildContext context) {
    final isChosen = voice == chosen;
    return InkWell(
      onTap: () => Navigator.of(context).pop(voice),
      child: Container(
        height: 44,
        alignment: Alignment.centerLeft,
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Palette.rule)),
        ),
        child: Text(
          voice.label,
          style: isChosen ? handStyle(size: 21) : readingStyle(size: 15),
        ),
      ),
    );
  }
}
