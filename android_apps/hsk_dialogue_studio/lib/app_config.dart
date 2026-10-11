import 'package:flutter/material.dart';

class HskAppConfig {
  const HskAppConfig({
    required this.title,
    required this.subtitle,
    required this.applicationId,
    required this.oidcClientId,
    required this.oidcRedirectUrl,
    required this.oidcIssuer,
    required this.primary,
    required this.secondary,
    required this.isMission,
    required this.scenarios,
  });

  final String title;
  final String subtitle;
  final String applicationId;
  final String oidcClientId;
  final String oidcRedirectUrl;
  final String oidcIssuer;
  final Color primary;
  final Color secondary;
  final bool isMission;
  final List<String> scenarios;
}

const dialogueStudioConfig = HskAppConfig(
  title: 'HSK 对话研习室',
  subtitle: '沉浸式中文场景会话',
  applicationId: 'com.hskvoice.hsk_dialogue_studio',
  oidcClientId: 'hsk-dialogue-studio-android',
  oidcRedirectUrl: 'hskdialoguestudio:/oauth2redirect',
  oidcIssuer: 'https://192.168.1.9:8042/realms/front',
  primary: Color(0xFF176B4B),
  secondary: Color(0xFFE06E43),
  isMission: false,
  scenarios: <String>['咖啡店点单', '初次见面', '询问路线', '看病挂号', '求职面试', '自由对话'],
);
