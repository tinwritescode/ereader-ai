import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/bloc/library_bloc.dart';
import '../../books/presentation/widgets.dart';
import 'account_widgets.dart';
import 'admin_page.dart';
import 'auth_cubit.dart';
import 'plans_page.dart';

class AccountPage extends StatefulWidget {
  const AccountPage({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (_) => const AccountPage());

  @override
  State<AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends State<AccountPage> {
  @override
  void initState() {
    super.initState();
    context.read<AuthCubit>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AuthCubit>().state;
    final books = context.watch<LibraryBloc>().state.books.length;
    if (state is! AuthSignedIn) return const SizedBox.shrink();
    final account = state.account;
    final limits = account.limits;
    final resets = 'làm mới ${account.resetLabel}';
    return AccountScaffold(
      title: 'Tài khoản',
      children: [
        Text(account.email, style: readingStyle(size: 15)),
        Text('Gói ${account.plan.label}', style: handStyle(size: 24)),
        const SizedBox(height: 12),
        _Meter(
          name: 'Sách trong thư viện',
          detail: '$books trên ${limits.books} cuốn',
          share: books / limits.books,
        ),
        _Meter(
          name: 'Rút gọn bằng AI',
          detail:
              '${account.digestsUsed} trên ${limits.monthlyDigests} chương, $resets',
          share: account.digestsUsed / limits.monthlyDigests,
        ),
        _Meter(
          name: 'Giọng Vbee',
          detail:
              '${account.vbeeMinutesUsed} trên ${limits.monthlyVbeeMinutes} phút, $resets',
          share: account.vbeeMinutesUsed / limits.monthlyVbeeMinutes,
        ),
        Text(
          'Giọng trên máy và đọc bản gốc không giới hạn.',
          style: readingStyle(size: 13, color: Palette.muted),
        ),
        const SizedBox(height: lineHeight),
        PrimaryButton(
          label: 'Xem các gói',
          onPressed: () => Navigator.of(context).push(PlansPage.route()),
        ),
        if (account.isSuperAdmin)
          InkLink(
            label: 'Quản trị',
            onPressed: () => Navigator.of(context).push(AdminPage.route()),
          ),
        InkLink(
          label: 'Đăng xuất',
          onPressed: context.read<AuthCubit>().signOut,
        ),
      ],
    );
  }
}

/// Usage measured on the app's ruler.
class _Meter extends StatelessWidget {
  const _Meter({required this.name, required this.detail, required this.share});

  final String name;
  final String detail;
  final double share;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          name,
          style: readingStyle(
            size: 14,
            weight: FontWeight.w600,
            color: Palette.ink,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          height: 14,
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(
            color: Palette.ruler,
            border: Border.all(color: Palette.rulerEdge),
            borderRadius: BorderRadius.circular(3),
          ),
          child: FractionallySizedBox(
            widthFactor: share.clamp(0, 1),
            heightFactor: 1,
            child: const ColoredBox(color: Palette.red),
          ),
        ),
        const SizedBox(height: 4),
        Text(detail, style: readingStyle(size: 12.5, color: Palette.muted)),
      ],
    ),
  );
}
