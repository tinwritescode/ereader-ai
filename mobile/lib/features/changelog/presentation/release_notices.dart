import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../auth/presentation/auth_cubit.dart';
import '../../tasks/presentation/task_notices.dart';
import 'changelog_cubit.dart';
import 'release_sheet.dart';

/// After an update, tells the signed-in reader once what the new version brings.
class ReleaseNotices extends StatelessWidget {
  const ReleaseNotices({super.key, required this.child});

  final Widget child;

  Future<void> _tell(BuildContext context, ChangelogState state) async {
    final release = state.announce;
    final at = appNavigator.currentContext;
    if (release == null || at == null) return;
    final cubit = context.read<ChangelogCubit>();
    // Read before the sheet closes: an app killed meanwhile must not show it again.
    await cubit.read();
    if (at.mounted) await showReleaseSheet(at, release);
  }

  @override
  Widget build(BuildContext context) => MultiBlocListener(
    listeners: [
      BlocListener<AuthCubit, AuthState>(
        listenWhen: (before, after) =>
            before is! AuthSignedIn && after is AuthSignedIn,
        listener: (context, _) => context.read<ChangelogCubit>().load(),
      ),
      BlocListener<ChangelogCubit, ChangelogState>(
        listenWhen: (before, after) =>
            before.announce == null && after.announce != null,
        listener: _tell,
      ),
    ],
    child: child,
  );
}
