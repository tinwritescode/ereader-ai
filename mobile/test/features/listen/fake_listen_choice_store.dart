import 'package:ereader_mobile/features/listen/domain/listen_choice.dart';

class FakeListenChoiceStore implements ListenChoiceStore {
  FakeListenChoiceStore([this.saved]);

  ListenChoice? saved;

  @override
  Future<ListenChoice?> load() async => saved;

  @override
  Future<void> save(ListenChoice choice) async => saved = choice;
}
