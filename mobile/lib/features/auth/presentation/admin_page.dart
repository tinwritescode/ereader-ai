import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/formatting.dart';
import '../domain/account.dart';
import '../domain/auth_repository.dart';
import 'account_widgets.dart';
import 'auth_cubit.dart';

class AdminPage extends StatefulWidget {
  const AdminPage({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (_) => const AdminPage());

  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage> {
  List<ManagedAccount>? _accounts;
  String? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final accounts = await context.read<AuthRepository>().accounts();
      if (mounted) setState(() => _accounts = accounts);
    } on AuthException catch (error) {
      if (mounted) setState(() => _failure = error.code);
    }
  }

  Future<void> _choose(ManagedAccount account, PlanName plan) async {
    final auth = context.read<AuthCubit>();
    try {
      await context.read<AuthRepository>().setPlan(account.id, plan);
      await _load();
      await auth.refresh();
    } on AuthException catch (error) {
      if (mounted) setState(() => _failure = error.code);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accounts = _accounts;
    final failure = _failure;
    return AccountScaffold(
      title: 'Quản trị',
      children: [
        if (failure != null)
          Text(
            errorMessage(failure),
            style: readingStyle(size: 14.5, color: Palette.red),
          ),
        if (accounts == null && failure == null)
          const Center(child: CircularProgressIndicator()),
        for (final account in accounts ?? const <ManagedAccount>[])
          _AccountLine(
            account: account,
            onChoose: (plan) => _choose(account, plan),
          ),
      ],
    );
  }
}

class _AccountLine extends StatelessWidget {
  const _AccountLine({required this.account, required this.onChoose});

  final ManagedAccount account;
  final ValueChanged<PlanName> onChoose;

  String get _note {
    if (account.isSuperAdmin) return 'super admin';
    if (account.requestedPlan case final plan?) return 'muốn lên ${plan.label}';
    return '${account.digestsUsed} chương AI tháng này';
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          account.email,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: readingStyle(size: 14.5, weight: FontWeight.w600),
        ),
        Text(_note, style: handStyle(size: 18)),
        const SizedBox(height: 4),
        SegmentedButton<PlanName>(
          showSelectedIcon: false,
          segments: [
            for (final plan in PlanName.values)
              ButtonSegment(value: plan, label: Text(plan.label)),
          ],
          selected: {account.plan},
          onSelectionChanged: (plans) => onChoose(plans.single),
        ),
      ],
    ),
  );
}
