import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'app/theme.dart';
import 'features/auth/data/auth_repository_impl.dart';
import 'features/auth/data/session.dart';
import 'features/auth/domain/auth_repository.dart';
import 'features/auth/presentation/auth_cubit.dart';
import 'features/auth/presentation/auth_gate.dart';
import 'features/books/data/datasources/epub_picker.dart';
import 'features/books/data/repositories/books_repository_impl.dart';
import 'features/books/data/repositories/prefs_reading_look_store.dart';
import 'features/books/data/repositories/prefs_reading_spot_store.dart';
import 'features/books/domain/repositories/books_repository.dart';
import 'features/books/domain/repositories/reading_look_store.dart';
import 'features/books/domain/repositories/reading_spot_store.dart';
import 'features/books/presentation/bloc/library_bloc.dart';
import 'features/books/presentation/length_memory.dart';
import 'features/books/presentation/listen_spots.dart';
import 'features/books/presentation/reading_look_cubit.dart';
import 'features/books/presentation/reading_spots_cubit.dart';
import 'features/listen/data/prefs_listen_choice_store.dart';
import 'features/listen/domain/listen_choice.dart';
import 'features/listen/data/cloud_voices.dart';
import 'features/listen/data/nano_speech.dart';
import 'features/listen/domain/speech.dart';
import 'features/listen/presentation/listen_bloc.dart';
import 'features/tasks/data/prefs_task_notice_store.dart';
import 'features/tasks/data/tasks_repository_impl.dart';
import 'features/tasks/domain/chapter_task.dart';
import 'features/tasks/presentation/task_notices.dart';
import 'features/tasks/presentation/tasks_cubit.dart';

const _apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);
// Public by design: it names the app to WorkOS, and proves nothing.
const _workosClientId = String.fromEnvironment(
  'WORKOS_CLIENT_ID',
  defaultValue: 'client_01M67FFC6E3B7C550FF1SJ7XYM',
);

void main() {
  final options = BaseOptions(baseUrl: _apiBaseUrl);
  final auth = Dio(options);
  final session = Session(KeychainTokenStore(), auth);
  final api = Dio(options);
  api.interceptors.add(SessionInterceptor(session, api));
  runApp(
    EReaderApp(
      auth: AuthRepositoryImpl(
        api: api,
        auth: auth,
        session: session,
        clientId: _workosClientId,
      ),
      repository: BooksRepositoryImpl(api),
      speech: NanoSpeech(cloud: CloudVoices(api)),
      looks: PrefsReadingLookStore(),
      listenChoices: PrefsListenChoiceStore(),
      spots: PrefsReadingSpotStore(),
      pickEpub: pickEpubFromDevice,
      tasks: TasksRepositoryImpl(api),
      taskNotices: PrefsTaskNoticeStore(),
    ),
  );
}

class EReaderApp extends StatelessWidget {
  const EReaderApp({
    super.key,
    required this.auth,
    required this.repository,
    required this.speech,
    required this.looks,
    required this.listenChoices,
    required this.spots,
    required this.pickEpub,
    required this.tasks,
    required this.taskNotices,
  });

  final AuthRepository auth;
  final BooksRepository repository;
  final Speech speech;
  final ReadingLookStore looks;
  final ListenChoiceStore listenChoices;
  final ReadingSpotStore spots;
  final PickEpub pickEpub;
  final TasksRepository tasks;
  final TaskNoticeStore taskNotices;

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: auth),
        RepositoryProvider.value(value: repository),
        RepositoryProvider.value(value: speech),
        RepositoryProvider.value(value: tasks),
        RepositoryProvider(create: (_) => LengthMemory()),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider(create: (_) => AuthCubit(auth)..start()),
          BlocProvider(
            create: (_) =>
                LibraryBloc(repository: repository, pickEpub: pickEpub),
          ),
          BlocProvider(create: (_) => TasksCubit(tasks, taskNotices)),
          BlocProvider(create: (_) => ReadingLookCubit(looks)..load()),
          BlocProvider(create: (_) => ReadingSpotsCubit(spots)..load()),
          // Lives above the pages: the voice goes on when a book is closed.
          BlocProvider(
            create: (_) => ListenBloc(speech, choices: listenChoices),
          ),
        ],
        child: ListenSpots(
          child: MaterialApp(
            title: 'eReader AI',
            debugShowCheckedModeBanner: false,
            theme: buildTheme(),
            navigatorKey: appNavigator,
            builder: (_, child) => TaskNotices(child: child!),
            home: const AuthGate(),
          ),
        ),
      ),
    );
  }
}
