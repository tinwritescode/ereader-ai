import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../auth/presentation/account_widgets.dart';
import '../../auth/presentation/plans_page.dart';
import '../../tasks/domain/chapter_task.dart';
import '../../tasks/presentation/tasks_page.dart';
import 'translate_offer.dart';
import 'widgets.dart';

/// The book page's line about translating the whole book.
class TranslateRow extends StatelessWidget {
  const TranslateRow({
    super.key,
    required this.offer,
    required this.left,
    required this.onOffer,
    required this.onLocked,
    required this.onFollow,
    required this.onResume,
  });

  final TranslateOffer offer;

  /// Book translations left this month.
  final int left;
  final VoidCallback onOffer;
  final VoidCallback onLocked;
  final VoidCallback onFollow;
  final void Function(BookTranslationTask task) onResume;

  @override
  Widget build(BuildContext context) {
    final soft = readingStyle(size: 13, color: Palette.muted);
    final title = readingStyle(
      size: 15.5,
      weight: FontWeight.w600,
      color: Palette.ink,
    );
    return switch (offer) {
      TranslateHidden() => const SizedBox.shrink(),
      TranslateDone() => _Line(
        child: Text('Đã dịch cả sách sang tiếng Việt', style: soft),
      ),
      TranslateOffered() => _Line(
        onTap: onOffer,
        child: _Titled(
          title: Text('Dịch cả sách sang tiếng Việt', style: title),
          note: Text('gói Max, tháng này còn $left lượt', style: soft),
        ),
      ),
      TranslateLocked() => _Line(
        onTap: onLocked,
        child: _Titled(
          title: Text(
            'Dịch cả sách sang tiếng Việt',
            style: title.copyWith(color: Palette.muted),
          ),
          note: Text('gói Max', style: soft),
        ),
      ),
      TranslateUnderWay(:final task) => _Line(
        onTap: onFollow,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(switch (task.position) {
              final position? => 'Chờ dịch cả sách, thứ $position trong hàng',
              null =>
                'Đang dịch cả sách, chương ${task.done} trên ${task.total}',
            }, style: title),
            const SizedBox(height: 5),
            Row(
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
          ],
        ),
      ),
      TranslateStopped(:final task) => _Line(
        child: Row(
          children: [
            Expanded(
              child: _Titled(
                title: Text(
                  'Dịch cả sách, bị dừng ở ${task.percent}%',
                  style: title.copyWith(color: Palette.red),
                ),
                note: Text(taskFailure(task.code), style: soft),
              ),
            ),
            InkLink(label: 'Chạy tiếp', onPressed: () => onResume(task)),
          ],
        ),
      ),
    };
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(marginWidth + 12, 0, 18, lineHeight),
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: child),
            if (onTap != null)
              const Icon(Icons.chevron_right, size: 20, color: Palette.ink),
          ],
        ),
      ),
    ),
  );
}

class _Titled extends StatelessWidget {
  const _Titled({required this.title, required this.note});

  final Widget title;
  final Widget note;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [title, note],
  );
}

/// Asks before a month's book translation is used; true to go ahead.
class TranslateSheet extends StatelessWidget {
  const TranslateSheet({
    super.key,
    required this.chapterCount,
    required this.from,
    required this.left,
    required this.monthly,
    required this.resetLabel,
  });

  final int chapterCount;

  /// The chapter being read, translated first; null to start at the beginning.
  final String? from;
  final int left;
  final int monthly;
  final String resetLabel;

  @override
  Widget build(BuildContext context) {
    final body = readingStyle(size: 15, height: 1.55);
    final from = this.from;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Dịch cả sách sang tiếng Việt', style: handStyle(size: 24)),
            const SizedBox(height: 8),
            Text(
              from == null
                  ? 'AI dịch $chapterCount chương, từ đầu tới cuối sách.'
                  : 'AI dịch $chapterCount chương, bắt đầu từ $from tới hết, '
                        'rồi quay lại các chương trước.',
              style: body,
            ),
            const SizedBox(height: 6),
            Text(
              'Mỗi chương xong là đọc được ngay. Trong lúc chờ, '
              'bạn vẫn đọc bản gốc như thường.',
              style: body,
            ),
            const SizedBox(height: 12),
            Text(
              left > 0
                  ? 'Dùng 1 lượt dịch sách. Tháng này còn $left trên $monthly lượt.'
                  : 'Đã dùng hết $monthly lượt dịch sách tháng này. '
                        'Lượt mới có vào $resetLabel.',
              style: readingStyle(size: 13.5, color: Palette.muted),
            ),
            const SizedBox(height: 16),
            if (left > 0)
              PrimaryButton(
                label: 'Dịch cả sách',
                onPressed: () => Navigator.of(context).pop(true),
              ),
            InkLink(
              label: 'Để sau',
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shown to a reader whose plan has no book translations.
class TranslateLockedSheet extends StatelessWidget {
  const TranslateLockedSheet({super.key, required this.monthly});

  /// Book translations a month on Max.
  final int monthly;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Dịch cả sách có ở gói Max', style: handStyle(size: 24)),
          const SizedBox(height: 8),
          Text(
            'Gói Max dịch $monthly cuốn sách sang tiếng Việt mỗi tháng, '
            'giữ nguyên từng đoạn của bản gốc.',
            style: readingStyle(size: 15, height: 1.55),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: 'Xem các gói',
            onPressed: () {
              final navigator = Navigator.of(context)..pop();
              navigator.push(PlansPage.route());
            },
          ),
          InkLink(
            label: 'Để sau',
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    ),
  );
}
