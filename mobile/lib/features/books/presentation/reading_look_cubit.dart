import 'package:flutter_bloc/flutter_bloc.dart';

import '../domain/entities/reading_look.dart';
import '../domain/repositories/reading_look_store.dart';

class ReadingLookCubit extends Cubit<ReadingLook> {
  ReadingLookCubit(this._store) : super(const ReadingLook());

  final ReadingLookStore _store;

  Future<void> load() async => emit(await _store.load());

  Future<void> change(ReadingLook look) async {
    emit(look);
    await _store.save(look);
  }
}
