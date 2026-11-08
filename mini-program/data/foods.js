/**
 * 食堂常见食物简表（轻量饮食提示用）
 * 单位说明：每「1 份」的蛋白/碳水概值（保留整数克，仅用于规则判断，不做精确热量计算）。
 * 数据来源：常见食物成分概值，四舍五入到便于理解的量级；正式版由知识库组维护并版本化。
 */
const FOODS = [
  // 蛋白来源
  { food_id: 'egg', name: '鸡蛋', unit: '1 个', category: 'protein', protein_g: 6, carb_g: 1, kcal: 70, tags: ['蛋白来源', '食堂常见'] },
  { food_id: 'milk', name: '牛奶', unit: '1 杯（250ml）', category: 'protein', protein_g: 8, carb_g: 12, kcal: 150, tags: ['蛋白来源', '早餐'] },
  { food_id: 'soymilk', name: '豆浆', unit: '1 杯（300ml）', category: 'protein', protein_g: 9, carb_g: 6, kcal: 100, tags: ['植物蛋白', '早餐'] },
  { food_id: 'yogurt', name: '酸奶', unit: '1 杯（150g）', category: 'protein', protein_g: 6, carb_g: 9, kcal: 120, tags: ['蛋白来源', '加餐'] },
  { food_id: 'chicken_breast', name: '鸡胸肉', unit: '1 份（100g）', category: 'protein', protein_g: 22, carb_g: 0, kcal: 120, tags: ['优质蛋白', '低脂'] },
  { food_id: 'chicken_leg', name: '鸡腿', unit: '1 个', category: 'protein', protein_g: 18, carb_g: 0, kcal: 220, tags: ['蛋白来源', '食堂常见'] },
  { food_id: 'beef', name: '牛肉', unit: '1 份（100g）', category: 'protein', protein_g: 20, carb_g: 2, kcal: 180, tags: ['优质蛋白', '铁'] },
  { food_id: 'fish', name: '鱼', unit: '1 份（100g）', category: 'protein', protein_g: 18, carb_g: 0, kcal: 130, tags: ['优质蛋白'] },
  { food_id: 'shrimp', name: '虾', unit: '1 份（100g）', category: 'protein', protein_g: 18, carb_g: 1, kcal: 100, tags: ['优质蛋白', '低脂'] },
  { food_id: 'tofu', name: '豆腐', unit: '1 份（100g）', category: 'protein', protein_g: 8, carb_g: 3, kcal: 80, tags: ['植物蛋白', '食堂常见'] },
  { food_id: 'nuts', name: '坚果', unit: '1 小把（20g）', category: 'protein', protein_g: 4, carb_g: 4, kcal: 120, tags: ['加餐', '健康脂肪'] },

  // 主食 / 碳水
  { food_id: 'rice', name: '米饭', unit: '1 碗（150g）', category: 'carb', protein_g: 4, carb_g: 42, kcal: 200, tags: ['主食', '食堂常见'] },
  { food_id: 'mantou', name: '馒头', unit: '1 个（100g）', category: 'carb', protein_g: 7, carb_g: 45, kcal: 210, tags: ['主食', '早餐'] },
  { food_id: 'noodles', name: '面条', unit: '1 碗', category: 'carb', protein_g: 8, carb_g: 50, kcal: 250, tags: ['主食', '食堂常见'] },
  { food_id: 'sweet_potato', name: '红薯', unit: '1 个（150g）', category: 'carb', protein_g: 2, carb_g: 30, kcal: 140, tags: ['主食', '粗粮'] },
  { food_id: 'oats', name: '燕麦', unit: '1 小碗（40g）', category: 'carb', protein_g: 5, carb_g: 27, kcal: 150, tags: ['粗粮', '早餐'] },
  { food_id: 'whole_bread', name: '全麦面包', unit: '2 片', category: 'carb', protein_g: 7, carb_g: 30, kcal: 180, tags: ['主食', '早餐'] },
  { food_id: 'baozi', name: '包子', unit: '1 个', category: 'carb', protein_g: 6, carb_g: 30, kcal: 180, tags: ['主食', '早餐'] },
  { food_id: 'banana', name: '香蕉', unit: '1 根', category: 'carb', protein_g: 1, carb_g: 22, kcal: 90, tags: ['水果', '训练前'] },
  { food_id: 'apple', name: '苹果', unit: '1 个', category: 'carb', protein_g: 0, carb_g: 19, kcal: 80, tags: ['水果'] },
  { food_id: 'potato', name: '土豆', unit: '1 份（100g）', category: 'carb', protein_g: 2, carb_g: 17, kcal: 80, tags: ['主食', '食堂常见'] },
  { food_id: 'canteen_set', name: '食堂套餐', unit: '1 份（两荤一素）', category: 'carb', protein_g: 20, carb_g: 60, kcal: 650, tags: ['食堂常见', '正餐'] },

  // 蔬菜 / 其他
  { food_id: 'broccoli', name: '西兰花', unit: '1 份（100g）', category: 'veg', protein_g: 3, carb_g: 5, kcal: 40, tags: ['蔬菜'] },
  { food_id: 'greens', name: '青菜', unit: '1 份（100g）', category: 'veg', protein_g: 2, carb_g: 3, kcal: 25, tags: ['蔬菜'] },
  { food_id: 'sports_drink', name: '运动饮料', unit: '1 瓶（500ml）', category: 'other', protein_g: 0, carb_g: 30, kcal: 120, tags: ['训练后'] },
  { food_id: 'water', name: '白开水', unit: '1 杯', category: 'other', protein_g: 0, carb_g: 0, kcal: 0, tags: ['补水'] }
];

const FOOD_MAP = {};
FOODS.forEach(function (f) {
  FOOD_MAP[f.food_id] = f;
});

/** 全部食物 */
function getFoods() {
  return FOODS.slice();
}

/** 按 id 取食物 */
function getFood(foodId) {
  return FOOD_MAP[foodId] || null;
}

/** 按分类取食物 */
function getFoodsByCategory(category) {
  return FOODS.filter(function (f) {
    return f.category === category;
  });
}

/**
 * 粗略统计所选食物的蛋白质 / 碳水（份数默认 1）
 * @param {Array} selections [{food_id, portion}]
 * @returns {{protein_g:number, carb_g:number, kcal:number, items:Array}}
 */
function sumFoods(selections) {
  const result = { protein_g: 0, carb_g: 0, kcal: 0, items: [] };
  (selections || []).forEach(function (sel) {
    const food = getFood(sel.food_id);
    if (!food) return;
    const portion = Number(sel.portion) > 0 ? Number(sel.portion) : 1;
    result.protein_g += food.protein_g * portion;
    result.carb_g += food.carb_g * portion;
    result.kcal += food.kcal * portion;
    result.items.push({
      food_id: food.food_id,
      name: food.name,
      unit: food.unit,
      portion: portion,
      protein_g: Math.round(food.protein_g * portion),
      carb_g: Math.round(food.carb_g * portion)
    });
  });
  result.protein_g = Math.round(result.protein_g);
  result.carb_g = Math.round(result.carb_g);
  result.kcal = Math.round(result.kcal);
  return result;
}

module.exports = {
  FOODS: FOODS,
  getFoods: getFoods,
  getFood: getFood,
  getFoodsByCategory: getFoodsByCategory,
  sumFoods: sumFoods
};
