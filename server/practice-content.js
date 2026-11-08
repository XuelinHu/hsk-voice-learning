export const PRACTICE_SOURCES = [
  { label: 'HSK 官方考试介绍与样题入口', url: 'https://www.chinesetest.cn/HSK', kind: 'official-reference' },
  { label: 'New HSK 1 模考卷 1（PDF）', url: 'https://chinesemocktest.com/public/pdf/new-hsk1-test1.pdf', kind: 'public-practice-reference' },
  { label: 'New HSK 2 模考卷 1（PDF）', url: 'https://chinesemocktest.com/public/pdf/new-hsk2-test1.pdf', kind: 'public-practice-reference' },
  { label: 'New HSK 3 模考卷 1（PDF）', url: 'https://chinesemocktest.com/public/pdf/new-hsk3-test1.pdf', kind: 'public-practice-reference' },
  { label: 'New HSK 4 模考卷 1（PDF）', url: 'https://chinesemocktest.com/public/pdf/new-hsk4-test1.pdf', kind: 'public-practice-reference' },
  { label: 'HSK 模考在线练习', url: 'https://hskai.online/', kind: 'public-practice-reference' },
];

export const BUILT_IN_QUESTIONS = [
  { id: 'sample-l1', level: 1, section: 'listening', question: '听录音：小王，你喝茶还是喝咖啡？问：小王可以选择什么？', options: ['茶或咖啡', '水或牛奶', '米饭或面条'], answer: 1, explanation: '“还是”用于选择疑问句，选项是茶和咖啡。', audioText: '小王，你喝茶还是喝咖啡？', source: '原创练习，参考 HSK 听力选择题结构' },
  { id: 'sample-l2', level: 2, section: 'listening', question: '听录音：明天天气很好，我们一起去公园吧。问：他们明天要做什么？', options: ['去公园', '去医院', '去机场'], answer: 1, explanation: '“一起去公园”直接说明了计划。', audioText: '明天天气很好，我们一起去公园吧。', source: '原创练习，参考 HSK 听力理解题结构' },
  { id: 'sample-l3', level: 3, section: 'listening', question: '听录音：小李，报告我已经发到你的邮箱了。你看完以后，如果有问题，下午开会时我们再讨论。问：他们什么时候讨论？', options: ['今天上午', '今天下午', '明天上午'], answer: 2, explanation: '对话明确说“下午开会时再讨论”。', audioText: '小李，报告我已经发到你的邮箱了。你看完以后，如果有问题，下午开会时我们再讨论。', source: '原创练习，参考 HSK 听力对话题结构' },
  { id: 'sample-l4', level: 4, section: 'listening', question: '听录音：由于道路施工，原定从东门进入的安排临时取消，请参观者改从南门排队入场。问：参观者应该从哪里进入？', options: ['东门', '北门', '南门'], answer: 3, explanation: '通知要求改从南门排队入场。', audioText: '由于道路施工，原定从东门进入的安排临时取消，请参观者改从南门排队入场。', source: '原创练习，参考 HSK 听力通知题结构' },
  { id: 'sample-r3', level: 3, section: 'reading', question: '我每天七点起床，八点到公司。周末不上班，喜欢和朋友打球。问：他周末喜欢做什么？', options: ['看电影', '打球', '上班'], answer: 2, explanation: '文章最后一句给出了答案。', audioText: '', source: '原创练习，参考 HSK 阅读短文理解题结构' },
  { id: 'sample-r4', level: 4, section: 'reading', question: '为了提高效率，会议开始前请大家提前阅读材料，并把问题记录下来。问：会议前应该做什么？', options: ['准备材料和记录问题', '取消会议', '晚点到达'], answer: 1, explanation: '“提前阅读材料，并把问题记录下来”是明确要求。', audioText: '', source: '原创练习，参考 HSK 阅读信息提取题结构' },
  { id: 'sample-s2', level: 2, section: 'speaking', question: '请用中文介绍你的家乡，并说一个你喜欢的地方。', options: ['我的家乡是……我最喜欢……', '我昨天吃了米饭。', '现在几点了？'], answer: 1, explanation: '建议使用第一句型完成两句话，并说明地点与理由。', audioText: '请用中文介绍你的家乡，并说一个你喜欢的地方。', source: '原创口语任务，参考 HSK 口语表达练习' },
  { id: 'sample-s3', level: 3, section: 'speaking', question: '在餐厅向服务员说明：你想要一杯热茶，少放糖。', options: ['请给我一杯热茶，少放一点糖，谢谢。', '我从来没去过那个地方。', '今天比昨天冷。'], answer: 1, explanation: '使用“请给我……，少放……”表达具体需求。', audioText: '在餐厅向服务员说明：你想要一杯热茶，少放糖。', source: '原创口语任务，参考 HSK 情景表达练习' },
];
