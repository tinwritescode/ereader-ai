import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/widgets.dart';
import '../domain/account.dart';
import 'account_widgets.dart';
import 'auth_cubit.dart';

/// "1.500", the way Vietnamese writes thousands.
String _count(int value) => value >= 1000
    ? '${value ~/ 1000}.${(value % 1000).toString().padLeft(3, '0')}'
    : '$value';

class PlansPage extends StatelessWidget {
  const PlansPage({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (_) => const PlansPage());

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AuthCubit>().state;
    if (state is! AuthSignedIn) return const SizedBox.shrink();
    final account = state.account;
    return AccountScaffold(
      title: 'Các gói',
      children: [
        for (final plan in PlanName.values)
          _PlanCard(plan: plan, account: account),
      ],
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.account});

  final PlanName plan;
  final Account account;

  @override
  Widget build(BuildContext context) {
    final limits = account.plans[plan]!;
    final current = plan == account.plan;
    final higher = plan.index > account.plan.index;
    final requested = plan == account.requestedPlan;
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Palette.sheet,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: current ? Palette.red : Palette.ink,
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                plan.label,
                style: readingStyle(
                  size: 18,
                  weight: FontWeight.w600,
                  color: Palette.ink,
                ),
              ),
              if (current) Text('đang dùng', style: handStyle(size: 18)),
            ],
          ),
          const SizedBox(height: 4),
          for (final line in [
            '${_count(limits.books)} cuốn sách',
            '${_count(limits.monthlyDigests)} chương AI mỗi tháng',
            '${_count(limits.monthlyVbeeMinutes)} phút giọng qua mạng mỗi tháng',
          ])
            Text(line, style: readingStyle(size: 14, height: 1.6)),
          if (requested)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('đã gửi yêu cầu', style: handStyle(size: 18)),
            )
          else if (higher) ...[
            const SizedBox(height: 10),
            PrimaryButton(
              label: 'Yêu cầu nâng gói',
              onPressed: () => context.read<AuthCubit>().requestPlan(plan),
            ),
          ],
        ],
      ),
    );
  }
}
