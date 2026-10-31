import 'package:ereader_mobile/app/theme.dart';
import 'package:ereader_mobile/features/tasks/domain/chapter_task.dart';
import 'package:ereader_mobile/features/tasks/presentation/tasks_cubit.dart';
import 'package:ereader_mobile/features/tasks/presentation/tasks_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_tasks.dart';

void main() {
  Future<FakeTasksRepository> show(
    WidgetTester tester,
    List<LongTask> list,
  ) async {
    final repository = FakeTasksRepository(list);
    final cubit = TasksCubit(
      repository,
      FakeTaskNoticeStore(),
      pollEvery: const Duration(hours: 1),
    );
    await cubit.refresh();
    await tester.pumpWidget(
      BlocProvider(
        create: (_) => cubit,
        child: MaterialApp(
          theme: buildTheme(),
          home: TasksPage(onOpen: (_) {}),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return repository;
  }

  testWidgets('says where tasks come from when there are none', (tester) async {
    await show(tester, const []);
    expect(find.text('Chưa có tác vụ nào'), findsOneWidget);
  });

  testWidgets('groups tasks, shows the share done and the place in line', (
    tester,
  ) async {
    await show(tester, [
      task(),
      task(id: 't2', state: TaskState.queued, done: 0, position: 1),
      task(
        id: 't3',
        state: TaskState.done,
        done: 180,
        finishedAt: DateTime(2026, 10, 31, 14, 20),
      ),
    ]);
    expect(find.text('Đang chạy'), findsOneWidget);
    expect(find.text('Đang chờ'), findsOneWidget);
    expect(find.text('Đã xong'), findsOneWidget);
    expect(find.text('62%'), findsOneWidget);
    expect(find.text('Câu 112 trên 180'), findsOneWidget);
    expect(
      find.text('Tạo giọng đọc, Hạt Dẻ, thứ 1 trong hàng'),
      findsOneWidget,
    );
  });

  testWidgets('hides a group with nothing in it', (tester) async {
    await show(tester, [task()]);
    expect(find.text('Đang chờ'), findsNothing);
    expect(find.text('Đã xong'), findsNothing);
  });

  testWidgets('cancels a running task', (tester) async {
    final repository = await show(tester, [task()]);
    await tester.tap(find.text('Huỷ'));
    await tester.pumpAndSettle();
    expect(repository.cancelled, ['t1']);
  });

  testWidgets('offers to go on from a stop, and says why it stopped', (
    tester,
  ) async {
    final repository = await show(tester, [
      task(
        state: TaskState.stopped,
        code: 'VBEE_LIMIT',
        finishedAt: DateTime(2026, 10, 31),
      ),
    ]);
    expect(find.text('Bị dừng ở 62%, phần đã làm vẫn còn'), findsOneWidget);
    expect(find.text('Hết phút giọng qua mạng'), findsOneWidget);
    await tester.tap(find.text('Chạy tiếp'));
    await tester.pumpAndSettle();
    expect(repository.resumed, ['t1']);
  });

  testWidgets('shows a book translation by its chapters', (tester) async {
    final repository = await show(tester, [translation()]);
    expect(find.text('Dịch cả sách'), findsOneWidget);
    expect(find.text('Dune'), findsOneWidget);
    expect(find.text('Chương 4 trên 22'), findsOneWidget);
    expect(find.text('18%'), findsOneWidget);
    await tester.tap(find.text('Huỷ'));
    await tester.pumpAndSettle();
    expect(repository.cancelled, ['tr1']);
  });

  testWidgets('offers to go on with a stopped translation', (tester) async {
    final repository = await show(tester, [
      translation(
        state: TaskState.stopped,
        code: 'TRANSLATE_FAILED',
        current: null,
        finishedAt: DateTime(2026, 10, 31),
      ),
    ]);
    expect(find.text('Dịch cả sách, bị dừng ở 18%'), findsOneWidget);
    expect(find.text('Không kết nối được tới máy dịch'), findsOneWidget);
    await tester.tap(find.text('Chạy tiếp'));
    await tester.pumpAndSettle();
    expect(repository.resumed, ['tr1']);
  });
}
