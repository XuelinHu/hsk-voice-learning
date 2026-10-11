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

const missionLabConfig = HskAppConfig(
  title: 'HSK 口语任务站',
  subtitle: '用真实任务推进中文表达',
  applicationId: 'com.hskvoice.hsk_mission_lab',
  oidcClientId: 'hsk-mission-lab-android',
  oidcRedirectUrl: 'hskmissionlab:/oauth2redirect',
  oidcIssuer: 'https://192.168.1.9:8042/realms/front',
  primary: Color(0xFFD4483F),
  secondary: Color(0xFFE5B931),
  isMission: true,
  scenarios: <String>['火车站购票', '商店退换商品', '向朋友介绍家乡', '预约医生', '求职面试', '自由挑战'],
);
