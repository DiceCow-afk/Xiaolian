/**
 * 表单选项 / 枚举字典（前端与 mock、后端 Schema 共用的静态口径）
 * 说明：这里只放稳定的枚举与中文标签，业务规则放 data/rules.js。
 */

const GENDER_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' }
];

/** 体测项目（当前覆盖 5 项，可按学校体育部标准扩展） */
const EVENT_OPTIONS = [
  { value: 'run_1000', label: '中长跑', desc: '1000 米（男）/ 800 米（女）' },
  { value: 'run_50', label: '50 米跑', desc: '短距离速度' },
  { value: 'jump_long', label: '立定跳远', desc: '下肢爆发力' },
  { value: 'pull_up', label: '力量项目', desc: '引体向上（男）/ 仰卧起坐（女）' },
  { value: 'sit_reach', label: '坐位体前屈', desc: '柔韧性' },
  { value: 'vital_capacity', label: '肺活量', desc: '呼吸机能' }
];

/** 单项成绩自评档位 */
const EVENT_LEVEL_OPTIONS = [
  { value: 'fail', label: '待提高', desc: '未达及格线或接近及格' },
  { value: 'pass', label: '及格', desc: '刚过及格线' },
  { value: 'good', label: '良好', desc: '稳定在良好档' },
  { value: 'excellent', label: '优秀', desc: '优秀档' }
];

/** 整体运动基础自评 */
const SELF_LEVEL_OPTIONS = [
  { value: 'weak', label: '刚开始练', desc: '很少运动，动作基础弱' },
  { value: 'average', label: '有一定基础', desc: '每周偶尔运动' },
  { value: 'strong', label: '经常运动', desc: '有稳定训练习惯' }
];

/** 可用器械（多选） */
const EQUIPMENT_OPTIONS = [
  { value: 'none', label: '无器械', desc: '徒手' },
  { value: 'bottle', label: '矿泉水瓶', desc: '可当小哑铃' },
  { value: 'band', label: '弹力带', desc: '便携抗阻' },
  { value: 'bar', label: '单杠', desc: '操场/体育馆' }
];

/** 训练空间（单选） */
const SPACE_OPTIONS = [
  { value: 'dorm', label: '宿舍 / 室内', desc: '瑜伽垫、床沿、墙面' },
  { value: 'track', label: '操场 / 户外', desc: '跑道、草地、台阶' },
  { value: 'gym', label: '健身房 / 器械区', desc: '器械与杠铃' }
];

/** 单次训练时长（分钟） */
const TIME_OPTIONS = [
  { value: 15, label: '15 分钟', desc: '碎片时间' },
  { value: 30, label: '30 分钟', desc: '常规训练' },
  { value: 45, label: '45 分钟', desc: '完整训练' }
];

/** 身体限制（多选，可只选“无”） */
const BODY_LIMIT_OPTIONS = [
  { value: 'none', label: '无限制' },
  { value: 'knee', label: '膝盖不适' },
  { value: 'shoulder', label: '肩颈不适' },
  { value: 'waist', label: '腰部不适' }
];

/** 训练目标 */
const GOAL_OPTIONS = [
  { value: 'score_up', label: '提升体测分数' },
  { value: 'pass', label: '先达标' },
  { value: 'maintain', label: '保持状态' }
];

/** 每周训练次数可选范围 */
const FREQUENCY_RANGE = { min: 2, max: 5, default: 3 };

/** 打卡完成状态 */
const CHECKIN_STATUS_OPTIONS = [
  { value: 'done', label: '完成', desc: '按计划全部完成' },
  { value: 'partial', label: '部分完成', desc: '完成了一部分动作' },
  { value: 'skipped', label: '跳过', desc: '今天没有训练' }
];

/** 不适反馈（多选） */
const DISCOMFORT_OPTIONS = [
  { value: 'none', label: '没有不适' },
  { value: 'knee', label: '膝盖' },
  { value: 'shoulder', label: '肩颈' },
  { value: 'waist', label: '腰部' },
  { value: 'other', label: '其他' }
];

/** RPE 主观用力程度（1-10） */
const RPE_LEVELS = [
  { value: 1, label: '非常轻松' },
  { value: 2, label: '很轻松' },
  { value: 3, label: '轻松' },
  { value: 4, label: '比较轻松' },
  { value: 5, label: '适中' },
  { value: 6, label: '有点累' },
  { value: 7, label: '吃力' },
  { value: 8, label: '很吃力' },
  { value: 9, label: '非常吃力' },
  { value: 10, label: '力竭' }
];

/** 周反馈整体感受 */
const FEEL_OPTIONS = [
  { value: 'easy', label: '偏轻松', desc: '还有余力，可以加一点' },
  { value: 'ok', label: '刚刚好', desc: '节奏合适' },
  { value: 'hard', label: '偏累', desc: '恢复不过来，需要减量' }
];

/** 睡眠 / 恢复自评 1-5 */
const RECOVERY_OPTIONS = [
  { value: 1, label: '很差' },
  { value: 2, label: '较差' },
  { value: 3, label: '一般' },
  { value: 4, label: '良好' },
  { value: 5, label: '很好' }
];

/** 饮食：训练类型 */
const TRAINING_TYPE_OPTIONS = [
  { value: 'strength', label: '力量训练日' },
  { value: 'cardio', label: '心肺 / 跑动日' },
  { value: 'mobility', label: '柔韧 / 恢复日' },
  { value: 'rest', label: '休息日' }
];

/** 饮食维度 */
const DIET_DIMENSIONS = [
  {
    key: 'protein',
    name: '蛋白质',
    desc: '训练后修复肌肉，食堂常见来源是否够',
    icon: '🥚'
  },
  {
    key: 'carb',
    name: '碳水化合物',
    desc: '训练日供能，主食是否吃够',
    icon: '🍚'
  }
];

/** 周期阶段元数据 */
const PHASE_META = {
  base: {
    key: 'base',
    name: '准备期',
    short: '准备',
    color: '#2E90FA',
    desc: '建立动作基础与训练习惯，控制强度'
  },
  build: {
    key: 'build',
    name: '进展期',
    short: '进展',
    color: '#FF6B2C',
    desc: '提高训练量与强度，主攻弱项'
  },
  taper: {
    key: 'taper',
    name: '减量期',
    short: '减量',
    color: '#12B76A',
    desc: '体测前减量 30%-50%，保持状态'
  }
};

/** 体测总评分档位（用于诊断展示） */
const SCORE_TIERS = [
  { min: 90, name: '优秀', color: '#12B76A' },
  { min: 80, name: '良好', color: '#2E90FA' },
  { min: 60, name: '及格', color: '#F79009' },
  { min: 0, name: '待提高', color: '#F04438' }
];

module.exports = {
  GENDER_OPTIONS: GENDER_OPTIONS,
  EVENT_OPTIONS: EVENT_OPTIONS,
  EVENT_LEVEL_OPTIONS: EVENT_LEVEL_OPTIONS,
  SELF_LEVEL_OPTIONS: SELF_LEVEL_OPTIONS,
  EQUIPMENT_OPTIONS: EQUIPMENT_OPTIONS,
  SPACE_OPTIONS: SPACE_OPTIONS,
  TIME_OPTIONS: TIME_OPTIONS,
  BODY_LIMIT_OPTIONS: BODY_LIMIT_OPTIONS,
  GOAL_OPTIONS: GOAL_OPTIONS,
  FREQUENCY_RANGE: FREQUENCY_RANGE,
  CHECKIN_STATUS_OPTIONS: CHECKIN_STATUS_OPTIONS,
  DISCOMFORT_OPTIONS: DISCOMFORT_OPTIONS,
  RPE_LEVELS: RPE_LEVELS,
  FEEL_OPTIONS: FEEL_OPTIONS,
  RECOVERY_OPTIONS: RECOVERY_OPTIONS,
  TRAINING_TYPE_OPTIONS: TRAINING_TYPE_OPTIONS,
  DIET_DIMENSIONS: DIET_DIMENSIONS,
  PHASE_META: PHASE_META,
  SCORE_TIERS: SCORE_TIERS
};
