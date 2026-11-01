import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../auth/presentation/account_widgets.dart';
import '../../books/presentation/widgets.dart';
import '../domain/release.dart';
import 'changelog_cubit.dart';
import 'release_notes.dart';

/// Every version, newest first; opening it counts as having read the newest.
class ChangelogPage extends StatefulWidget {
  const ChangelogPage({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (_) => const ChangelogPage());

  @override
  State<ChangelogPage> createState() => _ChangelogPageState();
}

class _ChangelogPageState extends State<ChangelogPage> {
  final _opened = <String>{};

  @override
  void initState() {
    super.initState();
    final cubit = context.read<ChangelogCubit>();
    // Looked at again in case the list was not reached when the app opened.
    cubit.load().then((_) => cubit.read());
  }

  @override
  Widget build(BuildContext context) {
    final releases = context.watch<ChangelogCubit>().state.releases;
    return AccountScaffold(
      title: 'Có gì mới',
      children: [
        for (final (index, release) in releases.indexed)
          _ReleaseEntry(
            release,
            open: index == 0 || _opened.contains(release.version),
            onOpen: () => setState(() => _opened.add(release.version)),
          ),
      ],
    );
  }
}

class _ReleaseEntry extends StatelessWidget {
  const _ReleaseEntry(this.release, {required this.open, required this.onOpen});

  final Release release;
  final bool open;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final count = release.added.length + release.fixed.length;
    return Container(
      padding: const EdgeInsets.only(top: 18, bottom: 16),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Palette.rule)),
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Written across the margin line, as a page number in a notebook.
          Positioned(
            left: -(marginWidth + 8),
            top: -2,
            child: Transform.rotate(
              angle: -0.1,
              child: Container(
                width: 44,
                color: Palette.paper,
                alignment: Alignment.center,
                child: Text(
                  release.version,
                  style: handStyle(
                    size: 22,
                    color: open ? Palette.red : Palette.muted,
                  ),
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                dateLabel(release.date),
                style: readingStyle(size: 12.5, color: Palette.muted),
              ),
              Text(
                release.title,
                style: readingStyle(
                  size: 18,
                  weight: FontWeight.w600,
                  color: Palette.ink,
                ),
              ),
              if (open) ...[
                ..._group('Mới', release.added, isNew: true),
                ..._group('Sửa', release.fixed, isNew: false),
              ] else
                Align(
                  alignment: Alignment.centerLeft,
                  child: InkLink(
                    label: 'Xem $count thay đổi',
                    onPressed: onOpen,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  List<Widget> _group(String name, List<Note> notes, {required bool isNew}) => [
    if (notes.isNotEmpty) ...[
      const SizedBox(height: 10),
      Text(name, style: handStyle(size: 19)),
      for (final note in notes) NoteLine(note, isNew: isNew),
    ],
  ];
}
