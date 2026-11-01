import 'package:ereader_mobile/features/changelog/presentation/changelog_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_changelog.dart';

void main() {
  late FakeChangelog changelog;
  late FakeSeenStore store;
  late ChangelogCubit cubit;

  setUp(() {
    changelog = FakeChangelog()
      ..releases = [release('1.1.0'), release('1.0.0')];
    store = FakeSeenStore();
    cubit = ChangelogCubit(changelog, store);
  });

  tearDown(() => cubit.close());

  test(
    'tells nothing on a first install, and counts the newest as seen',
    () async {
      await cubit.load();
      expect(cubit.state.announce, isNull);
      expect(cubit.state.unseen, isFalse);
      expect(store.seen, '1.1.0');
    },
  );

  test('tells of a new version once, after an update', () async {
    store.seen = '1.0.0';
    await cubit.load();
    expect(cubit.state.announce?.version, '1.1.0');
    expect(cubit.state.unseen, isTrue);

    await cubit.read();
    expect(cubit.state.announce, isNull);
    expect(cubit.state.unseen, isFalse);

    final again = ChangelogCubit(changelog, store);
    await again.load();
    expect(again.state.announce, isNull);
    await again.close();
  });

  test(
    'does not interrupt reading for a version of fixes only, but still marks it new',
    () async {
      changelog.releases = [release('1.0.1', added: false), release('1.0.0')];
      store.seen = '1.0.0';
      await cubit.load();
      expect(cubit.state.announce, isNull);
      expect(cubit.state.unseen, isTrue);
    },
  );

  test('keeps quiet when the changelog cannot be reached', () async {
    changelog.fails = true;
    store.seen = '1.0.0';
    await cubit.load();
    expect(cubit.state.releases, isEmpty);
    expect(cubit.state.announce, isNull);
    expect(store.seen, '1.0.0');
  });
}
