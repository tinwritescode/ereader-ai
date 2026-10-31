import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../auth/presentation/auth_cubit.dart';
import '../../books/domain/entities/reading_length.dart';
import '../../books/presentation/formatting.dart';
import '../../listen/domain/speech.dart';
import '../../listen/domain/speech_plan.dart';
import '../../listen/presentation/listen_bloc.dart';
import '../domain/chapter_task.dart';
import 'task_notices.dart';
import 'tasks_cubit.dart';

/// Whether this account may prepare a chapter's audio ahead of listening.
bool mayPrepareChapter(BuildContext context) =>
    switch (context.watch<AuthCubit>().state) {
      AuthSignedIn(:final account) => account.limits.chapterVoice,
      _ => false,
    };

/// Asks which voice should read the chapter being listened to.
Future<void> chooseChapterVoice(BuildContext context) async {
  final bloc = context.read<ListenBloc>();
  final tasks = context.read<TasksCubit>();
  final source = bloc.state.source;
  final auth = context.read<AuthCubit>().state;
  if (source == null || auth is! AuthSignedIn) return;
  final account = auth.account;
  final voices = await context.read<Speech>().cloudVoices();
  if (!context.mounted || voices.isEmpty) return;

  final sentences = bloc.sentences;
  final chapterMinutes = spokenMinutes(sentences);
  final minutesLeft =
      account.limits.monthlyVbeeMinutes - account.vbeeMinutesUsed;
  final current = bloc.state.voice;
  final voice = await showModalBottomSheet<CloudVoice>(
    context: context,
    isScrollControlled: true,
    builder: (context) => _ChapterVoiceSheet(
      voices: voices,
      first: current is CloudVoice ? current : voices.first,
      note:
          'Khoảng ${durationLabel(chapterMinutes)} giọng, còn $minutesLeft phút tháng này. Huỷ thì trả lại phần chưa tạo.',
    ),
  );
  if (voice == null || !context.mounted) return;
  final label = source.chapter.label;
  final messenger = ScaffoldMessenger.of(context);
  try {
    await tasks.create(
      ChapterVoiceJob(
        bookId: source.book.bookId,
        chapterId: source.chapter.chapterId,
        bookTitle: source.book.title,
        chapterLabel: label,
        minutes: source.option.length == ReadingLength.original
            ? null
            : source.option.minutes,
        voiceCode: voice.code,
        sentences: sentences,
      ),
    );
    if (context.mounted) showTaskStarted(context, label);
  } on TasksException {
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Chưa tạo được, kiểm tra mạng rồi thử lại.'),
      ),
    );
  }
}

class _ChapterVoiceSheet extends StatefulWidget {
  const _ChapterVoiceSheet({
    required this.voices,
    required this.first,
    required this.note,
  });

  final List<CloudVoice> voices;
  final CloudVoice first;
  final String note;

  @override
  State<_ChapterVoiceSheet> createState() => _ChapterVoiceSheetState();
}

class _ChapterVoiceSheetState extends State<_ChapterVoiceSheet> {
  late var _chosen = widget.first;

  @override
  Widget build(BuildContext context) {
    final soft = readingStyle(size: 13.5, color: Palette.muted);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Tạo giọng đọc cả chương',
              style: readingStyle(
                size: 18,
                weight: FontWeight.w600,
                color: Palette.ink,
              ),
            ),
            const SizedBox(height: 4),
            Text('Audio làm sẵn, lúc nghe không phải chờ.', style: soft),
            for (final voice in widget.voices)
              InkWell(
                onTap: () => setState(() => _chosen = voice),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 50),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Palette.rule)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          voice.label,
                          style: voice == _chosen
                              ? handStyle(size: 23)
                              : readingStyle(size: 16),
                        ),
                      ),
                      if (voice == _chosen)
                        Text(
                          'đang chọn',
                          style: readingStyle(size: 12.5, color: Palette.muted),
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Text(widget.note, style: soft),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(_chosen),
              child: const Text('Tạo giọng đọc'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Để sau'),
            ),
          ],
        ),
      ),
    );
  }
}
