/**
 * 本地 mock 服务层（与《接口契约》同构）
 * 目的：后端未就绪时，前端仍能演示「约束输入 → 诊断 → 计划 → 示范 → 打卡 → 周反馈 → 饮食提示」闭环。
 * 设计：
 *  - 全部规则查 data/rules.js 的规则表，模拟后端规则引擎；
 *  - 数据读写统一走 utils/store.js，刷新页面后仍保持状态；
 *  - 返回统一 { code, data, msg }，与真实后端一致；关闭 config.useMock 即可切换真实接口。
 */
const config = require('./config');
const store = require('./store');
const util = require('./util');
const validators = require('./validators');
const standards = require('../data/testStandards');
const actionLib = require('../data/actions');
const rules = require('../data/rules');
const options = require('../data/options');
const foods = require('../data/foods');

/* ================= 基础工具 ================= */

function ok(data, msg) {
  return { code: 0, data: data, msg: msg || 'ok' };
}

function fail(code, msg, data) {
  return { code: code, data: data || null, msg: msg };
}

function labelOf(list, value) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].value === value) return list[i].label;
  }
  return value;
}

function equipmentLabelOf(key) {
  return labelOf(options.EQUIPMENT_OPTIONS, key);
}

function spaceLabelOf(key) {
  return labelOf(options.SPACE_OPTIONS, key);
}

function limitLabelOf(key) {
  return labelOf(options.BODY_LIMIT_OPTIONS, key);
}

function goalLabelOf(key) {
  return labelOf(options.GOAL_OPTIONS, key);
}

function selfLevelLabelOf(key) {
  return labelOf(options.SELF_LEVEL_OPTIONS, key);
}

function eventNameOf(eventId) {
  const ev = standards.getEvent(eventId);
  return ev ? ev.short_name : eventId;
}

function dimensionNameOf(key) {
  const d = standards.getDimension(key);
  return d ? d.name : key;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function phaseKeyForDays(daysToTest) {
  const thresholds = rules.PERIODIZATION_TABLE.thresholds;
  if (daysToTest > thresholds.base_min_days) return 'base';
  if (daysToTest > thresholds.build_min_days) return 'build';
  return 'taper';
}

function phaseOf(key) {
  return rules.PERIODIZATION_TABLE.phases[key] || rules.PERIODIZATION_TABLE.phases.build;
}

function nowIso() {
  return new Date().toISOString();
}

/* ================= 用户画像 ================= */

function normalizeProfile(input) {
  const p = Object.assign({}, input || {});
  p.target_events = Array.isArray(p.target_events) ? util.unique(p.target_events) : [];
  p.equipment = Array.isArray(p.equipment) ? util.unique(p.equipment) : [];
  p.body_limits = Array.isArray(p.body_limits) ? util.unique(p.body_limits) : [];
  p.event_levels = p.event_levels || {};
  p.time_per_session = Number(p.time_per_session) || 30;
  p.weekly_frequency = Number(p.weekly_frequency) || options.FREQUENCY_RANGE.default;
  p.natural_language = String(p.natural_language || '').slice(0, 300);
  return p;
}

function handleSaveProfile(data) {
  const profile = normalizeProfile(data && data.profile);
  const check = validators.validateProfile(profile);
  if (!check.valid) {
    return fail(1001, check.firstError, { errors: check.errors });
  }
  const saved = store.saveProfile(profile);
  const hadPlan = !!store.getPlan();
  if (hadPlan) {
    store.markProfileDirty();
  }
  store.saveDiagnosis(null);
  return ok(
    {
      profile: saved,
      needs_replan: hadPlan,
      updated_at: saved.updated_at
    },
    '画像已保存'
  );
}

function handleGetProfile() {
  return ok({ profile: store.getProfile() });
}

/* ================= 自然语言解析（模拟 LLM 调用点 1） ================= */

const PARSE_TABLES = {
  equipment: [
    { keys: ['矿泉水瓶', '水瓶', '哑铃'], value: 'bottle' },
    { keys: ['弹力带'], value: 'band' },
    { keys: ['单杠', '引体'], value: 'bar' },
    { keys: ['无器械', '徒手', '不需要器械', '不用器械'], value: 'none' }
  ],
  space: [
    { keys: ['宿舍', '寝室', '室内', '家里'], value: 'dorm' },
    { keys: ['操场', '跑道', '户外', '公园', '田径场'], value: 'track' },
    { keys: ['健身房', '器械区', '体育馆'], value: 'gym' }
  ],
  body_limits: [
    { keys: ['膝盖', '膝'], value: 'knee' },
    { keys: ['肩颈', '肩膀', '肩'], value: 'shoulder' },
    { keys: ['腰部', '腰'], value: 'waist' },
    { keys: ['没有不适', '无不适', '没有伤', '无限制'], value: 'none' }
  ],
  events: [
    { keys: ['1000米', '1000', '800米', '长跑', '中长跑'], value: 'run_1000' },
    { keys: ['50米', '50m', '短跑'], value: 'run_50' },
    { keys: ['立定跳远', '跳远'], value: 'jump_long' },
    { keys: ['引体', '仰卧起坐', '力量项目'], value: 'pull_up' },
    { keys: ['体前屈', '柔韧'], value: 'sit_reach' },
    { keys: ['肺活量'], value: 'vital_capacity' }
  ],
  goal: [
    { keys: ['提分', '提高', '涨分', '冲一冲'], value: 'score_up' },
    { keys: ['达标', '及格', '过线'], value: 'pass' },
    { keys: ['保持'], value: 'maintain' }
  ],
  self_level: [
    { keys: ['零基础', '刚开始', '新手', '没练过'], value: 'weak' },
    { keys: ['有基础', '偶尔', '练过一点'], value: 'average' },
    { keys: ['经常运动', '规律训练', '有训练习惯'], value: 'strong' }
  ],
  gender: [
    { keys: ['男生', '男'], value: 'male' },
    { keys: ['女生', '女'], value: 'female' }
  ]
};

function matchKeywords(text, table) {
  const found = [];
  table.forEach(function (item) {
    for (let i = 0; i < item.keys.length; i++) {
      if (text.indexOf(item.keys[i]) >= 0) {
        if (found.indexOf(item.value) < 0) found.push(item.value);
        break;
      }
    }
  });
  return found;
}

function handleParseProfile(data) {
  if (!config.features.llmParse) {
    return fail(3001, '自然语言解析未开启，请使用表单填写', { retry_count: 0 });
  }
  const text = String((data && data.text) || '');
  const check = validators.validateNaturalLanguage(text);
  if (!check.valid) return fail(1001, check.firstError, { errors: check.errors });
  // 便于联调降级路径的测试口令（正常用户不会输入）
  if (text.indexOf('测试失败') >= 0) {
    return fail(3001, '模型输出未通过 Schema 校验（已重试 2 次），已为你切换到表单填写', {
      retry_count: 2,
      model: 'deepseek-chat(mock)'
    });
  }

  const parsed = {};
  const filled = [];

  const equipment = matchKeywords(text, PARSE_TABLES.equipment);
  if (equipment.length) {
    let list = equipment;
    if (list.indexOf('none') >= 0 && list.length > 1) {
      list = list.filter(function (v) {
        return v !== 'none';
      });
    }
    parsed.equipment = list;
    filled.push('可用器械');
  }

  const space = matchKeywords(text, PARSE_TABLES.space);
  if (space.length) {
    parsed.space = space[0];
    filled.push('训练空间');
  }

  const limits = matchKeywords(text, PARSE_TABLES.body_limits);
  if (limits.length) {
    let list = limits;
    if (list.indexOf('none') >= 0 && list.length > 1) {
      list = list.filter(function (v) {
        return v !== 'none';
      });
    }
    parsed.body_limits = list;
    filled.push('身体限制');
  }

  const events = matchKeywords(text, PARSE_TABLES.events);
  if (events.length) {
    parsed.target_events = events.slice(0, 3);
    filled.push('体测项目');
  }

  const goal = matchKeywords(text, PARSE_TABLES.goal);
  if (goal.length) {
    parsed.goal = goal[0];
    filled.push('训练目标');
  }

  const selfLevel = matchKeywords(text, PARSE_TABLES.self_level);
  if (selfLevel.length) {
    parsed.self_level = selfLevel[0];
    filled.push('运动基础');
  }

  const gender = matchKeywords(text, PARSE_TABLES.gender);
  if (gender.length) {
    parsed.gender = gender[0];
    filled.push('性别');
  }

  // 时长
  const minuteMatch = text.match(/(\d{1,3})\s*分钟/);
  if (minuteMatch) {
    const value = Number(minuteMatch[1]);
    const allowed = [15, 30, 45];
    let nearest = allowed[0];
    let minGap = Math.abs(value - allowed[0]);
    allowed.forEach(function (v) {
      const gap = Math.abs(value - v);
      if (gap < minGap) {
        minGap = gap;
        nearest = v;
      }
    });
    parsed.time_per_session = nearest;
    filled.push('单次时长');
  } else if (text.indexOf('半小时') >= 0) {
    parsed.time_per_session = 30;
    filled.push('单次时长');
  }

  // 周频次
  const freqMatch = text.match(/每周\s*(\d)\s*次/);
  if (freqMatch) {
    const v = util.clamp(Number(freqMatch[1]), options.FREQUENCY_RANGE.min, options.FREQUENCY_RANGE.max);
    parsed.weekly_frequency = v;
    filled.push('每周次数');
  }

  const totalGroups = 9;
  const confidence = round1(filled.length / totalGroups);
  if (filled.length === 0) {
    return fail(3001, '没有识别到可用的约束信息（Schema 校验未通过，已重试 2 次），请使用表单填写', {
      retry_count: 2,
      model: 'deepseek-chat(mock)',
      filled_fields: []
    });
  }

  return ok(
    {
      parsed: parsed,
      filled_fields: filled,
      confidence: confidence,
      model: 'deepseek-chat(mock)',
      schema_version: config.schemaVersion,
      retry_count: 0,
      latency_ms: config.llmLatency,
      parsed_at: nowIso()
    },
    '解析完成，请核对结果'
  );
}

/* ================= 弱项诊断与分数贡献 ================= */

const DEFAULT_LEVEL_BY_SELF = { weak: 'fail', average: 'pass', strong: 'good' };

function buildDiagnosis(profile) {
  const p = normalizeProfile(profile);
  const table = rules.SCORE_CONTRIBUTION_TABLE;
  const items = [];
  const dimensionContribution = {};

  p.target_events.forEach(function (eventId) {
    const ev = standards.getEvent(eventId);
    if (!ev) return;
    const levelKey = p.event_levels[eventId] || DEFAULT_LEVEL_BY_SELF[p.self_level] || 'pass';
    const tier = standards.getTier(eventId, levelKey) || standards.getTier(eventId, 'pass');
    const nextTier = standards.getNextTier(eventId, levelKey);
    const gap = nextTier ? nextTier.score - tier.score : 0;
    const contribution = round1(gap * ev.weight * table.efficiency);
    const dims = (ev.dimensions || []).map(function (d) {
      const dim = standards.getDimension(d.key);
      return {
        key: d.key,
        name: dim ? dim.name : d.key,
        weight: d.weight,
        contribution: round1(contribution * d.weight)
      };
    });
    dims.forEach(function (d) {
      dimensionContribution[d.key] = (dimensionContribution[d.key] || 0) + d.contribution;
    });
    items.push({
      event_id: eventId,
      event_name: ev.short_name,
      event_full_name: ev.full_name,
      tier_key: tier.key,
      tier_name: tier.name,
      current_score: tier.score,
      next_tier: nextTier
        ? { name: nextTier.name, score: nextTier.score, threshold: nextTier.threshold }
        : null,
      gap: gap,
      contribution: contribution,
      dimensions: dims,
      tips: ev.tips
    });
  });

  // 训练资源分配权重：按贡献占比，限制上下限后归一化
  const dimKeys = Object.keys(dimensionContribution);
  const totalContribution =
    dimKeys.reduce(function (acc, key) {
      return acc + dimensionContribution[key];
    }, 0) || 1;

  let allocation = dimKeys.map(function (key) {
    const dim = standards.getDimension(key);
    return {
      key: key,
      name: dim ? dim.name : key,
      short: dim ? dim.short : key,
      color: dim ? dim.color : '#FF6B2C',
      contribution: round1(dimensionContribution[key]),
      weight: dimensionContribution[key] / totalContribution
    };
  });
  allocation = allocation
    .map(function (item) {
      return Object.assign({}, item, {
        weight: util.clamp(item.weight, table.allocation_min, table.allocation_max)
      });
    })
    .filter(function (item) {
      return item.contribution > 0 || item.weight > 0;
    });
  const weightSum = allocation.reduce(function (acc, item) {
    return acc + item.weight;
  }, 0) || 1;
  allocation = allocation
    .map(function (item) {
      return Object.assign({}, item, { weight: round1(item.weight / weightSum) });
    })
    .sort(function (a, b) {
      return b.contribution - a.contribution;
    });

  const weakDimensions = allocation.slice(0, table.weak_dimension_top_n).map(function (item, index) {
    return Object.assign({}, item, { priority: index + 1 });
  });

  const weightSumOfEvents = p.target_events.reduce(function (acc, eventId) {
    const ev = standards.getEvent(eventId);
    return acc + (ev ? ev.weight : 0);
  }, 0) || 1;
  const overallScore = Math.round(
    items.reduce(function (acc, item) {
      const ev = standards.getEvent(item.event_id);
      return acc + item.current_score * ((ev ? ev.weight : 0) / weightSumOfEvents);
    }, 0)
  );

  let summary = '当前未选择体测项目，无法给出弱项诊断。';
  if (items.length) {
    const first = weakDimensions[0];
    summary =
      '你的体测自评总分约 ' +
      overallScore +
      ' 分（' +
      standards.tierNameByScore(overallScore) +
      '）。优先补强「' +
      (first ? first.name : '综合能力') +
      '」，它对应的体测项目提分空间最大；训练资源将优先分配到这个方向。';
  }

  return {
    user_id: (store.getUser() || {}).user_id || '',
    items: items,
    allocation: allocation,
    weak_dimensions: weakDimensions,
    overall_score: overallScore,
    overall_tier_name: standards.tierNameByScore(overallScore),
    summary: summary,
    rules_version: config.rulesVersion,
    created_at: nowIso()
  };
}

function handleDiagnosis(data) {
  const profile = normalizeProfile((data && data.profile) || store.getProfile());
  const check = validators.validateProfile(profile);
  if (!check.valid) return fail(1001, check.firstError, { errors: check.errors });
  const diagnosis = buildDiagnosis(profile);
  store.saveDiagnosis(diagnosis);
  return ok(diagnosis);
}

/* ================= 动作详情 ================= */

function enrichAction(action) {
  const demoFrames = action.demo_frames > 0 && action.demo_resource_id
    ? (function () {
        const list = [];
        for (let i = 1; i <= action.demo_frames; i++) {
          list.push('/assets/demo/' + action.action_id + '/frame-' + i + '.png');
        }
        return list;
      })()
    : [];
  const regression = action.regression_id ? actionLib.getAction(action.regression_id) : null;
  const progression = action.progression_id ? actionLib.getAction(action.progression_id) : null;

  return Object.assign({}, action, {
    dimension_list: (action.ability_dimensions || []).map(function (d) {
      const dim = standards.getDimension(d.key);
      return {
        key: d.key,
        name: dim ? dim.name : d.key,
        short: dim ? dim.short : d.key,
        color: dim ? dim.color : '#FF6B2C',
        icon: dim ? dim.icon : '🎯',
        weight: d.weight
      };
    }),
    equipment_labels: (action.equipment || []).map(equipmentLabelOf),
    space_labels: (action.space || []).map(spaceLabelOf),
    level_label: ['', '入门', '进阶', '高阶'][action.capability_level] || '入门',
    contraindication_labels: (action.contraindications || []).map(limitLabelOf),
    regression: regression
      ? {
          action_id: regression.action_id,
          name: regression.name,
          capability_level: regression.capability_level,
          level_label: ['', '入门', '进阶', '高阶'][regression.capability_level] || '入门'
        }
      : null,
    progression: progression
      ? {
          action_id: progression.action_id,
          name: progression.name,
          capability_level: progression.capability_level,
          level_label: ['', '入门', '进阶', '高阶'][progression.capability_level] || '入门'
        }
      : null,
    demo: demoFrames.length
      ? {
          type: 'frames',
          frames: demoFrames,
          count: demoFrames.length,
          fps: 2,
          poster: demoFrames[0],
          placeholder: '/assets/demo/placeholder.png'
        }
      : {
          type: 'text',
          frames: [],
          count: 0,
          fps: 0,
          poster: '/assets/demo/placeholder.png',
          placeholder: '/assets/demo/placeholder.png'
        },
    version: 'v1.0',
    updated_at: '2026-11-01'
  });
}

function handleGetAction(actionId) {
  const action = actionLib.getAction(actionId);
  if (!action) return fail(1003, '动作不存在或已下架：' + actionId);
  const detail = enrichAction(action);
  // 当前画像下的适配性提示（仅提示，不替代安全拦截表）
  const profile = store.getProfile();
  const limits = profile && profile.body_limits ? profile.body_limits.filter(function (l) {
    return l !== 'none';
  }) : [];
  const conflict = (action.contraindications || []).filter(function (c) {
    return limits.indexOf(c) >= 0;
  });
  detail.current_profile = {
    body_limits: limits,
    conflict: conflict,
    conflict_labels: conflict.map(limitLabelOf),
    safe: conflict.length === 0
  };
  return ok(detail);
}

/* ================= 约束过滤 / 安全拦截（独立规则表） ================= */

function buildConstraintContext(profile) {
  const table = rules.CONSTRAINT_TABLE;
  const equipment = profile.equipment && profile.equipment.length ? profile.equipment : ['none'];
  const allowedEquipment = [];
  equipment.forEach(function (key) {
    (table.equipment[key] || []).forEach(function (item) {
      allowedEquipment.push(item);
    });
  });
  const allowedSpaces = table.space[profile.space] || ['dorm'];
  const maxLevel = table.level[profile.self_level] || 2;
  const limits = (profile.body_limits || []).filter(function (l) {
    return l !== 'none';
  });
  return {
    allowedEquipment: util.unique(allowedEquipment),
    allowedSpaces: util.unique(allowedSpaces),
    maxLevel: maxLevel,
    limits: limits
  };
}

function checkAction(action, ctx) {
  const equipOk = (action.equipment || ['none']).every(function (e) {
    return ctx.allowedEquipment.indexOf(e) >= 0;
  });
  const spaceOk = (action.space || []).some(function (s) {
    return ctx.allowedSpaces.indexOf(s) >= 0;
  });
  const limitHit = (action.contraindications || []).filter(function (c) {
    return ctx.limits.indexOf(c) >= 0;
  });
  const levelOk = action.capability_level <= ctx.maxLevel;
  return {
    ok: equipOk && spaceOk && limitHit.length === 0 && levelOk,
    equipOk: equipOk,
    spaceOk: spaceOk,
    limitHit: limitHit,
    levelOk: levelOk
  };
}

function buildIntercept(action, result) {
  const safetyRules = rules.SAFETY_TABLE.rules;
  let rule = safetyRules[2]; // body_limit
  let reason = '';
  if (result.limitHit.length) {
    rule = safetyRules[2];
    reason = '身体限制冲突：动作禁忌命中「' +
      result.limitHit.map(limitLabelOf).join('、') +
      '」';
  } else if (!result.levelOk) {
    rule = safetyRules[3];
    reason = '能力门槛超出：动作难度为「' +
      (['', '入门', '进阶', '高阶'][action.capability_level] || '入门') +
      '」，高于当前能力等级';
  } else if (!result.equipOk) {
    rule = safetyRules[0];
    reason = '器械冲突：需要「' +
      (action.equipment || []).map(equipmentLabelOf).join('、') +
      '」，当前可用器械不包含';
  } else {
    rule = safetyRules[1];
    reason = '空间冲突：动作需要「' +
      (action.space || []).map(spaceLabelOf).join('、') +
      '」，与当前训练空间不符';
  }
  return rule.rule_id + '|' + rule.type + '|' + reason;
}

/**
 * 四类硬过滤 + 降阶替换
 * @returns {{safe:Array, intercepts:Array}}
 */
function filterActions(profile) {
  const ctx = buildConstraintContext(profile);
  const safe = [];
  const safeIds = {};
  const intercepts = [];
  const interceptedIds = {};

  actionLib.listActions().forEach(function (action) {
    const result = checkAction(action, ctx);
    if (result.ok) {
      if (!safeIds[action.action_id]) {
        safeIds[action.action_id] = true;
        safe.push(action);
      }
      return;
    }
    if (interceptedIds[action.action_id]) return;
    interceptedIds[action.action_id] = true;

    // 尝试降阶替换（最多 3 层）
    let replacement = null;
    let cursor = action;
    for (let depth = 0; depth < 3; depth++) {
      const regId = cursor.regression_id;
      if (!regId) break;
      const reg = actionLib.getAction(regId);
      if (!reg) break;
      if (checkAction(reg, ctx).ok) {
        replacement = reg;
        break;
      }
      cursor = reg;
    }
    if (replacement && !safeIds[replacement.action_id]) {
      safeIds[replacement.action_id] = true;
      safe.push(replacement);
    }
    const parts = buildIntercept(action, result).split('|');
    intercepts.push({
      rule_id: parts[0],
      rule_type: parts[1],
      action_id: action.action_id,
      action_name: action.name,
      reason: parts[2],
      replaced_by: replacement ? replacement.action_id : null,
      replaced_by_name: replacement ? replacement.name : null,
      timestamp: nowIso()
    });
  });

  return { safe: safe, intercepts: intercepts, ctx: ctx };
}

/* ================= 计划生成 ================= */

function applyTemplate(template, phase, weekNo) {
  const setsBase = Number(template.sets) || 3;
  const repsBase = Number(template.reps) || 10;
  const unit = template.unit || '次';
  let sets = setsBase + (phase.sets_delta || 0);
  if (phase.key === 'build' && weekNo >= 3) sets += 1;
  sets = Math.max(1, sets);
  let reps = repsBase * (phase.reps_mult || 1);
  if (unit === '秒') reps = Math.max(10, Math.round(reps / 5) * 5);
  else if (unit === '分钟') reps = Math.max(3, Math.round(reps));
  else reps = Math.max(1, Math.round(reps));
  return {
    sets: sets,
    reps: reps,
    unit: unit,
    reps_text: sets + ' 组 × ' + reps + unit,
    rest_sec: Number(template.rest_sec) || 60
  };
}

function actionRelevance(action, allocationMap, theme) {
  let score = 0;
  (action.ability_dimensions || []).forEach(function (d) {
    score += d.weight * (allocationMap[d.key] || 0);
  });
  if (theme && theme.patterns.indexOf(action.pattern) >= 0) score += 0.9;
  if (theme && theme.dimensions.indexOf((action.ability_dimensions[0] || {}).key) >= 0) score += 0.3;
  if (action.pattern === 'mobility') score += 0.15; // 保证恢复类动作进入候选
  return score;
}

function buildSession(optionsIn) {
  const {
    safe,
    week,
    phase,
    theme,
    sessionIndex,
    date,
    profile,
    allocationMap,
    usedCounter
  } = optionsIn;

  const periodTable = rules.PERIODIZATION_TABLE;
  const timePerSession = profile.time_per_session;
  const mainCount = periodTable.action_count_by_time[timePerSession] || 3;
  const includeWarmup = timePerSession >= 30;
  const includeCooldown = timePerSession >= 30;
  const picked = [];
  const pickedIds = {};

  function pickFrom(ids) {
    for (let i = 0; i < ids.length; i++) {
      const candidate = safe.filter(function (a) {
        return a.action_id === ids[i];
      })[0];
      if (candidate && !pickedIds[candidate.action_id]) {
        pickedIds[candidate.action_id] = true;
        picked.push(candidate);
        return true;
      }
    }
    return false;
  }

  function pickBest(role, pool, count) {
    const candidates = pool
      .filter(function (a) {
        return !pickedIds[a.action_id];
      })
      .map(function (a) {
        return {
          action: a,
          score: actionRelevance(a, allocationMap, theme) - (usedCounter[a.action_id] || 0) * 0.18
        };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
    let added = 0;
    for (let i = 0; i < candidates.length && added < count; i++) {
      pickedIds[candidates[i].action.action_id] = true;
      picked.push(candidates[i].action);
      added += 1;
    }
    return added;
  }

  // 热身
  if (includeWarmup) {
    if (!pickFrom(periodTable.warmup.actions)) {
      const warmupPool = safe.filter(function (a) {
        return a.pattern === 'cardio' || a.pattern === 'mobility';
      });
      pickBest('warmup', warmupPool, 1);
    }
  }

  // 主项：按主题筛选候选；候选不足时退化为全部安全动作
  const themePool = safe.filter(function (a) {
    return theme.patterns.indexOf(a.pattern) >= 0 ||
      (a.ability_dimensions || []).some(function (d) {
        return theme.dimensions.indexOf(d.key) >= 0;
      });
  });
  let added = pickBest('main', themePool, mainCount);
  if (added < mainCount) {
    pickBest('main', safe, mainCount - added);
  }

  // 收尾拉伸
  if (includeCooldown) {
    const cooldownUsed = pickFrom(periodTable.cooldown.actions);
    if (!cooldownUsed) {
      const mobilityPool = safe.filter(function (a) {
        return a.pattern === 'mobility';
      });
      pickBest('cooldown', mobilityPool.length ? mobilityPool : safe, 1);
    }
  }

  // 兜底：一个动作都没选出来（理论上不会发生）
  if (!picked.length) {
    safe.slice(0, Math.min(mainCount, safe.length)).forEach(function (a) {
      pickedIds[a.action_id] = true;
      picked.push(a);
    });
  }

  const actions = picked.map(function (action, index) {
    const template = periodTable.sets_template[action.pattern] || action.sets_template;
    const setsInfo = applyTemplate(template, phase, week.week_no);
    const role = includeWarmup && index === 0
      ? 'warmup'
      : includeCooldown && index === picked.length - 1
        ? 'cooldown'
        : 'main';
    usedCounter[action.action_id] = (usedCounter[action.action_id] || 0) + 1;
    return {
      action_id: action.action_id,
      name: action.name,
      role: role,
      role_label: role === 'warmup' ? '热身' : role === 'cooldown' ? '放松' : '主项',
      pattern: action.pattern,
      sets: setsInfo.sets,
      reps: setsInfo.reps,
      unit: setsInfo.unit,
      reps_text: setsInfo.reps_text,
      rest_sec: setsInfo.rest_sec,
      rest_text: setsInfo.rest_sec + ' 秒',
      equipment: (action.equipment || []).map(equipmentLabelOf).join('/'),
      space: (action.space || []).map(spaceLabelOf).join('/'),
      level: action.capability_level,
      level_label: ['', '入门', '进阶', '高阶'][action.capability_level] || '入门',
      demo_resource_id: action.demo_resource_id,
      key_point: (action.key_points || [])[0] || '',
      substitute: action.regression_id
        ? (actionLib.getAction(action.regression_id) || {}).name || ''
        : ''
    };
  });

  const themeNotes = {
    lower: '动作质量优先，组间按提示休息，最后一组可接近力竭',
    upper: '推拉分离安排，注意沉肩与肩胛稳定',
    cardio: '心率控制在「能说短句」的强度，感觉头晕立刻停止',
    mobility: '拉伸保持 20-30 秒，不弹震、不憋气'
  };

  return {
    session_id: 'plan_' + week.week_no + '_d' + (sessionIndex + 1),
    day_index: sessionIndex + 1,
    day_label: util.relativeDayLabel(date),
    weekday: util.weekdayCN(date),
    date: date,
    date_md: (function () {
      const d = new Date(date);
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    })(),
    title: theme.title,
    theme_key: theme.key,
    duration_min: profile.time_per_session,
    duration_text: util.durationText(profile.time_per_session),
    location: spaceLabelOf(profile.space),
    actions: actions,
    notes: themeNotes[theme.key] || '动作质量优先，注意呼吸节奏',
    status: 'pending'
  };
}

function generatePlanInternal(profile, diagnosis, extra) {
  const check = validators.validateProfile(profile);
  if (!check.valid) return fail(1001, check.firstError, { errors: check.errors });

  const filtered = filterActions(profile);
  if (!filtered.safe.length) {
    return fail(2001, '当前约束下没有可用动作，请放宽器械/空间限制，或咨询体育老师', {
      intercepts: filtered.intercepts
    });
  }

  const periodTable = rules.PERIODIZATION_TABLE;
  const startDate = util.todayStr();
  const testDate = profile.test_date || util.addDays(startDate, config.defaultTestDateOffset);
  const daysToTest = Math.max(0, util.diffDays(startDate, testDate));
  const frequency = util.clamp(profile.weekly_frequency, options.FREQUENCY_RANGE.min, 5);
  const offsets = periodTable.day_offsets[frequency] || periodTable.day_offsets[3];
  const allocationMap = {};
  (diagnosis.weak_dimensions || []).forEach(function (d) {
    allocationMap[d.key] = d.weight;
  });
  // 弱项之外的维度也给一点权重，避免动作池过窄
  (diagnosis.allocation || []).forEach(function (d) {
    if (allocationMap[d.key] === undefined) allocationMap[d.key] = (d.weight || 0) * 0.5;
  });

  const themes = periodTable.session_themes;
  const weeks = [];
  const usedCounter = {};
  const phasesUsed = {};

  for (let weekNo = 1; weekNo <= 4; weekNo++) {
    const weekStart = util.addDays(startDate, (weekNo - 1) * 7);
    const weekEnd = util.addDays(weekStart, 6);
    const remainingDays = Math.max(0, util.diffDays(weekStart, testDate));
    const phaseKey = phaseKeyForDays(remainingDays);
    const phase = phaseOf(phaseKey);
    phasesUsed[phaseKey] = true;
    const sessions = [];
    offsets.forEach(function (offset, index) {
      const date = util.addDays(startDate, (weekNo - 1) * 7 + offset);
      const theme = themes[(index + weekNo - 1) % themes.length];
      sessions.push(
        buildSession({
          safe: filtered.safe,
          week: { week_no: weekNo },
          phase: phase,
          theme: theme,
          sessionIndex: index,
          date: date,
          profile: profile,
          allocationMap: allocationMap,
          usedCounter: usedCounter
        })
      );
    });

    weeks.push({
      week_no: weekNo,
      phase: phaseKey,
      phase_name: phase.name,
      phase_key: phaseKey,
      date_range: { start: weekStart, end: weekEnd },
      date_range_text: util.dateRangeText(weekStart, weekEnd),
      weekly_focus:
        phase.focus +
        '；优先补强：' +
        (diagnosis.weak_dimensions || [])
          .slice(0, 2)
          .map(function (d) {
            return d.name;
          })
          .join('、'),
      target_completion: sessions.length,
      sessions: sessions,
      status: 'pending',
      note: phase.note
    });
  }

  const constraints = {
    equipment: (profile.equipment || []).map(equipmentLabelOf),
    space: spaceLabelOf(profile.space),
    time_per_session: profile.time_per_session,
    weekly_frequency: frequency,
    body_limits: (profile.body_limits || []).map(limitLabelOf),
    goal: goalLabelOf(profile.goal),
    self_level: selfLevelLabelOf(profile.self_level)
  };

  const plan = {
    plan_id: 'plan_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    user_id: (store.getUser() || {}).user_id || '',
    created_at: nowIso(),
    generated_at: nowIso(),
    generated_date: startDate,
    version: 1,
    schema_version: config.schemaVersion,
    rules_version: config.rulesVersion,
    source: 'mock-rules',
    test_date: testDate,
    days_to_test: daysToTest,
    weeks_count: 4,
    phases: Object.keys(phasesUsed),
    constraints: constraints,
    diagnosis_summary: diagnosis.summary,
    weak_dimensions: diagnosis.weak_dimensions || [],
    weeks: weeks,
    safety_intercepts: filtered.intercepts,
    explanation: null,
    meta: {
      profile_snapshot: {
        target_events: profile.target_events,
        event_levels: profile.event_levels,
        self_level: profile.self_level,
        equipment: profile.equipment,
        space: profile.space,
        time_per_session: profile.time_per_session,
        weekly_frequency: frequency,
        body_limits: profile.body_limits,
        goal: profile.goal,
        test_date: testDate
      },
      intercept_count: filtered.intercepts.length,
      candidate_count: filtered.safe.length,
      action_library_version: actionLib.getActionStats().version,
      updated_at: nowIso()
    }
  };

  store.savePlan(plan);
  store.clearProfileDirty();
  store.saveMeta({ last_plan_id: plan.plan_id, last_generated_at: plan.generated_at });

  return ok(
    {
      plan: plan,
      diagnosis: diagnosis,
      intercept_count: filtered.intercepts.length,
      candidate_count: filtered.safe.length
    },
    '计划已生成'
  );
}

function handleGeneratePlan(data) {
  let profile = data && data.profile;
  if (!profile) profile = store.getProfile();
  if (!profile) return fail(1003, '尚未填写约束信息，请先完成约束输入');
  profile = normalizeProfile(profile);
  const diagnosis =
    (data && data.diagnosis) ||
    store.getDiagnosis() ||
    buildDiagnosis(profile);
  const res = generatePlanInternal(profile, diagnosis, data || {});
  return res;
}

/* ================= 计划读取 ================= */

function planStaleInfo(plan) {
  if (!plan) return { stale: false, days_old: 0 };
  const generatedDate = plan.generated_date || util.formatDate(plan.created_at, 'YYYY-MM-DD');
  const daysOld = Math.max(0, util.diffDays(generatedDate, util.todayStr()));
  return { stale: daysOld > 0, days_old: daysOld };
}

function handleGetCurrentPlan() {
  const plan = store.getPlan();
  const stale = planStaleInfo(plan);
  return ok({ plan: plan || null, stale: stale.stale, days_old: stale.days_old });
}

function handleGetPlan(planId) {
  const plan = store.getPlan();
  if (!plan || plan.plan_id !== planId) return fail(1003, '计划不存在或已失效');
  const stale = planStaleInfo(plan);
  return ok({ plan: plan, stale: stale.stale, days_old: stale.days_old });
}

/* ================= 计划解释（模拟 LLM 调用点 2） ================= */

function buildExplainText(plan, diagnosis) {
  const phaseNames = plan.weeks.map(function (w) {
    return '第' + w.week_no + '周' + w.phase_name;
  });
  const firstWeek = plan.weeks[0];
  const weak = (plan.weak_dimensions || [])
    .map(function (d) {
      return d.name + '（' + Math.round((d.weight || 0) * 100) + '%）';
    })
    .join('、');
  const constraints = plan.constraints || {};
  const lines = [];
  lines.push('这份计划是围绕你的现实约束生成的，而不是通用课表。');
  lines.push('');
  lines.push(
    '【你的约束】每周 ' +
      constraints.weekly_frequency +
      ' 次、每次 ' +
      constraints.time_per_session +
      ' 分钟，主要场景是「' +
      constraints.space +
      '」，可用器械：' +
      (constraints.equipment || []).join('、') +
      '，目标：' +
      constraints.goal +
      '。'
  );
  lines.push(
    '【为什么这样安排】诊断显示你的提分优先级是：' +
      (weak || '综合能力') +
      '，所以训练日主题按弱势方向轮换；4 周按「' +
      phaseNames.join('、') +
      '」推进，最近一周是' +
      firstWeek.phase_name +
      '，' +
      rules.PERIODIZATION_TABLE.phases[firstWeek.phase_key].note
  );
  lines.push(
    '【安全怎么保证】动作先经过器械、空间、身体限制、能力门槛四类硬过滤，本次共记录 ' +
      (plan.safety_intercepts || []).length +
      ' 条安全拦截；被拦截动作会替换为降阶动作或直接剔除。安全判断不依赖大模型。'
  );
  lines.push(
    '【执行建议】优先保证训练日的完成率，动作质量比数量重要；出现不适立即停止，并在打卡时如实记录，周反馈会自动触发减量或安全复查。'
  );
  lines.push('');
  lines.push('以上内容只是解释这份计划，未新增、删除或修改任何动作与组次。');
  return lines.join('\n');
}

function handleExplainPlan(data) {
  if (!config.features.planExplain) return fail(3001, '计划解释功能未开启');
  const plan = store.getPlan();
  if (!plan) return fail(1003, '尚未生成计划，无法解释');
  if (data && data.plan_id && data.plan_id !== plan.plan_id) {
    return fail(1003, '计划不存在或已失效');
  }
  const before = JSON.stringify(plan.weeks);
  const diagnosis = store.getDiagnosis() || buildDiagnosis(plan.meta.profile_snapshot || {});
  const text = buildExplainText(plan, diagnosis);
  const generatedAt = nowIso();
  plan.explanation = {
    text: text,
    model: 'deepseek-chat(mock)',
    generated_at: generatedAt,
    latency_ms: config.llmLatency,
    checks: { plan_unchanged: true }
  };
  store.savePlan(plan);
  return ok(
    {
      plan_id: plan.plan_id,
      text: text,
      model: 'deepseek-chat(mock)',
      generated_at: generatedAt,
      latency_ms: config.llmLatency,
      checks: { plan_unchanged: before === JSON.stringify(plan.weeks) }
    },
    '解释已生成（只读，未改动计划）'
  );
}

/* ================= 打卡 ================= */

function computeStreak() {
  const checkins = store.getCheckins().filter(function (c) {
    return c.status && c.status !== 'skipped';
  });
  if (!checkins.length) return 0;
  const dates = util.unique(
    checkins.map(function (c) {
      return c.date;
    })
  ).sort();
  // 从今天（或昨天）向前数连续日期
  let cursor = util.todayStr();
  if (dates.indexOf(cursor) < 0) {
    const yesterday = util.addDays(cursor, -1);
    if (dates.indexOf(yesterday) >= 0) cursor = yesterday;
    else return 0;
  }
  let streak = 0;
  while (dates.indexOf(cursor) >= 0) {
    streak += 1;
    cursor = util.addDays(cursor, -1);
  }
  return streak;
}

function findWeekOfPlan(plan, dateStr) {
  if (!plan) return null;
  const date = dateStr || util.todayStr();
  for (let i = 0; i < plan.weeks.length; i++) {
    const w = plan.weeks[i];
    if (date >= w.date_range.start && date <= w.date_range.end) return w;
  }
  return plan.weeks[0] || null;
}

function computeWeekStats(plan, weekNo) {
  const week = plan && plan.weeks
    ? plan.weeks.filter(function (w) {
        return w.week_no === Number(weekNo);
      })[0]
    : null;
  if (!week) {
    return {
      week_no: weekNo || null,
      total_sessions: 0,
      done_count: 0,
      partial_count: 0,
      skipped_count: 0,
      completion_rate: 0,
      avg_rpe: 0,
      discomfort_count: 0,
      records: [],
      streak: computeStreak()
    };
  }
  const checkins = store.getCheckins();
  const records = checkins.filter(function (c) {
    return Number(c.week_no) === Number(week.week_no);
  });
  let score = 0;
  week.sessions.forEach(function (session) {
    const record = records.filter(function (r) {
      return r.session_id === session.session_id;
    })[0];
    if (record) {
      if (record.status === 'done') score += 1;
      else if (record.status === 'partial') score += 0.5;
    }
  });
  const doneCount = records.filter(function (r) {
    return r.status === 'done';
  }).length;
  const partialCount = records.filter(function (r) {
    return r.status === 'partial';
  }).length;
  const skippedCount = records.filter(function (r) {
    return r.status === 'skipped';
  }).length;
  const rpeList = records
    .filter(function (r) {
      return Number(r.rpe) > 0;
    })
    .map(function (r) {
      return Number(r.rpe);
    });
  const discomforts = records.filter(function (r) {
    return (r.discomfort || []).filter(function (d) {
      return d !== 'none';
    }).length > 0;
  });
  return {
    week_no: week.week_no,
    total_sessions: week.sessions.length,
    done_count: doneCount,
    partial_count: partialCount,
    skipped_count: skippedCount,
    completion_rate: week.sessions.length ? round1(score / week.sessions.length) : 0,
    avg_rpe: rpeList.length ? round1(util.avg(rpeList)) : 0,
    discomfort_count: discomforts.length,
    records: records,
    streak: computeStreak()
  };
}

function handleCheckin(data) {
  const payload = data || {};
  const plan = store.getPlan();
  if (!plan) return fail(1003, '尚未生成计划，无法打卡');
  payload.plan_id = payload.plan_id || plan.plan_id;

  const check = validators.validateCheckin(payload);
  if (!check.valid) return fail(1001, check.firstError, { errors: check.errors });

  let targetSession = null;
  let targetWeek = null;
  plan.weeks.forEach(function (week) {
    (week.sessions || []).forEach(function (session) {
      if (session.session_id === payload.session_id) {
        targetSession = session;
        targetWeek = week;
      }
    });
  });
  if (!targetSession) return fail(1003, '训练日不存在，请刷新计划后重试');

  const discomfort = (payload.discomfort || []).filter(function (d) {
    return d !== 'none';
  });
  const record = {
    checkin_id: 'ck_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    plan_id: plan.plan_id,
    week_no: targetWeek.week_no,
    session_id: targetSession.session_id,
    date: payload.date || targetSession.date,
    title: targetSession.title,
    status: payload.status,
    completed_action_ids: payload.completed_action_ids || [],
    rpe: Number(payload.rpe),
    discomfort: payload.discomfort || ['none'],
    discomfort_note: payload.discomfort_note || '',
    note: payload.note || '',
    duration_actual_min: Number(payload.duration_actual_min) || targetSession.duration_min,
    created_at: nowIso()
  };

  // 更新计划内训练日状态（服务端行为）
  targetSession.status = payload.status;
  targetSession.checkin_id = record.checkin_id;
  targetWeek.status = computeWeekStatsAfterUpdate(plan, targetWeek);
  store.savePlan(plan);
  store.addCheckin(record);
  store.consumeSubscription(1);

  const safetyReview = discomfort.length
    ? {
        triggered: true,
        limits: discomfort,
        limit_labels: discomfort.map(limitLabelOf),
        message:
          '已记录不适反馈（' +
          discomfort.map(limitLabelOf).join('、') +
          '）。周反馈会触发安全复查，并将相关动作替换为更安全的降阶动作；如持续疼痛请及时就医。'
      }
    : { triggered: false, limits: [], limit_labels: [], message: '' };

  const stats = computeWeekStats(plan, targetWeek.week_no);
  return ok(
    {
      record: record,
      stats: stats,
      safety_review: safetyReview,
      plan_id: plan.plan_id
    },
    '打卡已记录'
  );
}

function computeWeekStatsAfterUpdate(plan, week) {
  const records = store.getCheckins().filter(function (c) {
    return Number(c.week_no) === Number(week.week_no);
  });
  const recordMap = {};
  records.forEach(function (r) {
    recordMap[r.session_id] = r;
  });
  let score = 0;
  week.sessions.forEach(function (s) {
    const r = recordMap[s.session_id];
    if (r) {
      if (r.status === 'done') score += 1;
      else if (r.status === 'partial') score += 0.5;
    }
  });
  const rate = week.sessions.length ? score / week.sessions.length : 0;
  if (rate >= 1) return 'completed';
  if (score > 0) return 'partial';
  return 'pending';
}

function handleGetCheckins(params) {
  const plan = store.getPlan();
  const query = params || {};
  const records = store.getCheckins();
  const weekNo = query.week_no
    ? Number(query.week_no)
    : plan
      ? (findWeekOfPlan(plan, util.todayStr()) || {}).week_no || 1
      : 1;
  return ok({
    records: records,
    stats: plan ? computeWeekStats(plan, weekNo) : null,
    streak: computeStreak(),
    week_no: weekNo,
    total: records.length
  });
}

/* ================= 周反馈与动态调整 ================= */

const CONDITION_FIELD_LABELS = {
  completion_rate: '完成率',
  avg_rpe: '平均 RPE',
  feel: '整体感受',
  has_discomfort: '不适反馈',
  recovery: '恢复情况'
};

function describeCondition(cond) {
  if (cond.all) {
    return cond.all
      .map(function (c) {
        return describeCondition(c);
      })
      .join(' 且 ');
  }
  if (cond.any) {
    return cond.any
      .map(function (c) {
        return describeCondition(c);
      })
      .join(' 或 ');
  }
  const label = CONDITION_FIELD_LABELS[cond.field] || cond.field;
  const ops = { eq: '=', lt: '<', lte: '≤', gt: '>', gte: '≥' };
  const value = typeof cond.value === 'boolean' ? (cond.value ? '有' : '无') : cond.value;
  return label + ' ' + (ops[cond.op] || cond.op) + ' ' + value;
}

function matchCondition(cond, ctx) {
  if (!cond) return false;
  if (cond.all) {
    return cond.all.every(function (c) {
      return matchCondition(c, ctx);
    });
  }
  if (cond.any) {
    return cond.any.some(function (c) {
      return matchCondition(c, ctx);
    });
  }
  const actual = ctx[cond.field];
  switch (cond.op) {
    case 'eq':
      return actual === cond.value;
    case 'lt':
      return Number(actual) < Number(cond.value);
    case 'lte':
      return Number(actual) <= Number(cond.value);
    case 'gt':
      return Number(actual) > Number(cond.value);
    case 'gte':
      return Number(actual) >= Number(cond.value);
    default:
      return false;
  }
}

function evaluateAdjustment(feedback) {
  const table = rules.WEEKLY_ADJUSTMENT_TABLE;
  const ctx = {
    completion_rate: Number(feedback.completion_rate) || 0,
    avg_rpe: Number(feedback.avg_rpe) || 0,
    feel: feedback.feel,
    has_discomfort: !!feedback.has_discomfort,
    recovery: Number(feedback.recovery) || 3
  };
  for (let i = 0; i < table.rules.length; i++) {
    const rule = table.rules[i];
    if (matchCondition(rule.when, ctx)) {
      return {
        rule_id: rule.rule_id,
        type: rule.type,
        label: rule.label,
        summary: rule.summary,
        next_week_action: rule.next_week_action,
        safety_review: !!rule.safety_review,
        condition_text: describeCondition(rule.when),
        matched: true
      };
    }
  }
  return {
    rule_id: 'DEFAULT',
    type: table.defaults.type,
    label: table.defaults.label,
    summary: table.defaults.summary,
    next_week_action: table.defaults.next_week_action,
    safety_review: false,
    condition_text: '未命中特殊规则，按默认策略',
    matched: false
  };
}

function applyAdjustmentToWeek(week, adjustment, profile) {
  const cfg = rules.WEEKLY_ADJUSTMENT_TABLE.adjustments[adjustment.next_week_action] || {};
  const ctx = profile ? buildConstraintContext(profile) : null;
  const copy = util.deepClone(week);
  copy.is_preview = true;
  copy.adjustment_note = adjustment.summary;
  const safetyChanges = [];

  copy.sessions = copy.sessions.map(function (session) {
    let actions = (session.actions || []).map(function (action) {
      const next = Object.assign({}, action);
      // 组次调整（只调主项，热身/放松保持）
      if (action.role === 'main') {
        const setsDelta = Number(cfg.sets_delta) || 0;
        const repsMult = cfg.reps_mult || 1;
        next.sets = Math.max(1, Number(action.sets) + setsDelta);
        let reps = Number(action.reps) * repsMult;
        if (action.unit === '秒') reps = Math.max(10, Math.round(reps / 5) * 5);
        else if (action.unit === '分钟') reps = Math.max(3, Math.round(reps));
        else reps = Math.max(1, Math.round(reps));
        next.reps = reps;
        next.reps_text = next.sets + ' 组 × ' + reps + action.unit;
        // 升阶：替换为进阶动作（仅在安全前提下）
        if (cfg.level_up) {
          const origin = actionLib.getAction(action.action_id);
          const progression = origin && origin.progression_id ? actionLib.getAction(origin.progression_id) : null;
          if (
            progression &&
            ctx &&
            checkAction(progression, ctx).ok
          ) {
            next.action_id = progression.action_id;
            next.name = progression.name;
            next.level = progression.capability_level;
            next.level_label = ['', '入门', '进阶', '高阶'][progression.capability_level] || '入门';
            next.reps_text = next.sets + ' 组 × ' + reps + action.unit;
            safetyChanges.push({
              type: 'upgrade',
              from: action.name,
              to: progression.name,
              reason: '完成度高且强度偏低，升阶 1 个难度'
            });
          }
        }
        // 安全复查：不适反馈触发时，替换禁忌动作
        if (adjustment.safety_review && profile) {
          const limits = (profile.body_limits || []).filter(function (l) {
            return l !== 'none';
          });
          const origin = actionLib.getAction(next.action_id);
          if (
            origin &&
            (origin.contraindications || []).some(function (c) {
              return limits.indexOf(c) >= 0;
            })
          ) {
            const regression = origin.regression_id ? actionLib.getAction(origin.regression_id) : null;
            if (regression && checkAction(regression, ctx).ok) {
              safetyChanges.push({
                type: 'replace',
                from: origin.name,
                to: regression.name,
                reason: '命中身体限制，降阶替换'
              });
              next.action_id = regression.action_id;
              next.name = regression.name;
              next.level = regression.capability_level;
              next.level_label = ['', '入门', '进阶', '高阶'][regression.capability_level] || '入门';
            } else {
              safetyChanges.push({
                type: 'remove',
                from: origin.name,
                to: null,
                reason: '命中身体限制且无安全降阶动作，已从计划中移除'
              });
              return null;
            }
          }
        }
      }
      return next;
    });
    actions = actions.filter(Boolean);
    // 减少动作数量（rest 策略）
    const dropCount = Number(cfg.drop_actions) || 0;
    if (dropCount > 0) {
      let dropped = 0;
      while (dropped < dropCount && actions.length > 1) {
        const mainIndex = actions
          .map(function (a) {
            return a.role;
          })
          .lastIndexOf('main');
        if (mainIndex < 0) break;
        actions.splice(mainIndex, 1);
        dropped += 1;
      }
    }
    session.actions = actions;
    return session;
  });

  return { week: copy, safety_changes: safetyChanges };
}

function buildNextWeekPreview(plan, currentWeekNo, adjustment, profile) {
  const targetWeekNo = Number(currentWeekNo) + 1;
  const existing = plan.weeks.filter(function (w) {
    return w.week_no === targetWeekNo;
  })[0];
  if (!existing) {
    return {
      available: false,
      message: '这是本周期最后一周，建议安排体测复测或重新生成一份 4 周计划。',
      week: null,
      safety_changes: []
    };
  }
  const applied = applyAdjustmentToWeek(existing, adjustment, profile);
  const safeWeek = applied.week;
  return {
    available: true,
    week: safeWeek,
    week_no: safeWeek.week_no,
    phase_name: safeWeek.phase_name,
    weekly_focus: safeWeek.weekly_focus,
    safety_changes: applied.safety_changes,
    message:
      '已按「' +
      adjustment.label +
      '」调整第 ' +
      targetWeekNo +
      ' 周计划：动作数量/组次已更新，可在「计划」页查看。'
  };
}

function handleGetWeeklyFeedback(params) {
  const plan = store.getPlan();
  const query = params || {};
  if (!plan) {
    return ok({
      record: null,
      stats: null,
      history: store.getFeedbacks(),
      plan_summary: null,
      message: '尚未生成计划'
    });
  }
  const weekNo = query.week_no
    ? Number(query.week_no)
    : (findWeekOfPlan(plan, util.todayStr()) || {}).week_no || 1;
  const record = store.getFeedbackByWeek(weekNo);
  const stats = computeWeekStats(plan, weekNo);
  const week = plan.weeks.filter(function (w) {
    return w.week_no === weekNo;
  })[0];
  return ok({
    record: record,
    stats: stats,
    history: store.getFeedbacks(),
    plan_summary: {
      plan_id: plan.plan_id,
      test_date: plan.test_date,
      days_to_test: Math.max(0, util.diffDays(util.todayStr(), plan.test_date)),
      current_week_no: weekNo,
      phase_name: week ? week.phase_name : '',
      weekly_focus: week ? week.weekly_focus : '',
      weak_dimensions: plan.weak_dimensions || [],
      total_weeks: plan.weeks.length
    },
    message: ''
  });
}

function handleSubmitWeeklyFeedback(data) {
  const payload = data || {};
  const plan = store.getPlan();
  if (!plan) return fail(1003, '尚未生成计划，无法提交周反馈');
  payload.plan_id = payload.plan_id || plan.plan_id;

  const check = validators.validateWeeklyFeedback(payload);
  if (!check.valid) return fail(1001, check.firstError, { errors: check.errors });

  const existing = store.getFeedbackByWeek(payload.week_no);
  if (existing) {
    // 重复提交视为更新：先移除旧记录
    const list = store
      .getFeedbacks()
      .filter(function (f) {
        return Number(f.week_no) !== Number(payload.week_no);
      });
    wx.setStorageSync(store.KEYS.feedbacks, list);
  }

  const profile = store.getProfile() || plan.meta.profile_snapshot;
  const adjustment = evaluateAdjustment(payload);
  const preview = buildNextWeekPreview(plan, payload.week_no, adjustment, profile);

  // 把下周预览写回计划（若存在下周），体现「动态调整」
  if (preview.available && preview.week) {
    plan.weeks = plan.weeks.map(function (w) {
      return w.week_no === preview.week.week_no ? preview.week : w;
    });
    plan.meta.updated_at = nowIso();
    store.savePlan(plan);
  }

  const record = {
    feedback_id: 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    plan_id: plan.plan_id,
    week_no: Number(payload.week_no),
    completion_rate: Number(payload.completion_rate) || 0,
    avg_rpe: Number(payload.avg_rpe) || 0,
    feel: payload.feel,
    recovery: Number(payload.recovery) || 3,
    has_discomfort: !!payload.has_discomfort,
    note: payload.note || '',
    adjustment: adjustment,
    next_week: preview.available
      ? {
          week_no: preview.week_no,
          phase_name: preview.phase_name,
          weekly_focus: preview.weekly_focus,
          safety_changes: preview.safety_changes,
          message: preview.message
        }
      : { message: preview.message },
    created_at: nowIso()
  };
  store.addFeedback(record);

  return ok(
    {
      record: record,
      adjustment: adjustment,
      next_week: preview.available ? preview : { available: false, message: preview.message },
      history: store.getFeedbacks(),
      plan_id: plan.plan_id
    },
    '周反馈已提交，下一周计划已调整'
  );
}

/* ================= 饮食提示（拓展，轻量） ================= */

function inferTrainingType() {
  const plan = store.getPlan();
  if (!plan) return { type: 'rest', session: null, label: '休息日' };
  const today = util.todayStr();
  let todaySession = null;
  plan.weeks.forEach(function (w) {
    (w.sessions || []).forEach(function (s) {
      if (s.date === today) todaySession = s;
    });
  });
  if (!todaySession) return { type: 'rest', session: null, label: '休息日' };
  let type = 'strength';
  if (todaySession.theme_key === 'cardio') type = 'cardio';
  else if (todaySession.theme_key === 'mobility') type = 'mobility';
  else type = 'strength';
  return {
    type: type,
    session: todaySession,
    label: labelOf(options.TRAINING_TYPE_OPTIONS, type)
  };
}

function buildDietTips(intake, trainingType) {
  const table = rules.DIET_RULE_TABLE;
  const target = table.targets[trainingType] || table.targets.rest;
  const dims = [];

  function levelOf(actual, targetValue) {
    const ratio = targetValue ? actual / targetValue : 1;
    if (ratio < 0.7) return 'low';
    if (ratio > table.high_threshold_mult) return 'high';
    return 'ok';
  }

  const proteinLevel = levelOf(intake.protein_g, target.protein_g);
  const carbLevel = levelOf(intake.carb_g, target.carb_g);

  function suggestionFoods(category, minValue, key) {
    return foods
      .getFoodsByCategory(category)
      .filter(function (f) {
        return f[key] >= (minValue || 0);
      })
      .sort(function (a, b) {
        return b[key] - a[key];
      })
      .slice(0, 3)
      .map(function (f) {
        return { food_id: f.food_id, name: f.name, unit: f.unit, protein_g: f.protein_g, carb_g: f.carb_g };
      });
  }

  dims.push({
    dimension: 'protein',
    label: '蛋白质',
    level: proteinLevel,
    level_label: proteinLevel === 'low' ? '偏少' : proteinLevel === 'high' ? '较充足' : '基本够用',
    actual_g: intake.protein_g,
    target_g: target.protein_g,
    message: table.messages['protein_' + proteinLevel],
    suggested_foods: suggestionFoods('protein', 6, 'protein_g')
  });
  dims.push({
    dimension: 'carb',
    label: '碳水化合物',
    level: carbLevel,
    level_label: carbLevel === 'low' ? '偏少' : carbLevel === 'high' ? '偏多' : '基本够用',
    actual_g: intake.carb_g,
    target_g: target.carb_g,
    message: table.messages['carb_' + carbLevel],
    suggested_foods: suggestionFoods('carb', 17, 'carb_g')
  });

  return dims;
}

function handleDietTips(params) {
  if (!config.features.diet) return fail(1001, '饮食提示功能未开启');
  const query = params || {};
  const date = query.date || util.todayStr();
  const inferred = inferTrainingType();
  const trainingType = query.training_type || inferred.type;
  const selections = Array.isArray(query.foods) ? query.foods : [];
  const intake = foods.sumFoods(selections);
  const tips = buildDietTips(intake, trainingType);

  return ok({
    date: date,
    training_type: trainingType,
    training_label: labelOf(options.TRAINING_TYPE_OPTIONS, trainingType),
    training_session: inferred.session
      ? {
          session_id: inferred.session.session_id,
          title: inferred.session.title,
          date: inferred.session.date
        }
      : null,
    intake: intake,
    tips: tips,
    food_table: foods.getFoods(),
    dimensions: options.DIET_DIMENSIONS,
    disclaimer: rules.DIET_RULE_TABLE.disclaimer,
    generated_at: nowIso()
  });
}

/* ================= 安全拦截日志 ================= */

function handleGetIntercepts() {
  const plan = store.getPlan();
  const logs = plan ? plan.safety_intercepts || [] : [];
  const byType = {};
  logs.forEach(function (log) {
    byType[log.rule_type] = (byType[log.rule_type] || 0) + 1;
  });
  return ok({
    plan_id: plan ? plan.plan_id : null,
    total: logs.length,
    logs: logs,
    by_type: byType,
    safety_table_version: rules.SAFETY_TABLE.version
  });
}

/* ================= 路由 ================= */

function handle(method, path, data) {
  const cleanPath = String(path || '').split('?')[0];
  const segments = cleanPath.split('/').filter(function (s) {
    return !!s;
  });
  const m = String(method || 'GET').toUpperCase();
  const key = segments.join('/');

  // 用户画像
  if (m === 'POST' && key === 'profile') return handleSaveProfile(data);
  if (m === 'GET' && key === 'profile') return handleGetProfile();
  if (m === 'POST' && key === 'profile/parse') return handleParseProfile(data);

  // 诊断
  if (m === 'POST' && key === 'diagnosis') return handleDiagnosis(data);

  // 计划
  if (m === 'POST' && key === 'plan/generate') return handleGeneratePlan(data);
  if (m === 'GET' && key === 'plan/current') return handleGetCurrentPlan();
  if (m === 'POST' && key === 'plan/explain') return handleExplainPlan(data);
  if (m === 'GET' && segments[0] === 'plan' && segments[1]) {
    return handleGetPlan(segments[1]);
  }

  // 动作
  if (m === 'GET' && segments[0] === 'actions' && segments[1]) {
    return handleGetAction(segments[1]);
  }

  // 打卡
  if (m === 'POST' && key === 'checkin') return handleCheckin(data);
  if (m === 'GET' && key === 'checkin') return handleGetCheckins(data);

  // 周反馈
  if (m === 'GET' && key === 'feedback/weekly') return handleGetWeeklyFeedback(data);
  if (m === 'POST' && key === 'feedback/weekly') return handleSubmitWeeklyFeedback(data);

  // 饮食
  if (m === 'GET' && key === 'diet/tips') return handleDietTips(data);

  // 拦截日志
  if (m === 'GET' && key === 'logs/intercepts') return handleGetIntercepts();

  return fail(4040, '接口不存在：' + m + ' ' + cleanPath);
}

module.exports = {
  handle: handle,
  // 导出内部函数便于 Node 侧自测与后续迁移到后端时对照
  buildDiagnosis: buildDiagnosis,
  filterActions: filterActions,
  generatePlan: handleGeneratePlan,
  computeStreak: computeStreak,
  computeWeekStats: computeWeekStats,
  evaluateAdjustment: evaluateAdjustment,
  buildDietTips: buildDietTips
};
