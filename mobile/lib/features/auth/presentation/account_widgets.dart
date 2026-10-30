import 'package:flutter/material.dart';

import '../../../app/theme.dart';
import '../../books/presentation/widgets.dart';
import 'plans_page.dart';

/// The page's paper, with a way back and its name at the top.
class AccountScaffold extends StatefulWidget {
  const AccountScaffold({
    super.key,
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  State<AccountScaffold> createState() => _AccountScaffoldState();
}

class _AccountScaffoldState extends State<AccountScaffold> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: RuledPaper(
      scroll: _scroll,
      child: SafeArea(
        child: ListView(
          controller: _scroll,
          padding: const EdgeInsets.only(
            left: marginWidth + 12,
            right: 18,
            bottom: lineHeight,
          ),
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Quay lại',
                  padding: EdgeInsets.zero,
                  alignment: Alignment.centerLeft,
                  icon: const Icon(Icons.chevron_left, color: Palette.ink),
                  onPressed: () => Navigator.of(context).pop(),
                ),
                Text(
                  widget.title,
                  style: readingStyle(
                    size: 26,
                    height: onGrid(26) * 2,
                    weight: FontWeight.w600,
                    color: Palette.ink,
                  ),
                ),
              ],
            ),
            ...widget.children,
          ],
        ),
      ),
    ),
  );
}

/// A link written in the ink, for actions quieter than [PrimaryButton].
class InkLink extends StatelessWidget {
  const InkLink({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: onPressed,
    child: Text(
      label,
      style: readingStyle(
        size: 15,
        weight: FontWeight.w600,
        color: Palette.ink,
      ),
    ),
  );
}

/// What stopped the reader, and the ways on. Reading itself is never blocked.
class LimitSheet extends StatelessWidget {
  const LimitSheet({
    super.key,
    required this.title,
    required this.body,
    required this.way,
    required this.onWay,
  });

  final String title;
  final String body;
  final String way;
  final VoidCallback onWay;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: handStyle(size: 24)),
          const SizedBox(height: 8),
          Text(body, style: readingStyle(size: 15, height: 1.55)),
          const SizedBox(height: 16),
          PrimaryButton(label: way, onPressed: onWay),
          InkLink(
            label: 'Xem các gói',
            onPressed: () {
              final navigator = Navigator.of(context)..pop();
              navigator.push(PlansPage.route());
            },
          ),
        ],
      ),
    ),
  );
}
