import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'app/theme.dart';
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
import 'features/books/presentation/pages/library_page.dart';
import 'features/books/presentation/reading_look_cubit.dart';
import 'features/books/presentation/reading_spots_cubit.dart';
import 'features/listen/data/kokoro_speech.dart';
import 'features/listen/data/vbee_voices.dart';
import 'features/listen/domain/speech.dart';
import 'features/listen/presentation/listen_bloc.dart';

const _apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);
// Until auth lands, the backend takes the user id as a form field.
const _userId = String.fromEnvironment('USER_ID', defaultValue: 'demo-user');

void main() {
  final api = Dio(BaseOptions(baseUrl: _apiBaseUrl));
  runApp(
    EReaderApp(
      repository: BooksRepositoryImpl(api, userId: _userId),
      speech: KokoroSpeech(vbee: VbeeVoices(api)),
      looks: PrefsReadingLookStore(),
      spots: PrefsReadingSpotStore(),
      pickEpub: pickEpubFromDevice,
    ),
  );
}

class EReaderApp extends StatelessWidget {
  const EReaderApp({
    super.key,
    required this.repository,
    required this.speech,
    required this.looks,
    required this.spots,
    required this.pickEpub,
  });

  final BooksRepository repository;
  final Speech speech;
  final ReadingLookStore looks;
  final ReadingSpotStore spots;
  final PickEpub pickEpub;

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: repository),
        RepositoryProvider.value(value: speech),
        RepositoryProvider(create: (_) => LengthMemory()),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider(
            create: (_) =>
                LibraryBloc(repository: repository, pickEpub: pickEpub)
                  ..add(const LibraryStarted()),
          ),
          BlocProvider(create: (_) => ReadingLookCubit(looks)..load()),
          BlocProvider(create: (_) => ReadingSpotsCubit(spots)..load()),
          // Lives above the pages: the voice goes on when a book is closed.
          BlocProvider(create: (_) => ListenBloc(speech)),
        ],
        child: ListenSpots(
          child: MaterialApp(
            title: 'eReader AI',
            debugShowCheckedModeBanner: false,
            theme: buildTheme(),
            home: const LibraryPage(),
          ),
        ),
      ),
    );
  }
}
