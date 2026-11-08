/**
 * 规则表（表驱动 v1.0）
 * 设计原则：
 *  1. 业务规则写成可配置的 JSON 表，代码只查表执行，禁止 if-else 山；
 *  2. 安全拦截表独立于知识图谱与大模型，删除图谱仍能拦截；
 *  3. 每条规则带 rule_id / 版本 / 说明，便于后端迁移到数据库配置表与 pytest 单测。
 * 本文件是前端 mock 与后端规则引擎的「同构草稿」，正式版由后端 rules 服务接管。
 */

/** ---------- 1. 约束过滤表（硬约束，四类） ---------- */
const CONSTRAINT_TABLE = {
  version: '1.0',
  // 器械可用性：动作要求的器械必须全部在用户可用器械集合中
  equipment: {
    none: ['none'],
    bottle: ['none', 'bottle'],
    band: ['none', 'band'],
    bar: ['none', 'bar']
  },
  // 空间可用性：用户所在空间 -> 允许的动作空间（宿舍 ⊂ 操场/健身房；操场不做器械）
  space: {
    dorm: ['dorm'],
    track: ['track', 'dorm'],
    gym: ['gym', 'dorm']
  },
  // 能力门槛：用户自评等级 -> 允许的最高动作难度
  level: {
    weak: 1,
    average: 2,
    strong: 3
  },
  // 身体限制 -> 动作禁忌关键词（命中即拦截）
  body_limit: {
    knee: ['knee'],
    shoulder: ['shoulder'],
    waist: ['waist']
  }
};

/** ---------- 2. 体测分数贡献表 ---------- */
const SCORE_CONTRIBUTION_TABLE = {
  version: '1.0',
  // 单项贡献 = 距下一档分差 × 项目权重 × 提升效率系数
  efficiency: 0.85,
  // 训练资源分配到能力维度的最小/最大占比，避免只练一个维度
  allocation_min: 0.08,
  allocation_max: 0.45,
  // 弱项判定：对总评贡献排名前 N 的能力维度视为弱项
  weak_dimension_top_n: 3
};

/** ---------- 3. 周期排布表 ---------- */
const PERIODIZATION_TABLE = {
  version: '1.0',
  // 依据「距体测剩余天数」划分阶段
  thresholds: { base_min_days: 42, build_min_days: 21 },
  phases: {
    base: {
      key: 'base',
      name: '准备期',
      weekly_volume_mult: 0.85,
      sets_delta: -1,
      reps_mult: 0.9,
      focus: '建立动作模式与训练习惯，把动作做标准',
      note: '这一阶段不追求练到力竭，重点是“每周稳定练 + 动作不变形”。'
    },
    build: {
      key: 'build',
      name: '进展期',
      weekly_volume_mult: 1.0,
      sets_delta: 0,
      reps_mult: 1.0,
      focus: '主攻弱项维度，逐步提高训练量',
      note: '这一阶段是提分主力期，优先补齐分数短板，注意组间休息。'
    },
    taper: {
      key: 'taper',
      name: '减量期',
      weekly_volume_mult: 0.6,
      sets_delta: -1,
      reps_mult: 0.7,
      focus: '体测前减量 30%-50%，保持动作感觉',
      note: '这一阶段目标是“带着好状态进考场”，宁可少练也别疲劳累积。'
    }
  },
  // 每次训练的动作数量（按单次时长）
  action_count_by_time: { 15: 2, 30: 3, 45: 4 },
  // 每周训练日偏移（相对本周第一天）
  day_offsets: {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 2, 4, 6],
    5: [0, 1, 3, 4, 6]
  },
  // 每周训练日主题模板（按能力维度优先选择动作）
  session_themes: [
    { key: 'lower', title: '下肢力量与爆发', dimensions: ['lower_power', 'endurance'], patterns: ['squat', 'hinge', 'lunge'] },
    { key: 'upper', title: '上肢推拉与核心', dimensions: ['upper_strength', 'core'], patterns: ['push', 'pull', 'core'] },
    { key: 'cardio', title: '心肺与敏捷', dimensions: ['endurance', 'speed', 'coordination'], patterns: ['cardio', 'jump'] },
    { key: 'mobility', title: '柔韧与弱项补强', dimensions: ['flexibility', 'core'], patterns: ['mobility', 'core'] }
  ],
  // 每次训练：热身 + 主项 + 收尾拉伸
  warmup: { actions: ['jumping_jack', 'shoulder_circle'], duration_min: 3 },
  cooldown: { actions: ['hamstring_stretch', 'cat_cow'], duration_min: 3 },
  // 组次参数
  sets_template: {
    strength: { sets: 3, reps: 12, rest_sec: 60 },
    core: { sets: 3, reps: 15, rest_sec: 45 },
    cardio: { sets: 3, reps: 30, rest_sec: 45, unit: '秒' },
    jump: { sets: 3, reps: 8, rest_sec: 90 },
    mobility: { sets: 2, reps: 20, rest_sec: 30, unit: '秒' },
    push: { sets: 3, reps: 10, rest_sec: 75 },
    pull: { sets: 3, reps: 8, rest_sec: 90 }
  }
};

/** ---------- 4. 周反馈调整表（四类分支，预设规则，不做 LLM 决策） ---------- */
const WEEKLY_ADJUSTMENT_TABLE = {
  version: '1.0',
  defaults: {
    type: 'progress',
    label: '正常推进',
    summary: '完成度与主观强度都在合理区间，下一周按周期化节奏正常推进。',
    next_week_action: 'keep'
  },
  rules: [
    {
      rule_id: 'ADJ-01',
      priority: 1,
      when: { field: 'has_discomfort', op: 'eq', value: true },
      type: 'reduce',
      label: '减量并安全复查',
      summary: '本周出现不适反馈，优先安全：下周降低训练量，冲突动作替换为降阶动作。',
      next_week_action: 'reduce',
      safety_review: true
    },
    {
      rule_id: 'ADJ-02',
      priority: 2,
      when: { field: 'completion_rate', op: 'lt', value: 0.5 },
      type: 'rest',
      label: '降低目标、补足完成率',
      summary: '本周完成率偏低，下周减少动作数量与组数，把“能完成”放在第一位。',
      next_week_action: 'rest'
    },
    {
      rule_id: 'ADJ-03',
      priority: 3,
      when: { field: 'avg_rpe', op: 'gte', value: 8.5 },
      type: 'reduce',
      label: '减量',
      summary: '主观强度偏高（RPE≥8.5），下周组数下调约 30%，给身体恢复窗口。',
      next_week_action: 'reduce'
    },
    {
      rule_id: 'ADJ-04',
      priority: 4,
      when: { field: 'feel', op: 'eq', value: 'hard' },
      type: 'reduce',
      label: '减量',
      summary: '主观感受偏累，下周降低总量并增加恢复内容。',
      next_week_action: 'reduce'
    },
    {
      rule_id: 'ADJ-05',
      priority: 5,
      when: {
        all: [
          { field: 'completion_rate', op: 'gte', value: 0.9 },
          { field: 'avg_rpe', op: 'lte', value: 6 },
          { field: 'feel', op: 'eq', value: 'easy' }
        ]
      },
      type: 'upgrade',
      label: '升阶',
      summary: '完成度高且强度偏低，下周升阶 1 个难度（换进阶动作或加组），注意动作质量。',
      next_week_action: 'upgrade'
    },
    {
      rule_id: 'ADJ-06',
      priority: 6,
      when: { field: 'completion_rate', op: 'gte', value: 0.8 },
      type: 'progress',
      label: '正常推进',
      summary: '完成率达标，下周维持节奏并小幅推进组次。',
      next_week_action: 'progress'
    }
  ],
  // 各类调整对下一周参数的影响
  adjustments: {
    keep: { sets_delta: 0, reps_mult: 1.0, drop_actions: 0 },
    progress: { sets_delta: 1, reps_mult: 1.05, drop_actions: 0 },
    reduce: { sets_delta: -1, reps_mult: 0.85, drop_actions: 0 },
    rest: { sets_delta: -1, reps_mult: 0.7, drop_actions: 1 },
    upgrade: { sets_delta: 0, reps_mult: 1.0, drop_actions: 0, level_up: true }
  }
};

/** ---------- 5. 安全拦截表（独立于图谱与 LLM） ---------- */
const SAFETY_TABLE = {
  version: '1.0',
  // 四类冲突硬过滤
  rules: [
    {
      rule_id: 'SF-EQ-01',
      type: 'equipment',
      name: '器械冲突',
      reason_template: '需要「{equipment}」，当前可用器械不包含该器械',
      action: 'replace_with_regression'
    },
    {
      rule_id: 'SF-SP-01',
      type: 'space',
      name: '空间冲突',
      reason_template: '动作需要「{space}」空间，与当前训练空间不符',
      action: 'replace_with_regression'
    },
    {
      rule_id: 'SF-BD-01',
      type: 'body_limit',
      name: '身体限制',
      reason_template: '动作禁忌命中「{limit}」，已替换为降阶动作',
      action: 'replace_with_regression'
    },
    {
      rule_id: 'SF-LV-01',
      type: 'level',
      name: '能力门槛',
      reason_template: '动作难度为 {level}，高于当前能力等级，先练降阶动作',
      action: 'replace_with_regression'
    }
  ],
  // 拦截记录字段（对应后端日志表）
  log_fields: ['rule_id', 'action_id', 'action_name', 'reason', 'replaced_by', 'replaced_by_name', 'timestamp']
};

/** ---------- 6. 提醒与打卡配置 ---------- */
const REMINDER_TABLE = {
  version: '1.0',
  default_time: '19:30',
  // 引导订阅的自然节点（避免频繁弹窗）
  subscribe_nodes: ['plan_view', 'checkin_success'],
  // 一次性订阅：每次授权可推送条数
  quota_per_auth: 1,
  // 服务端定时扫描说明（前端展示）
  server_cron: '每日 07:30 与 19:30 各扫描一次训练日',
  // 应用内兜底：训练日未打卡时在「打卡」tab 显示角标
  in_app_badge: true
};

/** ---------- 7. 饮食提示规则（轻量，只做 1-2 个维度，非营养处方） ---------- */
const DIET_RULE_TABLE = {
  version: '1.0',
  // 目标：训练日 / 休息日的粗略参考区间（按一顿正餐口径，不做精确热量计算）
  targets: {
    strength: { protein_g: 25, carb_g: 90 },
    cardio: { protein_g: 20, carb_g: 100 },
    mobility: { protein_g: 20, carb_g: 70 },
    rest: { protein_g: 20, carb_g: 60 }
  },
  high_threshold_mult: 1.5,
  messages: {
    protein_low: '今天蛋白质偏少，训练后修复会打折扣。可以在下一餐加 1 个鸡蛋 / 1 杯牛奶 / 一份鸡胸肉。',
    protein_ok: '蛋白质大致够用，保持每餐都有一个蛋白来源即可。',
    protein_high: '蛋白质较充足。注意搭配主食和蔬菜，别只吃肉。',
    carb_low: '主食偏少。训练日碳水不够容易没力气，可以加半碗米饭 / 1 个馒头 / 1 根香蕉。',
    carb_ok: '主食量基本够用，训练前 1-2 小时吃一点碳水更稳。',
    carb_high: '主食较多，休息日可以适当减一点，用蔬菜和蛋白质补足饱腹感。'
  },
  disclaimer:
    '以上仅为一般性饮食参考，不构成营养处方，也不针对任何疾病；如有特殊健康状况请咨询医生或注册营养师。'
};

module.exports = {
  CONSTRAINT_TABLE: CONSTRAINT_TABLE,
  SCORE_CONTRIBUTION_TABLE: SCORE_CONTRIBUTION_TABLE,
  PERIODIZATION_TABLE: PERIODIZATION_TABLE,
  WEEKLY_ADJUSTMENT_TABLE: WEEKLY_ADJUSTMENT_TABLE,
  SAFETY_TABLE: SAFETY_TABLE,
  REMINDER_TABLE: REMINDER_TABLE,
  DIET_RULE_TABLE: DIET_RULE_TABLE
};
