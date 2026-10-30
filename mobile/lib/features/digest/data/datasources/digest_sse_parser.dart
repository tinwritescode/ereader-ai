import 'dart:convert';

class DigestStreamException implements Exception {
  const DigestStreamException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Extracts chunk text from complete SSE frames; comments and `complete` yield nothing.
Iterable<String> parseDigestFrames(String frames) sync* {
  for (final frame in frames.split('\n\n')) {
    final lines = frame.split('\n');
    final event = _field(lines, 'event');
    final data = _field(lines, 'data');
    if (data == null) continue;

    final payload = jsonDecode(data) as Map<String, dynamic>;
    switch (event) {
      case 'chunk':
        yield payload['text'] as String;
      case 'error':
        throw DigestStreamException(payload['message'] as String);
    }
  }
}

String? _field(List<String> lines, String name) {
  final prefix = '$name: ';
  for (final line in lines) {
    if (line.startsWith(prefix)) return line.substring(prefix.length);
  }
  return null;
}
