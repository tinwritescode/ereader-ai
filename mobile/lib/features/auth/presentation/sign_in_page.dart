import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/formatting.dart';
import '../../books/presentation/widgets.dart';
import 'account_widgets.dart';
import 'auth_cubit.dart';

class SignInPage extends StatefulWidget {
  const SignInPage({super.key, this.failure});

  final String? failure;

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthCubit>();
    final failure = widget.failure;
    return Scaffold(
      body: RuledPaper(
        scroll: _scroll,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.only(
              left: marginWidth + 12,
              right: 18,
              bottom: lineHeight,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const BookLabel(
                  fields: [
                    ('Sách', 'eReader AI'),
                    ('Dành cho', 'người ít thời gian'),
                  ],
                ),
                const SizedBox(height: lineHeight),
                if (failure != null) ...[
                  Text(
                    'Chưa đăng nhập được. ${errorMessage(failure)}',
                    style: readingStyle(size: 14.5, color: Palette.red),
                  ),
                  const SizedBox(height: 12),
                ],
                PrimaryButton(label: 'Đăng nhập', onPressed: auth.signIn),
                InkLink(
                  label: 'Tạo tài khoản',
                  onPressed: () => auth.signIn(newAccount: true),
                ),
                const SizedBox(height: 8),
                Text(
                  'Sách và chỗ đang đọc đi theo tài khoản của bạn.',
                  textAlign: TextAlign.center,
                  style: readingStyle(size: 12.5, color: Palette.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
