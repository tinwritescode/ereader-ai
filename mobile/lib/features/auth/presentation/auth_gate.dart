import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/theme.dart';
import '../../books/presentation/bloc/library_bloc.dart';
import '../../books/presentation/pages/library_page.dart';
import '../../listen/presentation/listen_bloc.dart';
import 'account_widgets.dart';
import 'auth_cubit.dart';
import 'sign_in_page.dart';

/// Shows the library to a signed-in reader, and the door to everyone else.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  void _onChange(BuildContext context, AuthState state) {
    final library = context.read<LibraryBloc>();
    if (state is AuthSignedIn) {
      library.add(const LibraryStarted());
    } else {
      // The next account on this device must not see or hear the last one's books.
      library.add(const LibraryCleared());
      context.read<ListenBloc>().add(const ListenStopped());
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  @override
  Widget build(BuildContext context) => BlocConsumer<AuthCubit, AuthState>(
    listenWhen: (previous, current) =>
        (previous is AuthSignedIn) != (current is AuthSignedIn),
    listener: _onChange,
    buildWhen: (previous, current) =>
        previous.runtimeType != current.runtimeType || current is AuthSignedOut,
    builder: (context, state) => switch (state) {
      AuthChecking() => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      AuthSignedOut(:final failure) => SignInPage(failure: failure),
      AuthUnreachable() => Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Không kết nối được máy chủ.',
                style: readingStyle(size: 15),
              ),
              InkLink(
                label: 'Thử lại',
                onPressed: context.read<AuthCubit>().start,
              ),
            ],
          ),
        ),
      ),
      AuthSignedIn() => const LibraryPage(),
    },
  );
}
