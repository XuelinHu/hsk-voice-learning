import 'package:flutter/widgets.dart';

import 'app.dart';
import 'app_config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const HskVoiceApp(config: dialogueStudioConfig));
}
