/**
 * 体测标准表（数字化版本 v1.0）
 * 说明：
 *  - 具体分档与阈值以学校体育部公布的《国家学生体质健康标准》实施口径为准；
 *  - 当前表用于弱项诊断与分数贡献分析，阈值为公开标准参考值，可在后台替换为正式数据；
 *  - 每项体测项目映射到若干「能力维度」，维度权重之和为 1。
 */

/** 能力维度字典 */
const ABILITY_DIMENSIONS = [
  {
    key: 'endurance',
    name: '心肺耐力',
    short: '耐力',
    desc: '持续跑动与呼吸节奏控制能力',
    color: '#FF6B2C',
    icon: '🫁'
  },
  {
    key: 'speed',
    name: '速度能力',
    short: '速度',
    desc: '短距离加速与神经募集能力',
    color: '#2E90FA',
    icon: '⚡'
  },
  {
    key: 'lower_power',
    name: '下肢爆发力',
    short: '下肢',
    desc: '蹬伸与跳跃能力',
    color: '#F79009',
    icon: '🦵'
  },
  {
    key: 'upper_strength',
    name: '上肢力量',
    short: '上肢',
    desc: '推、拉与肩带稳定能力',
    color: '#7A5AF8',
    icon: '💪'
  },
  {
    key: 'core',
    name: '核心稳定',
    short: '核心',
    desc: '躯干控制与躯干传导能力',
    color: '#12B76A',
    icon: '🧱'
  },
  {
    key: 'flexibility',
    name: '柔韧性',
    short: '柔韧',
    desc: '后链与关节活动度',
    color: '#06AED4',
    icon: '🤸'
  },
  {
    key: 'coordination',
    name: '协调性',
    short: '协调',
    desc: '动作控制与全身协同能力',
    color: '#EE46BC',
    icon: '🎯'
  }
];

/**
 * 体测项目表
 * weight: 该项目在本校体测总评中的权重（当前按常见口径预置，可调整）
 * tiers: 学生自评档位 -> 分数映射，用于诊断
 */
const EVENTS = [
  {
    event_id: 'run_1000',
    name: '中长跑',
    full_name: '1000 米跑（男）/ 800 米跑（女）',
    short_name: '1000/800 米',
    weight: 0.25,
    unit: '时间',
    dimensions: [
      { key: 'endurance', weight: 0.75 },
      { key: 'lower_power', weight: 0.25 }
    ],
    tiers: [
      { key: 'fail', name: '待提高', score: 50, threshold: '男生 >4′20″ / 女生 >4′12″' },
      { key: 'pass', name: '及格', score: 66, threshold: '男生 ≤4′20″ / 女生 ≤4′12″' },
      { key: 'good', name: '良好', score: 82, threshold: '男生 ≤4′05″ / 女生 ≤3′58″' },
      { key: 'excellent', name: '优秀', score: 92, threshold: '男生 ≤3′55″ / 女生 ≤3′50″' }
    ],
    tips: '关注配速与呼吸节奏，避免起跑过快',
    actions_hint: ['jog_run', 'high_knees', 'sprint_interval']
  },
  {
    event_id: 'run_50',
    name: '50 米跑',
    full_name: '50 米跑',
    short_name: '50 米',
    weight: 0.15,
    unit: '时间',
    dimensions: [
      { key: 'speed', weight: 0.65 },
      { key: 'lower_power', weight: 0.25 },
      { key: 'coordination', weight: 0.1 }
    ],
    tiers: [
      { key: 'fail', name: '待提高', score: 50, threshold: '男生 >9.1″ / 女生 >10.3″' },
      { key: 'pass', name: '及格', score: 66, threshold: '男生 ≤9.1″ / 女生 ≤10.3″' },
      { key: 'good', name: '良好', score: 82, threshold: '男生 ≤8.3″ / 女生 ≤9.5″' },
      { key: 'excellent', name: '优秀', score: 92, threshold: '男生 ≤7.8″ / 女生 ≤9.0″' }
    ],
    tips: '起跑反应与摆臂频率是提分关键',
    actions_hint: ['sprint_interval', 'high_knees', 'jump_squat']
  },
  {
    event_id: 'jump_long',
    name: '立定跳远',
    full_name: '立定跳远',
    short_name: '立定跳远',
    weight: 0.2,
    unit: '距离',
    dimensions: [
      { key: 'lower_power', weight: 0.7 },
      { key: 'coordination', weight: 0.2 },
      { key: 'core', weight: 0.1 }
    ],
    tiers: [
      { key: 'fail', name: '待提高', score: 50, threshold: '男生 <208cm / 女生 <151cm' },
      { key: 'pass', name: '及格', score: 66, threshold: '男生 ≥208cm / 女生 ≥151cm' },
      { key: 'good', name: '良好', score: 82, threshold: '男生 ≥238cm / 女生 ≥181cm' },
      { key: 'excellent', name: '优秀', score: 92, threshold: '男生 ≥258cm / 女生 ≥201cm' }
    ],
    tips: '摆臂与蹬伸要同步，落地注意屈膝缓冲',
    actions_hint: ['jump_squat', 'squat', 'glute_bridge']
  },
  {
    event_id: 'pull_up',
    name: '力量项目',
    full_name: '引体向上（男）/ 1 分钟仰卧起坐（女）',
    short_name: '引体/仰卧起坐',
    weight: 0.2,
    unit: '次数',
    dimensions: [
      { key: 'upper_strength', weight: 0.55 },
      { key: 'core', weight: 0.35 },
      { key: 'coordination', weight: 0.1 }
    ],
    tiers: [
      { key: 'fail', name: '待提高', score: 50, threshold: '男生 <10 个 / 女生 <26 个' },
      { key: 'pass', name: '及格', score: 66, threshold: '男生 ≥10 个 / 女生 ≥26 个' },
      { key: 'good', name: '良好', score: 82, threshold: '男生 ≥15 个 / 女生 ≥40 个' },
      { key: 'excellent', name: '优秀', score: 92, threshold: '男生 ≥19 个 / 女生 ≥50 个' }
    ],
    tips: '力量项目靠「频率 + 离心控制」，每次少量高质量',
    actions_hint: ['pullup', 'scapular_pull', 'band_row', 'crunch']
  },
  {
    event_id: 'sit_reach',
    name: '坐位体前屈',
    full_name: '坐位体前屈',
    short_name: '体前屈',
    weight: 0.1,
    unit: '距离',
    dimensions: [
      { key: 'flexibility', weight: 0.9 },
      { key: 'core', weight: 0.1 }
    ],
    tiers: [
      { key: 'fail', name: '待提高', score: 50, threshold: '男生 <3.7cm / 女生 <6.0cm' },
      { key: 'pass', name: '及格', score: 66, threshold: '男生 ≥3.7cm / 女生 ≥6.0cm' },
      { key: 'good', name: '良好', score: 82, threshold: '男生 ≥17.7cm / 女生 ≥19.5cm' },
      { key: 'excellent', name: '优秀', score: 92, threshold: '男生 ≥21.5cm / 女生 ≥23.5cm' }
    ],
    tips: '每次训练后静态拉伸，单次 20-30 秒，别弹震',
    actions_hint: ['sit_reach_stretch', 'hamstring_stretch', 'cat_cow']
  },
  {
    event_id: 'vital_capacity',
    name: '肺活量',
    full_name: '肺活量',
    short_name: '肺活量',
    weight: 0.1,
    unit: '容量',
    dimensions: [
      { key: 'endurance', weight: 0.6 },
      { key: 'coordination', weight: 0.4 }
    ],
    tiers: [
      { key: 'fail', name: '待提高', score: 50, threshold: '男生 <3100ml / 女生 <2000ml' },
      { key: 'pass', name: '及格', score: 66, threshold: '男生 ≥3100ml / 女生 ≥2000ml' },
      { key: 'good', name: '良好', score: 82, threshold: '男生 ≥3900ml / 女生 ≥2700ml' },
      { key: 'excellent', name: '优秀', score: 92, threshold: '男生 ≥4400ml / 女生 ≥3100ml' }
    ],
    tips: '有氧训练 + 呼吸节奏练习，避免憋气用力',
    actions_hint: ['jog_run', 'jumping_jack', 'high_knees']
  }
];

/** 索引 */
const EVENT_MAP = {};
EVENTS.forEach(function (e) {
  EVENT_MAP[e.event_id] = e;
});

const DIMENSION_MAP = {};
ABILITY_DIMENSIONS.forEach(function (d) {
  DIMENSION_MAP[d.key] = d;
});

/** 全部能力维度 */
function getDimensions() {
  return ABILITY_DIMENSIONS.slice();
}

/** 按 key 取维度 */
function getDimension(key) {
  return DIMENSION_MAP[key] || null;
}

/** 按 id 取体测项目 */
function getEvent(eventId) {
  return EVENT_MAP[eventId] || null;
}

/** 全部体测项目 */
function getEvents() {
  return EVENTS.map(function (e) {
    return {
      event_id: e.event_id,
      name: e.name,
      full_name: e.full_name,
      short_name: e.short_name,
      weight: e.weight,
      tiers: e.tiers,
      tips: e.tips,
      dimensions: e.dimensions
    };
  });
}

/** 取某档位 */
function getTier(eventId, tierKey) {
  const ev = getEvent(eventId);
  if (!ev) return null;
  for (let i = 0; i < ev.tiers.length; i++) {
    if (ev.tiers[i].key === tierKey) return ev.tiers[i];
  }
  return null;
}

/** 下一个更高档位（没有则返回 null） */
function getNextTier(eventId, tierKey) {
  const tier = getTier(eventId, tierKey);
  if (!tier) return null;
  const ev = getEvent(eventId);
  const higher = ev.tiers.filter(function (t) {
    return t.score > tier.score;
  });
  higher.sort(function (a, b) {
    return a.score - b.score;
  });
  return higher.length ? higher[0] : null;
}

/** 根据分数反查档位名称 */
function tierNameByScore(score) {
  if (score >= 90) return '优秀';
  if (score >= 80) return '良好';
  if (score >= 60) return '及格';
  return '待提高';
}

/** 操作提示文本 */
function getEventTips(eventId) {
  const ev = getEvent(eventId);
  return ev ? ev.tips : '';
}

module.exports = {
  ABILITY_DIMENSIONS: ABILITY_DIMENSIONS,
  EVENTS: EVENTS,
  getDimensions: getDimensions,
  getDimension: getDimension,
  getEvent: getEvent,
  getEvents: getEvents,
  getTier: getTier,
  getNextTier: getNextTier,
  tierNameByScore: tierNameByScore,
  getEventTips: getEventTips
};
