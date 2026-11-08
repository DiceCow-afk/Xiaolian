/**
 * 表单校验（前端与 mock/后端 Schema 同口径）
 * 返回 { valid, errors: { field: message }, firstError }
 */
const options = require('../data/options');
const standards = require('../data/testStandards');
const util = require('./util');

function result(errors) {
  const keys = Object.keys(errors);
  return {
    valid: keys.length === 0,
    errors: errors,
    firstError: keys.length ? errors[keys[0]] : ''
  };
}

function validEnum(value, list) {
  return list.some(function (item) {
    return item.value === value;
  });
}

/** 校验用户画像 */
function validateProfile(profile) {
  const errors = {};
  const p = profile || {};

  if (!p.gender) {
    errors.gender = '请选择性别（用于确定体测项目口径）';
  } else if (!validEnum(p.gender, options.GENDER_OPTIONS)) {
    errors.gender = '性别取值不合法';
  }

  const events = Array.isArray(p.target_events) ? p.target_events : [];
  if (events.length === 0) {
    errors.target_events = '请至少选择 1 个体测项目';
  } else if (events.length > 3) {
    errors.target_events = '最多同时选择 3 个体测项目，便于安排针对性训练';
  } else {
    const invalidEvent = events.filter(function (id) {
      return !standards.getEvent(id);
    });
    if (invalidEvent.length) {
      errors.target_events = '包含未知体测项目：' + invalidEvent.join('、');
    }
  }

  const levels = p.event_levels || {};
  const levelOptions = options.EVENT_LEVEL_OPTIONS;
  events.forEach(function (eventId) {
    if (!levels[eventId]) {
      errors['event_levels.' + eventId] = '请选择「' + (standards.getEvent(eventId) ? standards.getEvent(eventId).short_name : eventId) + '」的当前档位';
    } else if (!validEnum(levels[eventId], levelOptions)) {
      errors['event_levels.' + eventId] = '成绩档位取值不合法';
    }
  });

  if (!p.self_level) {
    errors.self_level = '请选择运动基础自评';
  } else if (!validEnum(p.self_level, options.SELF_LEVEL_OPTIONS)) {
    errors.self_level = '运动基础取值不合法';
  }

  const equipment = Array.isArray(p.equipment) ? p.equipment : [];
  if (equipment.length === 0) {
    errors.equipment = '请选择可用器械（没有器械请选「无器械」）';
  } else if (equipment.indexOf('none') >= 0 && equipment.length > 1) {
    errors.equipment = '「无器械」不能与其他器械同时选择';
  } else {
    const invalid = equipment.filter(function (v) {
      return !validEnum(v, options.EQUIPMENT_OPTIONS);
    });
    if (invalid.length) errors.equipment = '器械取值不合法';
  }

  if (!p.space) {
    errors.space = '请选择主要训练空间';
  } else if (!validEnum(p.space, options.SPACE_OPTIONS)) {
    errors.space = '训练空间取值不合法';
  }

  if (!(Number(p.time_per_session) > 0)) {
    errors.time_per_session = '请选择单次训练时长';
  } else if (!validEnum(Number(p.time_per_session), options.TIME_OPTIONS)) {
    errors.time_per_session = '单次训练时长取值不合法';
  }

  const freq = Number(p.weekly_frequency);
  if (!freq) {
    errors.weekly_frequency = '请设置每周计划训练次数';
  } else if (freq < options.FREQUENCY_RANGE.min || freq > options.FREQUENCY_RANGE.max) {
    errors.weekly_frequency = '每周训练次数需在 ' + options.FREQUENCY_RANGE.min + '-' + options.FREQUENCY_RANGE.max + ' 次之间';
  } else if (freq !== Math.floor(freq)) {
    errors.weekly_frequency = '每周训练次数需为整数';
  }

  const limits = Array.isArray(p.body_limits) ? p.body_limits : [];
  if (limits.length === 0) {
    errors.body_limits = '请选择身体限制（没有请选「无限制」）';
  } else if (limits.indexOf('none') >= 0 && limits.length > 1) {
    errors.body_limits = '「无限制」不能与其他限制同时选择';
  } else {
    const invalid = limits.filter(function (v) {
      return !validEnum(v, options.BODY_LIMIT_OPTIONS);
    });
    if (invalid.length) errors.body_limits = '身体限制取值不合法';
  }

  if (!p.goal) {
    errors.goal = '请选择训练目标';
  } else if (!validEnum(p.goal, options.GOAL_OPTIONS)) {
    errors.goal = '训练目标取值不合法';
  }

  if (!p.test_date) {
    errors.test_date = '请选择体测日期（用于排布周期化计划）';
  } else {
    const days = util.diffDays(util.todayStr(), p.test_date);
    if (isNaN(days)) {
      errors.test_date = '体测日期格式不正确';
    } else if (days < 7) {
      errors.test_date = '体测日期至少距今天 7 天，否则无法安排周期化计划';
    } else if (days > 180) {
      errors.test_date = '体测日期过远（超过 180 天），请确认后重新选择';
    }
  }

  if (p.natural_language && String(p.natural_language).length > 300) {
    errors.natural_language = '补充说明不超过 300 字';
  }

  return result(errors);
}

/** 校验自然语言输入 */
function validateNaturalLanguage(text) {
  const errors = {};
  const value = String(text || '').trim();
  if (value.length < 6) {
    errors.text = '至少输入 6 个字，例如「每天只有 20 分钟，宿舍里有弹力带，膝盖有点不舒服」';
  }
  if (value.length > 300) {
    errors.text = '补充说明不超过 300 字';
  }
  return result(errors);
}

/** 校验打卡 */
function validateCheckin(payload) {
  const errors = {};
  const p = payload || {};
  if (!p.plan_id) errors.plan_id = '缺少计划标识';
  if (!p.session_id) errors.session_id = '缺少训练日标识';
  if (!p.status) {
    errors.status = '请选择本次完成情况';
  } else if (!validEnum(p.status, options.CHECKIN_STATUS_OPTIONS)) {
    errors.status = '完成情况取值不合法';
  }
  const rpe = Number(p.rpe);
  if (!rpe || rpe < 1 || rpe > 10) {
    errors.rpe = 'RPE 主观强度需在 1-10 之间';
  }
  const discomfort = Array.isArray(p.discomfort) ? p.discomfort : [];
  if (discomfort.length === 0) {
    errors.discomfort = '请选择是否有不适（没有请选「没有不适」）';
  } else if (discomfort.indexOf('none') >= 0 && discomfort.length > 1) {
    errors.discomfort = '「没有不适」不能与其他选项同时选择';
  }
  if (p.note && String(p.note).length > 100) {
    errors.note = '备注不超过 100 字';
  }
  return result(errors);
}

/** 校验周反馈 */
function validateWeeklyFeedback(payload) {
  const errors = {};
  const p = payload || {};
  if (!p.plan_id) errors.plan_id = '缺少计划标识';
  if (!p.week_no) {
    errors.week_no = '缺少周次';
  } else if (Number(p.week_no) < 1 || Number(p.week_no) > 4) {
    errors.week_no = '周次需在 1-4 之间';
  }
  const rate = Number(p.completion_rate);
  if (isNaN(rate) || rate < 0 || rate > 1) {
    errors.completion_rate = '完成率需在 0-1 之间';
  }
  const avgRpe = Number(p.avg_rpe);
  if (isNaN(avgRpe) || avgRpe < 0 || avgRpe > 10) {
    errors.avg_rpe = '平均 RPE 需在 0-10 之间';
  }
  if (!p.feel) {
    errors.feel = '请选择整体感受';
  } else if (!validEnum(p.feel, options.FEEL_OPTIONS)) {
    errors.feel = '整体感受取值不合法';
  }
  const recovery = Number(p.recovery);
  if (!recovery || recovery < 1 || recovery > 5) {
    errors.recovery = '请选择恢复情况（1-5）';
  }
  if (p.note && String(p.note).length > 120) {
    errors.note = '备注不超过 120 字';
  }
  return result(errors);
}

/** 校验提醒设置 */
function validateReminderSettings(settings) {
  const errors = {};
  const s = settings || {};
  if (s.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
    errors.time = '提醒时间格式应为 HH:mm';
  }
  if (s.channel && ['in_app', 'subscribe'].indexOf(s.channel) < 0) {
    errors.channel = '提醒渠道取值不合法';
  }
  return result(errors);
}

module.exports = {
  validateProfile: validateProfile,
  validateNaturalLanguage: validateNaturalLanguage,
  validateCheckin: validateCheckin,
  validateWeeklyFeedback: validateWeeklyFeedback,
  validateReminderSettings: validateReminderSettings
};
