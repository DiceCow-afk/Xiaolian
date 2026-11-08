/**
 * 动作库 v1.0（35 个动作，8 个标注字段 + 示范/教学扩展字段）
 * 字段口径（与后端接口契约一致）：
 *  action_id            动作唯一 ID
 *  name                 动作名称
 *  pattern              动作模式 squat/hinge/lunge/push/pull/core/cardio/jump/mobility
 *  ability_dimensions   目标能力维度及权重
 *  equipment            所需器械（none 无器械 / bottle 矿泉水瓶 / band 弹力带 / bar 单杠）
 *  space                适做空间（dorm 宿舍室内 / track 操场户外 / gym 健身房）
 *  capability_level     能力门槛 1-3
 *  regression_id        降阶动作 ID（可为 null）
 *  progression_id       升阶动作 ID（可为 null）
 *  contraindications    禁忌身体限制（knee / shoulder / waist）
 *  sets_template        组次模板
 *  demo_resource_id     示范资源 ID（null 表示以图文要点呈现）
 *  demo_frames          关键帧数量（>0 时前端逐帧播放）
 *  key_points/steps/common_errors/correct_vs_wrong/breathing/safety_note  教学字段
 */
const ACTIONS = [
  /* ================= 下肢：蹲 / 弓步 ================= */
  {
    action_id: 'squat',
    name: '徒手深蹲',
    pattern: 'squat',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.7 },
      { key: 'core', weight: 0.2 },
      { key: 'coordination', weight: 0.1 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: 'chair_squat',
    progression_id: 'jump_squat',
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 12, unit: '次', rest_sec: 60 },
    demo_resource_id: 'demo.squat',
    demo_frames: 4,
    key_points: ['膝盖与脚尖同向，不要内扣', '下蹲到大腿接近平行地面即可', '全程脚掌踩实，重心在足中'],
    steps: ['双脚与肩同宽，脚尖略外展 15°', '屈髋屈膝下蹲，臀部向后下方坐', '大腿接近平行后蹬地起身，站直但不锁膝'],
    common_errors: [
      { wrong: '膝盖内扣、脚跟离地', fix: '双脚踩实，膝盖主动对向脚尖' },
      { wrong: '弓腰含胸、下蹲过深', fix: '保持背部挺直，控制在下蹲不塌腰的深度' }
    ],
    correct_vs_wrong: [
      { aspect: '膝盖方向', correct: '与脚尖同向', wrong: '向内扣' },
      { aspect: '躯干', correct: '胸挺背直、略前倾', wrong: '弯腰塌背' }
    ],
    breathing: '下蹲时吸气，蹬地起身时呼气',
    safety_note: '膝盖不适时改用椅子深蹲并减小幅度；有锐痛立即停止',
    tags: ['徒手', '宿舍可做', '下肢基础']
  },
  {
    action_id: 'chair_squat',
    name: '椅子深蹲',
    pattern: 'squat',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.6 },
      { key: 'core', weight: 0.25 },
      { key: 'coordination', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'squat',
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 10, unit: '次', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['臀部轻触椅面即起身，不做到完全坐实', '重心放在脚跟与足中', '控制下放速度，2 秒下、1 秒起'],
    steps: ['臀部位于椅子前缘，双脚与肩同宽', '屈髋屈膝缓慢下坐，臀部轻触椅面', '脚跟发力起身站直'],
    common_errors: [
      { wrong: '一屁股坐实再起身，失去控制', fix: '轻触即起，保持核心收紧' },
      { wrong: '上半身过度前倾', fix: '胸部打开，视线看前下方' }
    ],
    correct_vs_wrong: [
      { aspect: '下放速度', correct: '缓慢有控制', wrong: '自由落体' },
      { aspect: '起身发力', correct: '脚跟蹬地', wrong: '脚尖发力、膝内扣' }
    ],
    breathing: '下坐吸气，起身呼气',
    safety_note: '椅子/床沿要稳固，避免带轮子的椅子',
    tags: ['徒手', '零基础', '宿舍可做']
  },
  {
    action_id: 'jump_squat',
    name: '深蹲跳',
    pattern: 'jump',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.65 },
      { key: 'speed', weight: 0.2 },
      { key: 'coordination', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['track', 'gym'],
    capability_level: 3,
    regression_id: 'squat',
    progression_id: null,
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 8, unit: '次', rest_sec: 90 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['落地时屈膝缓冲，声音尽量轻', '起跳瞬间快速伸髋伸膝', '组间充分休息，质量优先'],
    steps: ['下蹲到半蹲位，双臂后摆', '快速蹬地起跳，身体向上伸展', '前脚掌柔和落地，顺势下蹲缓冲'],
    common_errors: [
      { wrong: '落地直膝、砰地砸地', fix: '落地立即屈膝屈髋缓冲' },
      { wrong: '连续跳到力竭导致动作变形', fix: '每组 8 次左右，质量下降就停' }
    ],
    correct_vs_wrong: [
      { aspect: '落地', correct: '前脚掌先落地、屈膝缓冲', wrong: '脚后跟重砸' },
      { aspect: '次数', correct: '少量高质量', wrong: '力竭后硬撑' }
    ],
    breathing: '起跳呼气，落地吸气',
    safety_note: '体重较大或膝踝不适者不要做跳跃类动作，用深蹲替代',
    tags: ['进阶', '爆发力', '操场']
  },
  {
    action_id: 'lunge',
    name: '原地弓步蹲',
    pattern: 'lunge',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.6 },
      { key: 'core', weight: 0.25 },
      { key: 'coordination', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 2,
    regression_id: 'chair_squat',
    progression_id: 'jump_squat',
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 10, unit: '次/侧', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['前脚膝盖与脚尖同向，不超过脚尖过多', '后膝接近地面但不触地', '躯干保持直立、核心收紧'],
    steps: ['双脚前后开立约一大步', '下蹲至前腿大腿接近水平、后膝接近地面', '前脚跟发力回到起始位，换侧'],
    common_errors: [
      { wrong: '身体左右晃动、前膝内扣', fix: '放慢速度，双手叉腰保持稳定' },
      { wrong: '步幅过小导致膝盖过度前顶', fix: '加大前后步幅' }
    ],
    correct_vs_wrong: [
      { aspect: '步幅', correct: '约一大步', wrong: '小碎步' },
      { aspect: '躯干', correct: '直立稳定', wrong: '前倾扭转' }
    ],
    breathing: '下蹲吸气，起身呼气',
    safety_note: '平衡不稳时扶墙练习；膝盖不适改为椅子深蹲',
    tags: ['徒手', '下肢', '平衡']
  },
  {
    action_id: 'wall_sit',
    name: '靠墙静蹲',
    pattern: 'squat',
    ability_dimensions: [
      { key: 'endurance', weight: 0.5 },
      { key: 'lower_power', weight: 0.4 },
      { key: 'core', weight: 0.1 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'squat',
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 30, unit: '秒', rest_sec: 60 },
    demo_resource_id: 'demo.wall_sit',
    demo_frames: 4,
    key_points: ['大腿与地面接近平行，膝盖约 90°', '膝盖与脚尖同向，不内扣', '背部贴墙、自然呼吸不憋气'],
    steps: ['背靠墙站立，双脚前移一步', '沿墙缓慢下滑至大腿接近水平', '保持姿势，均匀呼吸，时间到后缓慢起身'],
    common_errors: [
      { wrong: '蹲得过低导致膝盖压力大', fix: '大腿平行地面即可，膝角不小于 90°' },
      { wrong: '憋气硬撑', fix: '保持均匀呼吸，按时间分组' }
    ],
    correct_vs_wrong: [
      { aspect: '膝角', correct: '约 90°', wrong: '过小（深蹲过锐）' },
      { aspect: '背部', correct: '贴墙', wrong: '离开墙面驼背' }
    ],
    breathing: '自然均匀呼吸，不要憋气',
    safety_note: '膝盖不适者减小下蹲角度或改为椅子深蹲',
    tags: ['徒手', '宿舍可做', '静力耐力']
  },
  /* ================= 下肢：髋 / 小腿 / 台阶 ================= */
  {
    action_id: 'glute_bridge',
    name: '臀桥',
    pattern: 'hinge',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.5 },
      { key: 'core', weight: 0.35 },
      { key: 'endurance', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'single_leg_bridge',
    contraindications: [],
    sets_template: { sets: 3, reps: 15, unit: '次', rest_sec: 45 },
    demo_resource_id: 'demo.glute_bridge',
    demo_frames: 4,
    key_points: ['用臀部发力顶起，不是腰部反弓', '顶部停 1-2 秒夹紧臀部', '肩、髋、膝大致成一条直线'],
    steps: ['仰卧屈膝，双脚踩地与髋同宽', '臀部发力向上顶起至肩髋膝成直线', '停 1-2 秒后缓慢下放，不落地'],
    common_errors: [
      { wrong: '腰部过度反弓代偿', fix: '先收紧腹部，用臀肌发力' },
      { wrong: '顶起时膝盖内扣', fix: '膝盖对向脚尖，可夹一个水瓶在膝间' }
    ],
    correct_vs_wrong: [
      { aspect: '顶部高度', correct: '肩髋膝成直线', wrong: '腰塌成反弓' },
      { aspect: '发力部位', correct: '臀部与大腿后侧', wrong: '腰部与大腿前侧' }
    ],
    breathing: '顶起呼气，下放吸气',
    safety_note: '腰部不适时减小顶起幅度，以不出现腰部酸痛为前提',
    tags: ['徒手', '宿舍可做', '臀腿']
  },
  {
    action_id: 'single_leg_bridge',
    name: '单腿臀桥',
    pattern: 'hinge',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.5 },
      { key: 'core', weight: 0.35 },
      { key: 'coordination', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 2,
    regression_id: 'glute_bridge',
    progression_id: null,
    contraindications: [],
    sets_template: { sets: 3, reps: 10, unit: '次/侧', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['骨盆保持水平，不旋转', '支撑脚踩实，用单侧臀肌顶起', '动作全程慢速可控'],
    steps: ['仰卧屈膝，一脚踩地、另一腿伸直抬起', '单侧臀部发力顶起至肩髋膝成直线', '缓慢下放，完成一侧后换边'],
    common_errors: [
      { wrong: '骨盆旋转、身体歪斜', fix: '降低幅度，双手扶髋感知水平' },
      { wrong: '用腰部代偿顶起', fix: '先收腹，再启动臀肌' }
    ],
    correct_vs_wrong: [
      { aspect: '骨盆', correct: '水平稳定', wrong: '一侧下沉旋转' },
      { aspect: '速度', correct: '慢速控制', wrong: '借力弹起' }
    ],
    breathing: '顶起呼气，下放吸气',
    safety_note: '腰部不适者改做双腿臀桥',
    tags: ['进阶', '臀腿', '平衡']
  },
  {
    action_id: 'hip_hinge',
    name: '髋铰链（早安式）',
    pattern: 'hinge',
    ability_dimensions: [
      { key: 'core', weight: 0.4 },
      { key: 'lower_power', weight: 0.4 },
      { key: 'coordination', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: null,
    contraindications: ['waist'],
    sets_template: { sets: 3, reps: 12, unit: '次', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['以髋为轴，臀部向后推', '背部平直，小腿尽量垂直地面', '感受大腿后侧拉伸'],
    steps: ['双脚与肩同宽，双手抱头或自然下垂', '屈髋向后推臀，上身前倾至躯干接近水平', '大腿后侧发力回到站立'],
    common_errors: [
      { wrong: '弓背、腰椎弯曲', fix: '先挺胸收腹，保持脊柱中立' },
      { wrong: '靠屈膝下蹲代替髋铰链', fix: '想象身后有一堵墙，用臀部向后找墙' }
    ],
    correct_vs_wrong: [
      { aspect: '背部', correct: '平直中立', wrong: '弓背' },
      { aspect: '髋膝', correct: '以髋为主、微屈膝', wrong: '变成深蹲' }
    ],
    breathing: '后推吸气，起身呼气',
    safety_note: '腰部不适者不做此动作，可改为猫牛式放松',
    tags: ['徒手', '后链', '动作模式']
  },
  {
    action_id: 'calf_raise',
    name: '提踵',
    pattern: 'squat',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.7 },
      { key: 'endurance', weight: 0.3 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'jump_squat',
    contraindications: [],
    sets_template: { sets: 3, reps: 20, unit: '次', rest_sec: 30 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['踮到最高点停 1 秒', '下放缓慢，脚跟不完全落地也可', '扶墙保持平衡'],
    steps: ['双脚并拢或与肩同宽站立，可扶墙', '前脚掌发力踮起脚跟至最高点', '停 1 秒后缓慢下放脚跟'],
    common_errors: [
      { wrong: '快速弹震、幅度不足', fix: '放慢节奏，顶部停 1 秒' },
      { wrong: '脚踝向外翻', fix: '保持脚踝中立，重心在前脚掌内侧与外侧均匀' }
    ],
    correct_vs_wrong: [
      { aspect: '顶部', correct: '停 1 秒', wrong: '快速上下弹' },
      { aspect: '幅度', correct: '完整踮起', wrong: '半程晃动' }
    ],
    breathing: '踮起呼气，下放吸气',
    safety_note: '跟腱或脚踝不适时暂停',
    tags: ['徒手', '小腿', '宿舍可做']
  },
  {
    action_id: 'step_up',
    name: '台阶踏步',
    pattern: 'lunge',
    ability_dimensions: [
      { key: 'lower_power', weight: 0.5 },
      { key: 'coordination', weight: 0.3 },
      { key: 'core', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['track', 'dorm'],
    capability_level: 1,
    regression_id: 'chair_squat',
    progression_id: 'lunge',
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 10, unit: '次/侧', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['用踏上台阶的那条腿发力，不靠后腿蹬地', '上身直立，膝盖与脚尖同向', '下台阶也要控制速度'],
    steps: ['面对稳固台阶/台阶边缘站立', '一脚踏上台阶，脚掌踩实', '前腿发力站上台阶，再控制下放换边'],
    common_errors: [
      { wrong: '后腿猛蹬借力', fix: '后脚只做轻触，主要用前腿发力' },
      { wrong: '踏步过高导致膝内扣', fix: '选 15-20cm 的台阶，膝盖对向脚尖' }
    ],
    correct_vs_wrong: [
      { aspect: '发力腿', correct: '踏上台阶的腿', wrong: '后腿蹬地借力' },
      { aspect: '台阶高度', correct: '15-20cm 稳定台面', wrong: '过高不稳' }
    ],
    breathing: '踏上呼气，下放吸气',
    safety_note: '选择稳固台阶，潮湿或不平整地面不做',
    tags: ['徒手', '操场', '下肢']
  },
  /* ================= 核心 ================= */
  {
    action_id: 'plank',
    name: '平板支撑',
    pattern: 'core',
    ability_dimensions: [
      { key: 'core', weight: 0.75 },
      { key: 'endurance', weight: 0.25 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'side_plank',
    contraindications: [],
    sets_template: { sets: 3, reps: 30, unit: '秒', rest_sec: 45 },
    demo_resource_id: 'demo.plank',
    demo_frames: 4,
    key_points: ['头、肩、髋、踝成一条直线', '收紧腹部与臀部，不塌腰不撅臀', '自然呼吸，不憋气'],
    steps: ['俯卧，前臂支撑，肘在肩正下方', '脚尖点地，身体撑起成一条直线', '保持姿势，均匀呼吸到规定时间'],
    common_errors: [
      { wrong: '塌腰或撅臀', fix: '先收紧腹部和臀部，宁可缩短时间' },
      { wrong: '头部下垂或抬起过高', fix: '视线看双手前方一点' }
    ],
    correct_vs_wrong: [
      { aspect: '身体线条', correct: '一条直线', wrong: '塌腰/撅臀' },
      { aspect: '肩肘', correct: '肘在肩正下方', wrong: '肘过于靠前' }
    ],
    breathing: '保持均匀呼吸，不憋气',
    safety_note: '腰部不适时改为跪姿平板或死虫式',
    tags: ['徒手', '宿舍可做', '核心']
  },
  {
    action_id: 'side_plank',
    name: '侧平板支撑',
    pattern: 'core',
    ability_dimensions: [
      { key: 'core', weight: 0.7 },
      { key: 'coordination', weight: 0.2 },
      { key: 'endurance', weight: 0.1 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 2,
    regression_id: 'plank',
    progression_id: null,
    contraindications: [],
    sets_template: { sets: 2, reps: 20, unit: '秒/侧', rest_sec: 45 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['髋部向上顶，身体侧面成一条直线', '支撑肘在肩正下方', '不耸肩，肩颈放松'],
    steps: ['侧卧，前臂支撑，肘在肩下', '髋部抬起，身体成一条直线', '保持规定时间后换边'],
    common_errors: [
      { wrong: '髋部下沉或身体前后旋转', fix: '减少时长，保持骨盆稳定' },
      { wrong: '耸肩', fix: '肩胛骨下沉，耳朵远离肩膀' }
    ],
    correct_vs_wrong: [
      { aspect: '髋部', correct: '抬起成直线', wrong: '塌向地面' },
      { aspect: '肩部', correct: '下沉稳定', wrong: '耸肩' }
    ],
    breathing: '均匀呼吸',
    safety_note: '肩颈不适时不做侧平板',
    tags: ['进阶', '核心', '宿舍可做']
  },
  {
    action_id: 'dead_bug',
    name: '死虫式',
    pattern: 'core',
    ability_dimensions: [
      { key: 'core', weight: 0.8 },
      { key: 'coordination', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'bird_dog',
    contraindications: [],
    sets_template: { sets: 3, reps: 10, unit: '次/侧', rest_sec: 45 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['下背始终贴地，不出现腰部反弓', '对侧手脚缓慢伸展', '动作越慢越有效'],
    steps: ['仰卧屈髋屈膝，双手向上伸直', '对侧手臂与腿缓慢伸向远方', '收回换边，全程保持下背贴地'],
    common_errors: [
      { wrong: '腰部拱起离开地面', fix: '缩小幅度，只伸到腰能贴地的位置' },
      { wrong: '动作过快像蹬腿', fix: '放慢到 3 秒伸展、3 秒收回' }
    ],
    correct_vs_wrong: [
      { aspect: '下背', correct: '贴地稳定', wrong: '拱起' },
      { aspect: '节奏', correct: '缓慢控制', wrong: '快速甩动' }
    ],
    breathing: '伸展时呼气，收回时吸气',
    safety_note: '腰部不适时缩小幅度或只做单侧腿',
    tags: ['徒手', '宿舍可做', '核心稳定']
  },
  {
    action_id: 'bird_dog',
    name: '鸟狗式',
    pattern: 'core',
    ability_dimensions: [
      { key: 'core', weight: 0.65 },
      { key: 'coordination', weight: 0.2 },
      { key: 'lower_power', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: 'dead_bug',
    progression_id: null,
    contraindications: [],
    sets_template: { sets: 3, reps: 10, unit: '次/侧', rest_sec: 45 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['四点支撑，对侧手脚同时伸展', '骨盆保持水平，不左右倾斜', '伸展时背部平直'],
    steps: ['双手双膝撑地，手在肩下、膝在髋下', '伸展对侧手臂与腿至与地面平行', '停 1 秒后收回换边'],
    common_errors: [
      { wrong: '腰部下塌、骨盆倾斜', fix: '收紧核心，想象背上放一杯水' },
      { wrong: '伸展过高导致腰椎过伸', fix: '手脚伸到与地面平行即可' }
    ],
    correct_vs_wrong: [
      { aspect: '骨盆', correct: '水平', wrong: '一侧下沉' },
      { aspect: '背部', correct: '平直', wrong: '塌腰反弓' }
    ],
    breathing: '伸展呼气，收回吸气',
    safety_note: '手腕不适时改用前臂支撑',
    tags: ['徒手', '核心', '宿舍可做']
  },
  {
    action_id: 'crunch',
    name: '卷腹',
    pattern: 'core',
    ability_dimensions: [
      { key: 'core', weight: 0.85 },
      { key: 'endurance', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'reverse_crunch',
    contraindications: ['waist'],
    sets_template: { sets: 3, reps: 15, unit: '次', rest_sec: 45 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['下背贴地，用腹部卷起肩胛骨', '不要用手拉头', '下落时控制，不完全放松'],
    steps: ['仰卧屈膝，双手轻放耳侧', '呼气收腹，肩胛骨离地卷起', '吸气缓慢下放至肩胛骨触地'],
    common_errors: [
      { wrong: '双手抱头向前拽', fix: '双手只做轻触，下巴微收' },
      { wrong: '靠惯性快速起落', fix: '放慢节奏，感受腹部发力' }
    ],
    correct_vs_wrong: [
      { aspect: '发力', correct: '腹部卷起', wrong: '颈部与手臂拉扯' },
      { aspect: '下背', correct: '贴地', wrong: '拱起' }
    ],
    breathing: '卷起呼气，下放吸气',
    safety_note: '腰部不适时改做死虫式',
    tags: ['徒手', '宿舍可做', '腹肌']
  },
  {
    action_id: 'reverse_crunch',
    name: '反向卷腹',
    pattern: 'core',
    ability_dimensions: [
      { key: 'core', weight: 0.8 },
      { key: 'coordination', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: 'crunch',
    progression_id: null,
    contraindications: ['waist'],
    sets_template: { sets: 3, reps: 12, unit: '次', rest_sec: 45 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['用下腹卷起骨盆，不是甩腿', '下背贴地，动作幅度小而准', '下放时控制速度'],
    steps: ['仰卧，双腿屈髋屈膝抬起', '下腹发力将骨盆卷向胸口', '缓慢下放骨盆回到起始位'],
    common_errors: [
      { wrong: '靠惯性甩腿', fix: '放慢速度，用腹部卷骨盆' },
      { wrong: '腰部拱起', fix: '保持下背贴地，幅度小一点' }
    ],
    correct_vs_wrong: [
      { aspect: '发力', correct: '下腹卷骨盆', wrong: '大腿甩动' },
      { aspect: '幅度', correct: '小而精准', wrong: '大幅摆动' }
    ],
    breathing: '卷起呼气，下放吸气',
    safety_note: '腰部不适者不做',
    tags: ['徒手', '宿舍可做', '下腹']
  },
  /* ================= 上肢：推 ================= */
  {
    action_id: 'pushup',
    name: '俯卧撑',
    pattern: 'push',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.65 },
      { key: 'core', weight: 0.25 },
      { key: 'coordination', weight: 0.1 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 2,
    regression_id: 'knee_pushup',
    progression_id: null,
    contraindications: ['shoulder'],
    sets_template: { sets: 3, reps: 10, unit: '次', rest_sec: 75 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['身体从头到脚成一条直线', '肘部与身体约 45° 夹角', '下放至胸部接近地面'],
    steps: ['双手略宽于肩，脚掌撑地', '屈肘下放身体，肘部约 45°', '推起回到起始位，全程核心收紧'],
    common_errors: [
      { wrong: '撅臀或塌腰', fix: '收紧腹部与臀部，身体成一条直线' },
      { wrong: '肘部外展成 90°', fix: '肘部夹角控制在 45° 左右' }
    ],
    correct_vs_wrong: [
      { aspect: '身体', correct: '一条直线', wrong: '撅臀/塌腰' },
      { aspect: '肘部', correct: '约 45°', wrong: '完全外展' }
    ],
    breathing: '下放吸气，推起呼气',
    safety_note: '肩颈不适或手腕不适时改做上斜俯卧撑或跪姿俯卧撑',
    tags: ['徒手', '上肢推', '进阶']
  },
  {
    action_id: 'knee_pushup',
    name: '跪姿俯卧撑',
    pattern: 'push',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.6 },
      { key: 'core', weight: 0.3 },
      { key: 'coordination', weight: 0.1 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'pushup',
    contraindications: ['shoulder'],
    sets_template: { sets: 3, reps: 12, unit: '次', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['膝盖着地，身体从头到膝成一条直线', '肘部约 45° 夹角', '下放控制，胸口接近地面'],
    steps: ['双手略宽于肩，双膝着地', '屈肘下放至胸口接近地面', '推起回到起始位，保持身体成直线'],
    common_errors: [
      { wrong: '塌腰、臀部后坐', fix: '收紧核心，身体从头到膝成直线' },
      { wrong: '肘部外展', fix: '肘部约 45° 靠近身体' }
    ],
    correct_vs_wrong: [
      { aspect: '身体', correct: '从头到膝一条直线', wrong: '塌腰' },
      { aspect: '下放深度', correct: '胸口接近地面', wrong: '只做小幅度' }
    ],
    breathing: '下放吸气，推起呼气',
    safety_note: '肩部不适时停做，改弹力带划船',
    tags: ['徒手', '零基础', '宿舍可做']
  },
  {
    action_id: 'incline_pushup',
    name: '上斜俯卧撑',
    pattern: 'push',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.6 },
      { key: 'core', weight: 0.25 },
      { key: 'coordination', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: 'knee_pushup',
    progression_id: 'pushup',
    contraindications: ['shoulder'],
    sets_template: { sets: 3, reps: 12, unit: '次', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['手撑桌沿或台阶，高度越高越轻松', '身体成一条直线', '肘部约 45° 夹角'],
    steps: ['双手撑在稳固桌面/台阶上', '屈肘下放胸口靠近支撑面', '推起回到起始位'],
    common_errors: [
      { wrong: '支撑物不稳', fix: '选择稳固台面，避免玻璃/带轮家具' },
      { wrong: '塌腰', fix: '收紧核心，身体成直线' }
    ],
    correct_vs_wrong: [
      { aspect: '支撑面', correct: '稳固台面', wrong: '床沿软面/窗台' },
      { aspect: '身体', correct: '直线', wrong: '塌腰' }
    ],
    breathing: '下放吸气，推起呼气',
    safety_note: '肩部不适时停做',
    tags: ['徒手', '零基础', '宿舍可做']
  },
  {
    action_id: 'bench_dip',
    name: '椅背臂屈伸',
    pattern: 'push',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.7 },
      { key: 'core', weight: 0.2 },
      { key: 'coordination', weight: 0.1 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 2,
    regression_id: 'incline_pushup',
    progression_id: 'pushup',
    contraindications: ['shoulder'],
    sets_template: { sets: 3, reps: 10, unit: '次', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['背对椅子，双手撑住椅面边缘', '屈肘下放至肘约 90°，不耸肩', '用肱三头肌推起'],
    steps: ['背对稳固椅子，双手撑住椅面边缘', '双脚前移，屈肘缓慢下放身体', '肘约 90° 时推起回到起始位'],
    common_errors: [
      { wrong: '耸肩、肩膀向上缩', fix: '肩胛骨下沉，胸打开' },
      { wrong: '下放过深压迫肩关节', fix: '下放至肘约 90° 即可' }
    ],
    correct_vs_wrong: [
      { aspect: '肩部', correct: '下沉稳定', wrong: '耸肩' },
      { aspect: '深度', correct: '肘约 90°', wrong: '过深或过浅' }
    ],
    breathing: '下放吸气，推起呼气',
    safety_note: '肩部不适或有肩伤史者不做',
    tags: ['徒手', '上肢', '宿舍可做']
  },
  {
    action_id: 'bottle_press',
    name: '水瓶推举',
    pattern: 'push',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.75 },
      { key: 'core', weight: 0.15 },
      { key: 'coordination', weight: 0.1 }
    ],
    equipment: ['bottle'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: 'incline_pushup',
    progression_id: 'pushup',
    contraindications: ['shoulder'],
    sets_template: { sets: 3, reps: 12, unit: '次', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['双手持水瓶，掌心朝前', '核心收紧，避免腰部反弓', '推起时手臂不完全锁死'],
    steps: ['坐姿或站姿，双手各持一瓶水置于肩侧', '向上推起至手臂接近伸直', '缓慢下放至肩侧'],
    common_errors: [
      { wrong: '推起时腰部过度反弓', fix: '收紧腹部，背部贴稳椅背或保持中立' },
      { wrong: '重量太大导致耸肩', fix: '用 500ml 水瓶即可，宁轻勿重' }
    ],
    correct_vs_wrong: [
      { aspect: '腰部', correct: '稳定不反弓', wrong: '过度反弓' },
      { aspect: '肘部', correct: '不完全锁死', wrong: '猛烈锁死' }
    ],
    breathing: '下放吸气，推起呼气',
    safety_note: '肩部不适者不做，可改弹力带划船',
    tags: ['水瓶', '宿舍可做', '上肢']
  },
  /* ================= 上肢：拉 ================= */
  {
    action_id: 'band_row',
    name: '弹力带划船',
    pattern: 'pull',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.65 },
      { key: 'core', weight: 0.2 },
      { key: 'coordination', weight: 0.15 }
    ],
    equipment: ['band'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'pullup',
    contraindications: [],
    sets_template: { sets: 3, reps: 12, unit: '次', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['先沉肩，再用背部发力拉', '肘部贴近身体向后拉', '顶端夹紧肩胛骨停 1 秒'],
    steps: ['将弹力带固定在门/床架，双手握带', '沉肩屈肘向后拉，肘贴近身体', '顶端夹紧肩胛骨 1 秒后缓慢还原'],
    common_errors: [
      { wrong: '耸肩、用手臂硬拉', fix: '先沉肩，感受背部发力' },
      { wrong: '身体后仰借力', fix: '身体保持稳定，核心收紧' }
    ],
    correct_vs_wrong: [
      { aspect: '肩胛', correct: '先沉肩再后拉', wrong: '耸肩' },
      { aspect: '发力', correct: '背部主导', wrong: '手臂甩动' }
    ],
    breathing: '后拉呼气，还原吸气',
    safety_note: '弹力带固定点要牢靠，避免正对脸部回弹',
    tags: ['弹力带', '上肢拉', '宿舍可做']
  },
  {
    action_id: 'pullup',
    name: '引体向上',
    pattern: 'pull',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.75 },
      { key: 'core', weight: 0.15 },
      { key: 'coordination', weight: 0.1 }
    ],
    equipment: ['bar'],
    space: ['track', 'gym'],
    capability_level: 3,
    regression_id: 'scapular_pull',
    progression_id: null,
    contraindications: ['shoulder'],
    sets_template: { sets: 3, reps: 5, unit: '次', rest_sec: 120 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['先沉肩再屈肘上拉', '下巴过杠即可，不甩摆', '下放控制，不自由落体'],
    steps: ['双手正握单杠，略宽于肩', '沉肩收腹，屈肘向上拉至下巴过杠', '缓慢下放至手臂伸直'],
    common_errors: [
      { wrong: '靠身体摆动借力', fix: '核心收紧，控制摆幅；宁可减少次数' },
      { wrong: '耸肩、脖子前伸', fix: '先下沉肩胛骨再拉' }
    ],
    correct_vs_wrong: [
      { aspect: '启动', correct: '先沉肩', wrong: '耸肩硬拉' },
      { aspect: '下放', correct: '控制离心', wrong: '自由落体' }
    ],
    breathing: '上拉呼气，下放吸气',
    safety_note: '肩部不适或体重较大者先做肩胛引体与弹力带划船',
    tags: ['单杠', '进阶', '上肢拉']
  },
  {
    action_id: 'scapular_pull',
    name: '肩胛引体',
    pattern: 'pull',
    ability_dimensions: [
      { key: 'upper_strength', weight: 0.5 },
      { key: 'coordination', weight: 0.3 },
      { key: 'core', weight: 0.2 }
    ],
    equipment: ['bar'],
    space: ['track', 'gym'],
    capability_level: 2,
    regression_id: 'band_row',
    progression_id: 'pullup',
    contraindications: ['shoulder'],
    sets_template: { sets: 3, reps: 8, unit: '次', rest_sec: 90 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['手臂保持伸直，只做肩胛下沉', '身体轻微上升 3-5cm 即可', '不借助摆腿'],
    steps: ['双手握杠悬垂，手臂伸直', '沉肩让身体微微上升，肩胛骨向下收紧', '缓慢放松回到悬垂位'],
    common_errors: [
      { wrong: '屈肘做成引体', fix: '手臂保持伸直，只动肩胛' },
      { wrong: '身体晃动', fix: '收紧核心，慢上慢下' }
    ],
    correct_vs_wrong: [
      { aspect: '手臂', correct: '伸直', wrong: '弯曲' },
      { aspect: '幅度', correct: '小幅下沉', wrong: '大幅摆动' }
    ],
    breathing: '下沉呼气，放松吸气',
    safety_note: '肩部不适者不做悬垂动作',
    tags: ['单杠', '入门', '引体基础']
  },
  /* ================= 心肺 / 敏捷 ================= */
  {
    action_id: 'high_knees',
    name: '原地高抬腿',
    pattern: 'cardio',
    ability_dimensions: [
      { key: 'endurance', weight: 0.45 },
      { key: 'speed', weight: 0.35 },
      { key: 'coordination', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'sprint_interval',
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 30, unit: '秒', rest_sec: 45 },
    demo_resource_id: 'demo.high_knees',
    demo_frames: 4,
    key_points: ['大腿抬到接近水平', '前脚掌快速交替落地，声音轻', '上身直立，摆臂配合'],
    steps: ['站立，核心收紧，双手自然摆臂', '交替快速抬膝至大腿接近水平', '保持节奏，按时间完成'],
    common_errors: [
      { wrong: '含胸驼背、膝盖抬不高', fix: '挺胸收腹，主动抬膝' },
      { wrong: '落地太重', fix: '前脚掌轻落地，减小冲击' }
    ],
    correct_vs_wrong: [
      { aspect: '抬膝高度', correct: '接近水平', wrong: '只抬到小腿' },
      { aspect: '上身', correct: '直立', wrong: '后仰/驼背' }
    ],
    breathing: '保持均匀呼吸，不要憋气',
    safety_note: '膝盖不适者改为原地踏步或慢走',
    tags: ['徒手', '心肺', '宿舍可做']
  },
  {
    action_id: 'jumping_jack',
    name: '开合跳',
    pattern: 'cardio',
    ability_dimensions: [
      { key: 'endurance', weight: 0.5 },
      { key: 'coordination', weight: 0.3 },
      { key: 'lower_power', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'mountain_climber',
    contraindications: ['knee'],
    sets_template: { sets: 3, reps: 30, unit: '秒', rest_sec: 45 },
    demo_resource_id: 'demo.jumping_jack',
    demo_frames: 4,
    key_points: ['跳开时双脚略宽于肩，双手过头', '前脚掌落地，屈膝缓冲', '保持均匀节奏'],
    steps: ['双脚并拢站立，双手垂于体侧', '跳起同时双脚分开、双手向上击掌', '再跳回并拢位，连续完成'],
    common_errors: [
      { wrong: '直膝重落地', fix: '落地微屈膝，前脚掌先着地' },
      { wrong: '手臂不举到头顶', fix: '双手移到头顶上方，动作做完整' }
    ],
    correct_vs_wrong: [
      { aspect: '落地', correct: '屈膝缓冲', wrong: '直膝砸地' },
      { aspect: '手臂', correct: '过头', wrong: '只到肩' }
    ],
    breathing: '均匀呼吸，不憋气',
    safety_note: '楼下有人休息时可改为无跳跃版本（左右点脚）',
    tags: ['徒手', '热身', '宿舍可做']
  },
  {
    action_id: 'butt_kick',
    name: '后踢腿',
    pattern: 'cardio',
    ability_dimensions: [
      { key: 'endurance', weight: 0.5 },
      { key: 'speed', weight: 0.25 },
      { key: 'coordination', weight: 0.25 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'high_knees',
    contraindications: [],
    sets_template: { sets: 3, reps: 30, unit: '秒', rest_sec: 45 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['脚跟快速向臀部折叠', '上身直立、核心收紧', '节奏轻快，前脚掌着地'],
    steps: ['站立，核心收紧', '交替将脚跟向后踢向臀部', '保持快速节奏完成规定时间'],
    common_errors: [
      { wrong: '身体后仰', fix: '上身保持直立，目光平视' },
      { wrong: '幅度不足', fix: '尽量让脚跟碰到臀部' }
    ],
    correct_vs_wrong: [
      { aspect: '上身', correct: '直立', wrong: '后仰' },
      { aspect: '节奏', correct: '快速轻快', wrong: '缓慢拖沓' }
    ],
    breathing: '均匀呼吸',
    safety_note: '大腿后侧拉伤史者放慢速度',
    tags: ['徒手', '热身', '宿舍可做']
  },
  {
    action_id: 'jog_run',
    name: '慢跑',
    pattern: 'cardio',
    ability_dimensions: [
      { key: 'endurance', weight: 0.8 },
      { key: 'coordination', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'sprint_interval',
    contraindications: [],
    sets_template: { sets: 1, reps: 12, unit: '分钟', rest_sec: 60 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['呼吸配合步伐，三步一吸两步一呼', '前脚掌或全脚掌着地，步频偏快', '保持能说话的强度'],
    steps: ['慢走 2 分钟热身', '以能正常说话的配速持续慢跑', '结束后慢走 2 分钟放松'],
    common_errors: [
      { wrong: '一开始冲太快导致后程跑不动', fix: '前 400 米刻意慢，稳住呼吸' },
      { wrong: '跨大步、脚跟重砸', fix: '提高步频，落地靠近身体重心' }
    ],
    correct_vs_wrong: [
      { aspect: '配速', correct: '能说话', wrong: '起跑冲刺' },
      { aspect: '步频', correct: '偏快小步', wrong: '大步砸地' }
    ],
    breathing: '三步一吸、两步一呼，保持节奏',
    safety_note: '跑步前充分热身，注意场地安全与天气',
    tags: ['操场', '心肺', '体测主项']
  },
  {
    action_id: 'sprint_interval',
    name: '短距离冲刺间歇',
    pattern: 'cardio',
    ability_dimensions: [
      { key: 'speed', weight: 0.6 },
      { key: 'endurance', weight: 0.25 },
      { key: 'lower_power', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['track'],
    capability_level: 3,
    regression_id: 'high_knees',
    progression_id: null,
    contraindications: ['knee'],
    sets_template: { sets: 4, reps: 50, unit: '米', rest_sec: 120 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['全力冲刺 50 米，组间充分走动恢复', '起跑重心压低、摆臂有力', '质量下降就停止，不硬撑'],
    steps: ['慢跑 + 动态拉伸热身 8 分钟', '全力冲刺 50 米', '走回起点恢复 90-120 秒，重复 4 组'],
    common_errors: [
      { wrong: '热身不足直接冲刺', fix: '至少 8 分钟热身 + 2 组加速跑' },
      { wrong: '组间休息不足导致动作变形', fix: '心率降下来再开始下一组' }
    ],
    correct_vs_wrong: [
      { aspect: '强度', correct: '每组全力', wrong: '匀速慢跑' },
      { aspect: '恢复', correct: '充分走动', wrong: '立刻坐下' }
    ],
    breathing: '冲刺时自然呼吸，组间深呼吸恢复',
    safety_note: '膝踝不适或体能基础弱时用高抬腿替代；跑道湿滑不做',
    tags: ['操场', '进阶', '速度']
  },
  {
    action_id: 'mountain_climber',
    name: '登山跑',
    pattern: 'cardio',
    ability_dimensions: [
      { key: 'endurance', weight: 0.4 },
      { key: 'core', weight: 0.4 },
      { key: 'coordination', weight: 0.2 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 2,
    regression_id: 'plank',
    progression_id: 'jumping_jack',
    contraindications: ['knee', 'waist'],
    sets_template: { sets: 3, reps: 30, unit: '秒', rest_sec: 45 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['肩在手腕正上方，核心收紧', '交替提膝靠近胸口，不塌腰', '速度可控，保持呼吸'],
    steps: ['俯撑，双手撑地，肩在手腕正上方', '交替提膝向胸口方向靠近', '保持稳定节奏完成规定时间'],
    common_errors: [
      { wrong: '塌腰、臀部上下起伏', fix: '收紧核心，保持身体一条直线' },
      { wrong: '脚落地过重', fix: '前脚掌轻落地，降低频率' }
    ],
    correct_vs_wrong: [
      { aspect: '躯干', correct: '稳定成直线', wrong: '上下起伏' },
      { aspect: '肩腕', correct: '肩在腕正上方', wrong: '肩在腕后方' }
    ],
    breathing: '均匀呼吸，不憋气',
    safety_note: '膝腰不适者改做平板支撑',
    tags: ['徒手', '心肺', '宿舍可做']
  },
  /* ================= 柔韧 / 恢复 ================= */
  {
    action_id: 'sit_reach_stretch',
    name: '坐位体前屈拉伸',
    pattern: 'mobility',
    ability_dimensions: [
      { key: 'flexibility', weight: 0.9 },
      { key: 'core', weight: 0.1 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: null,
    contraindications: [],
    sets_template: { sets: 2, reps: 30, unit: '秒', rest_sec: 30 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['坐姿腿伸直，脚尖回勾', '从髋部折叠，不是弓背硬够', '保持 20-30 秒，不弹震'],
    steps: ['坐姿双腿伸直并拢，脚尖回勾', '吸气延展脊柱，呼气从髋部向前折叠', '感觉大腿后侧拉伸，保持 20-30 秒'],
    common_errors: [
      { wrong: '弓背用头去够脚', fix: '保持背平，从髋部折叠' },
      { wrong: '弹震式压腿', fix: '静态保持 20-30 秒，缓慢加深' }
    ],
    correct_vs_wrong: [
      { aspect: '发力来源', correct: '髋部折叠', wrong: '弓背够脚' },
      { aspect: '方式', correct: '静态保持', wrong: '弹震' }
    ],
    breathing: '吸气延展，呼气缓慢加深',
    safety_note: '腰部或腘绳肌有伤时减小幅度',
    tags: ['拉伸', '柔韧', '体测主项']
  },
  {
    action_id: 'hamstring_stretch',
    name: '站姿腘绳肌拉伸',
    pattern: 'mobility',
    ability_dimensions: [
      { key: 'flexibility', weight: 0.85 },
      { key: 'coordination', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: 'sit_reach_stretch',
    contraindications: [],
    sets_template: { sets: 2, reps: 25, unit: '秒/侧', rest_sec: 30 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['一侧脚跟向前点地、脚尖回勾', '直背从髋部前倾', '感觉大腿后侧拉伸即可'],
    steps: ['双脚前后站立，前脚脚跟点地、脚尖回勾', '背部挺直，从髋部向前倾', '保持 20-30 秒后换侧'],
    common_errors: [
      { wrong: '弓背下够', fix: '背部挺直，以髋为轴' },
      { wrong: '拉伸到刺痛', fix: '保持在轻微牵拉感，不追求疼痛' }
    ],
    correct_vs_wrong: [
      { aspect: '背部', correct: '挺直', wrong: '弓起' },
      { aspect: '强度', correct: '轻微牵拉', wrong: '刺痛' }
    ],
    breathing: '呼气时缓慢加深',
    safety_note: '有牵拉感即可，避免弹震',
    tags: ['拉伸', '柔韧', '训练后']
  },
  {
    action_id: 'hip_flexor_stretch',
    name: '髋屈肌拉伸',
    pattern: 'mobility',
    ability_dimensions: [
      { key: 'flexibility', weight: 0.85 },
      { key: 'core', weight: 0.15 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: null,
    contraindications: [],
    sets_template: { sets: 2, reps: 25, unit: '秒/侧', rest_sec: 30 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['半跪姿，骨盆中立', '臀部收紧、骨盆后倾后再前移', '不要靠塌腰增加幅度'],
    steps: ['半跪姿，后腿膝盖着地', '收紧臀部，骨盆微微后倾', '身体整体前移，感受后腿髋前侧拉伸'],
    common_errors: [
      { wrong: '塌腰撅臀', fix: '先收紧臀部使骨盆中立' },
      { wrong: '身体前倾过度', fix: '轻幅度前移，保持躯干直立' }
    ],
    correct_vs_wrong: [
      { aspect: '骨盆', correct: '中立/微后倾', wrong: '前倾撅臀' },
      { aspect: '躯干', correct: '直立', wrong: '前趴' }
    ],
    breathing: '缓慢深呼吸',
    safety_note: '膝盖着地处垫软物',
    tags: ['拉伸', '柔韧', '久坐放松']
  },
  {
    action_id: 'cat_cow',
    name: '猫牛式',
    pattern: 'mobility',
    ability_dimensions: [
      { key: 'flexibility', weight: 0.7 },
      { key: 'core', weight: 0.3 }
    ],
    equipment: ['none'],
    space: ['dorm', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: null,
    contraindications: [],
    sets_template: { sets: 2, reps: 8, unit: '次', rest_sec: 20 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['吸气塌腰抬头，呼气拱背低头', '动作缓慢，配合呼吸', '手腕不适可改前臂支撑'],
    steps: ['四点支撑，手在肩下、膝在髋下', '吸气抬头塌腰，感受脊柱伸展', '呼气拱背低头，逐节卷动脊柱'],
    common_errors: [
      { wrong: '动作过快只动腰', fix: '放慢速度，感受脊柱一节节活动' },
      { wrong: '肘关节锁死耸肩', fix: '肘微屈，肩下沉' }
    ],
    correct_vs_wrong: [
      { aspect: '节奏', correct: '随呼吸缓慢', wrong: '快速甩动' },
      { aspect: '脊柱', correct: '逐节活动', wrong: '只折腰' }
    ],
    breathing: '吸气伸展，呼气拱背',
    safety_note: '腰部急性疼痛时不做',
    tags: ['热身', '柔韧', '宿舍可做']
  },
  {
    action_id: 'shoulder_circle',
    name: '肩绕环',
    pattern: 'mobility',
    ability_dimensions: [
      { key: 'flexibility', weight: 0.5 },
      { key: 'coordination', weight: 0.5 }
    ],
    equipment: ['none'],
    space: ['dorm', 'track', 'gym'],
    capability_level: 1,
    regression_id: null,
    progression_id: null,
    contraindications: [],
    sets_template: { sets: 2, reps: 12, unit: '次', rest_sec: 20 },
    demo_resource_id: null,
    demo_frames: 0,
    key_points: ['肩膀画大圆，动作缓慢', '向前向后各绕几圈', '配合深呼吸，不耸肩'],
    steps: ['站立，双臂自然下垂或指尖搭肩', '肩膀向上、向后、向下画圆', '顺时针逆时针各 8-12 圈'],
    common_errors: [
      { wrong: '幅度太小、脖子代偿', fix: '放松颈部，肩膀画满圆' },
      { wrong: '速度过快', fix: '放慢速度，配合呼吸' }
    ],
    correct_vs_wrong: [
      { aspect: '幅度', correct: '画大圆', wrong: '小幅度抖动' },
      { aspect: '发力', correct: '肩部主导', wrong: '脖子前伸' }
    ],
    breathing: '自然呼吸',
    safety_note: '肩部有伤时减小幅度或跳过',
    tags: ['热身', '肩颈', '宿舍可做']
  }
];

const ACTION_MAP = {};
ACTIONS.forEach(function (a) {
  ACTION_MAP[a.action_id] = a;
});

/** 具备关键帧示范的动作（与 assets/demo/<action_id>/frame-*.png 对应） */
const DEMO_FRAME_ACTIONS = ['squat', 'plank', 'glute_bridge', 'high_knees', 'jumping_jack', 'wall_sit'];

/** 取单个动作 */
function getAction(actionId) {
  return ACTION_MAP[actionId] || null;
}

/** 全部动作 */
function listActions() {
  return ACTIONS.slice();
}

/** 按动作模式筛选 */
function getActionsByPattern(pattern) {
  return ACTIONS.filter(function (a) {
    return a.pattern === pattern;
  });
}

/** 按能力维度筛选（权重从高到低） */
function getActionsByDimension(dimensionKey) {
  return ACTIONS.filter(function (a) {
    return (a.ability_dimensions || []).some(function (d) {
      return d.key === dimensionKey;
    });
  });
}

/** 按器械筛选 */
function getActionsByEquipment(equipmentKey) {
  return ACTIONS.filter(function (a) {
    return (a.equipment || []).indexOf(equipmentKey) >= 0;
  });
}

/** 动作库统计（用于知识库说明 / 页面展示） */
function getActionStats() {
  const dimensions = {};
  const patterns = {};
  ACTIONS.forEach(function (a) {
    (a.ability_dimensions || []).forEach(function (d) {
      dimensions[d.key] = (dimensions[d.key] || 0) + 1;
    });
    patterns[a.pattern] = (patterns[a.pattern] || 0) + 1;
  });
  return {
    total: ACTIONS.length,
    demo_actions: DEMO_FRAME_ACTIONS.length,
    dimensions: dimensions,
    patterns: patterns,
    version: 'v1.0'
  };
}

module.exports = {
  ACTIONS: ACTIONS,
  ACTION_MAP: ACTION_MAP,
  DEMO_FRAME_ACTIONS: DEMO_FRAME_ACTIONS,
  getAction: getAction,
  listActions: listActions,
  getActionsByPattern: getActionsByPattern,
  getActionsByDimension: getActionsByDimension,
  getActionsByEquipment: getActionsByEquipment,
  getActionStats: getActionStats
};
