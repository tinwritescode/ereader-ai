import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'app/theme.dart';
import 'features/books/data/datasources/epub_picker.dart';
import 'features/books/data/repositories/books_repository_impl.dart';
import 'features/books/domain/repositories/books_repository.dart';
import 'features/books/presentation/bloc/library_bloc.dart';
import 'features/books/presentation/length_memory.dart';
import 'features/books/presentation/pages/library_page.dart';
import 'features/listen/data/kokoro_speech.dart';
import 'features/listen/domain/speech.dart';

const _apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);
// Until auth lands, the backend takes the user id as a form field.
const _userId = String.fromEnvironment('USER_ID', defaultValue: 'demo-user');

void main() {
  runApp(
    EReaderApp(
      repository: BooksRepositoryImpl(
        Dio(BaseOptions(baseUrl: _apiBaseUrl)),
        userId: _userId,
      ),
      speech: KokoroSpeech(),
      pickEpub: pickEpubFromDevice,
    ),
  );
}

class EReaderApp extends StatelessWidget {
  const EReaderApp({
    super.key,
    required this.repository,
    required this.speech,
    required this.pickEpub,
  });

  final BooksRepository repository;
  final Speech speech;
  final PickEpub pickEpub;

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: repository),
        RepositoryProvider.value(value: speech),
        RepositoryProvider(create: (_) => LengthMemory()),
      ],
      child: BlocProvider(
        create: (_) =>
            LibraryBloc(repository: repository, pickEpub: pickEpub)
              ..add(const LibraryStarted()),
        child: MaterialApp(
          title: 'eReader AI',
          theme: buildTheme(),
          home: const LibraryPage(),
        ),
      ),
    );
  }
}
