import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../auth/presentation/account_widgets.dart';
import '../../books/presentation/widgets.dart';
import '../domain/release.dart';
import 'changelog_page.dart';
import 'release_notes.dart';

/// Shown once after an update: only what is new, at most three notes.
Future<void> showReleaseSheet(BuildContext context, Release release) async {
  final more = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Palette.sheet,
    builder: (context) => _ReleaseSheet(release),
  );
  if (more == true && context.mounted) {
    await Navigator.of(context).push(ChangelogPage.route());
  }
}

class _ReleaseSheet extends StatelessWidget {
  const _ReleaseSheet(this.release);

  final Release release;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(22, 20, 22, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Transform.rotate(
              angle: -0.05,
              alignment: Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.transparent,
                      Palette.marker,
                      Palette.marker,
                    ],
                    stops: [0, .58, .58, 1],
                  ),
                ),
                child: Text(
                  'Bản ${release.version}',
                  style: handStyle(size: 34),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            release.title,
            style: readingStyle(
              size: 20,
              weight: FontWeight.w600,
              color: Palette.ink,
            ),
          ),
          const SizedBox(height: 4),
          for (final note in release.added.take(3))
            Text(plainNote(note), style: readingStyle(size: 15, height: 1.5)),
          const SizedBox(height: 16),
          PrimaryButton(
            label: 'Đọc tiếp',
            onPressed: () => Navigator.of(context).pop(false),
          ),
          InkLink(
            label: 'Xem các bản trước',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    ),
  );
}
