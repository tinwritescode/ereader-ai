import 'package:flutter_bloc/flutter_bloc.dart';

import '../domain/entities/reading_spot.dart';
import '../domain/repositories/reading_spot_store.dart';

/// Where reading stopped in each book, by book id, the latest last.
class ReadingSpotsCubit extends Cubit<Map<String, ReadingSpot>> {
  ReadingSpotsCubit(this._store) : super(const {});

  final ReadingSpotStore _store;

  Future<void> load() async => emit(await _store.load());

  Future<void> record(String bookId, ReadingSpot spot) => _change(
    {...state}
      ..remove(bookId)
      ..[bookId] = spot,
  );

  /// The book is read to the end: nothing is left to continue.
  Future<void> clear(String bookId) => _change({...state}..remove(bookId));

  Future<void> _change(Map<String, ReadingSpot> spots) async {
    emit(spots);
    await _store.save(spots);
  }
}
