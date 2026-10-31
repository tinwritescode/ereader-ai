enum PlanName {
  free('Free'),
  plus('Plus'),
  max('Max');

  const PlanName(this.label);

  final String label;
}

class PlanLimits {
  const PlanLimits({
    required this.books,
    required this.monthlyDigests,
    required this.monthlyVbeeMinutes,
    required this.chapterVoice,
  });

  final int books;
  final int monthlyDigests;
  final int monthlyVbeeMinutes;

  /// May prepare a whole chapter's audio ahead of listening.
  final bool chapterVoice;
}

class Account {
  const Account({
    required this.email,
    required this.isSuperAdmin,
    required this.plan,
    required this.requestedPlan,
    required this.digestsUsed,
    required this.vbeeMinutesUsed,
    required this.resetsOn,
    required this.plans,
  });

  final String email;
  final bool isSuperAdmin;
  final PlanName plan;
  final PlanName? requestedPlan;
  final int digestsUsed;
  final int vbeeMinutesUsed;

  /// The day the monthly counters start again.
  final DateTime resetsOn;
  final Map<PlanName, PlanLimits> plans;

  PlanLimits get limits => plans[plan]!;

  /// How people read the reset day, e.g. "ngày 1/12".
  String get resetLabel => 'ngày ${resetsOn.day}/${resetsOn.month}';
}

/// One line of the super admin's list.
class ManagedAccount {
  const ManagedAccount({
    required this.id,
    required this.email,
    required this.isSuperAdmin,
    required this.plan,
    required this.requestedPlan,
    required this.digestsUsed,
  });

  final String id;
  final String email;
  final bool isSuperAdmin;
  final PlanName plan;
  final PlanName? requestedPlan;
  final int digestsUsed;
}
