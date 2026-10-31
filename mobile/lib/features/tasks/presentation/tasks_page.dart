import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/widgets.dart';
import '../domain/chapter_task.dart';
import 'tasks_cubit.dart';

/// Why a task stopped, in the reader's words.
String taskFailure(String? code) => switch (code) {
  'VBEE_LIMIT' => 'Hết phút giọng qua mạng',
  _ => 'Không kết nối được tới máy đọc',
};

/// The account's long jobs, grouped by where they stand.
class TasksPage extends StatefulWidget {
  const TasksPage({super.key, required this.onOpen});

  /// Opens a finished task's chapter.
  final void Function(ChapterTask task) onOpen;

  static Route<void> route(void Function(ChapterTask task) onOpen) =>
      MaterialPageRoute(builder: (_) => TasksPage(onOpen: onOpen));

  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final onOpen = widget.onOpen;
    final tasks = context.watch<TasksCubit>().state.tasks;
    List<ChapterTask> inState(bool Function(ChapterTask) wanted) =>
        tasks.where(wanted).toList();
    final running = inState((task) => task.state == ChapterTaskState.running);
    final queued = inState((task) => task.state == ChapterTaskState.queued);
    final finished = inState((task) => !task.active).reversed.toList();
    return Scaffold(
      body: RuledPaper(
        scroll: _scroll,
        child: SafeArea(
          child: Stack(
            children: [
              ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(
                  marginWidth + 12,
                  lineHeight * 2,
                  18,
                  lineHeight,
                ),
                children: [
                  Text(
                    'Tác vụ',
                    style: readingStyle(
                      size: 24,
                      weight: FontWeight.w600,
                      color: Palette.ink,
                    ),
                  ),
                  if (tasks.isEmpty) const _Empty(),
                  _Group('Đang chạy', running, onOpen),
                  _Group('Đang chờ', queued, onOpen),
                  _Group('Đã xong', finished, onOpen),
                  if (finished.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        'Dòng cũ hơn 7 ngày tự ẩn. Audio đã tạo vẫn được giữ.',
                        style: readingStyle(size: 13, color: Palette.muted),
                      ),
                    ),
                ],
              ),
              const Positioned(
                left: 2,
                top: 0,
                child: BackButton(color: Palette.ink),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 150),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Transform.rotate(
          angle: -0.035,
          alignment: Alignment.centerLeft,
          child: Text('Chưa có tác vụ nào', style: handStyle(size: 28)),
        ),
        const SizedBox(height: 8),
        Text(
          'Khi đang nghe, chọn Tạo sẵn cả chương, tiến độ sẽ hiện ở đây.',
          style: readingStyle(size: 15, color: Palette.muted),
        ),
      ],
    ),
  );
}

class _Group extends StatelessWidget {
  const _Group(this.title, this.tasks, this.onOpen);

  final String title;
  final List<ChapterTask> tasks;
  final void Function(ChapterTask task) onOpen;

  @override
  Widget build(BuildContext context) => tasks.isEmpty
      ? const SizedBox.shrink()
      : Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 18),
            Text(title, style: handStyle(size: 21)),
            for (final task in tasks) _TaskRow(task, onOpen),
          ],
        );
}

class _TaskRow extends StatelessWidget {
  const _TaskRow(this.task, this.onOpen);

  final ChapterTask task;
  final void Function(ChapterTask task) onOpen;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<TasksCubit>();
    final soft = readingStyle(size: 13, color: Palette.muted);
    final position = task.position;
    final kind = 'Tạo giọng đọc, ${task.voiceName}';
    final stopped = task.state == ChapterTaskState.stopped;
    final name = '${task.chapterLabel}, ${task.bookTitle}';
    return InkWell(
      onTap: task.state == ChapterTaskState.done ? () => onOpen(task) : null,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Palette.rule)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              stopped
                  ? 'Bị dừng ở ${task.percent}%, phần đã làm vẫn còn'
                  : position != null
                  ? '$kind, thứ $position trong hàng'
                  : kind,
              style: stopped
                  ? readingStyle(size: 13, color: Palette.red)
                  : soft,
            ),
            Text(name, style: readingStyle(size: 16)),
            if (task.state == ChapterTaskState.running) _Share(task),
            if (task.active || stopped)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(
                    child: Text(switch (task.state) {
                      ChapterTaskState.running =>
                        'Câu ${task.done} trên ${task.total}',
                      ChapterTaskState.stopped => taskFailure(task.code),
                      _ => '',
                    }, style: soft),
                  ),
                  _Action(
                    label: stopped ? 'Chạy tiếp' : 'Huỷ',
                    onTap: () =>
                        stopped ? cubit.resume(task.id) : cubit.cancel(task.id),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Share extends StatelessWidget {
  const _Share(this.task);

  final ChapterTask task;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 5),
    child: Row(
      children: [
        Expanded(
          child: LinearProgressIndicator(
            value: task.percent / 100,
            minHeight: 8,
            borderRadius: BorderRadius.circular(4),
            color: Palette.marker,
            backgroundColor: Palette.rule,
          ),
        ),
        const SizedBox(width: 10),
        Text('${task.percent}%', style: handStyle(size: 20)),
      ],
    ),
  );
}

class _Action extends StatelessWidget {
  const _Action({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: onTap,
    style: TextButton.styleFrom(
      minimumSize: const Size(44, 44),
      padding: const EdgeInsets.symmetric(horizontal: 4),
    ),
    child: Text(
      label,
      style: readingStyle(
        size: 14,
        weight: FontWeight.w600,
        color: Palette.ink,
      ),
    ),
  );
}
