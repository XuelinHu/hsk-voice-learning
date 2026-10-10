import 'package:flutter/material.dart';

class HskAppConfig {
  const HskAppConfig({
    required this.title,
    required this.subtitle,
    required this.applicationId,
    required this.primary,
    required this.secondary,
    required this.isMission,
    required this.scenarios,
  });

  final String title;
  final String subtitle;
  final String applicationId;
  final Color primary;
  final Color secondary;
  final bool isMission;
  final List<String> scenarios;
}

const dialogueStudioConfig = HskAppConfig(
  title: 'HSK 对话研习室',
  subtitle: '沉浸式中文场景会话',
  applicationId: 'com.hskvoice.hsk_dialogue_studio',
  primary: Color(0xFF176B4B),
  secondary: Color(0xFFE06E43),
  isMission: false,
  scenarios: <String>['咖啡店点单', '初次见面', '询问路线', '看病挂号', '求职面试', '自由对话'],
);
