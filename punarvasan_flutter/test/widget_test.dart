import 'package:flutter_test/flutter_test.dart';
import 'package:punarvasan_flutter/main.dart';

void main() {
  testWidgets('shows the Punarvasan sign-in screen', (tester) async {
    await tester.pumpWidget(const PunarvasanApp());

    expect(find.text('Punarvasan Portal • पुनर्वसन'), findsOneWidget);
    expect(find.text('Welcome Back'), findsOneWidget);
    expect(find.text('Register New Account'), findsOneWidget);
  });
}
