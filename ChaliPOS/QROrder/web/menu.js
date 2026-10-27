// 茶里茶里 菜单（按店里菜单屏 2026 年 10 月版录入，和 MenuTrainer/chali-menu.html 的 RAW 一致）
// 接单屏（staff.html）开始接单时把这份菜单发布到服务器，顾客页面从服务器读。
// 改菜单只改这个文件；价格以服务器按这份菜单重新计算为准。
//
// 还没在店里确认的规则（先按常见做法设置）：
//   - 只有珍珠奶茶能做 HOT，其他只能冷饮（菜单屏上写的）
//   - 冰沙（スムージー）不能调冰量
//   - 所有饮品都能调甜度、都能加任意小料
//   - 榴莲那款的中文名被售罄贴纸挡住，暂写「榴莲芒芒」
(function () {
  "use strict";

  const CATEGORIES = [
    { id: "milk", name: "珍珠奶茶", nameJP: "タピオカミルクティー", nameEN: "Bubble Milk Tea", colorHex: "8B5E3C" },
    { id: "fruit", name: "鲜果时光", nameJP: "フルーツティー", nameEN: "Fruit Tea", colorHex: "E07B39" },
    { id: "lemon", name: "清爽爆柠茶", nameJP: "レモンティー", nameEN: "Lemon Tea", colorHex: "A68A00" },
    { id: "special", name: "茶里特饮", nameJP: "オリジナル", nameEN: "Chali Originals", colorHex: "2E7D4F" },
    { id: "season", name: "季节限定", nameJP: "季節限定", nameEN: "Seasonal", colorHex: "D94F7A" },
  ];

  const TOPPINGS = [
    { id: "cheese", name: "芝士奶盖", nameJP: "チーズフォーム", nameEN: "Cheese foam", price: 120 },
    { id: "coconutPudding", name: "椰子冻", nameJP: "ココナッツプリン", nameEN: "Coconut pudding", price: 100 },
    { id: "pearl", name: "珍珠", nameJP: "タピオカ", nameEN: "Tapioca pearls", price: 70 },
    { id: "pudding", name: "布丁", nameJP: "プリン", nameEN: "Pudding", price: 70 },
    { id: "nata", name: "椰果", nameJP: "ナタデココ", nameEN: "Nata de coco", price: 70 },
    { id: "redBean", name: "红豆", nameJP: "あずき", nameEN: "Red bean", price: 70 },
    { id: "sago", name: "西米露", nameJP: "ミニタピオカ", nameEN: "Mini tapioca", price: 70 },
    { id: "oreo", name: "奥利奥", nameJP: "オレオ", nameEN: "Oreo", price: 70 },
  ];

  // [id, 分类, 中文, 日文, 英文, M 价, L 价]
  const RAW = [
    ["oolong-milk", "milk", "乌龙烤鲜奶", "ウーロンミルクティー", "Roasted Oolong Milk Tea", 580, 680],
    ["assam", "milk", "阿萨姆奶茶", "アッサムミルクティー", "Assam Milk Tea", 580, 680],
    ["siji-naiqing", "milk", "四季奶青", "シキシュンミルクティー", "Four Seasons Milk Tea", 580, 680],
    ["moxiang", "milk", "茉香奶绿", "ジャスミングリーンミルクティー", "Jasmine Green Milk Tea", 580, 680],
    ["oreo-milk", "milk", "奥利奥奶茶", "オレオミルクティー", "Oreo Milk Tea", 620, 720],
    ["trio", "milk", "奶茶三兄弟", "ミックスミルクティー", "Milk Tea Trio", null, 780],
    ["peach-oolong", "milk", "白桃乌龙奶茶", "ピーチウーロンミルクティー", "Peach Oolong Milk Tea", 620, 720],
    ["lychee-oolong", "milk", "荔枝乌龙奶茶", "ライチウーロンミルクティー", "Lychee Oolong Milk Tea", 620, 720],
    ["osmanthus-oolong", "milk", "桂花乌龙奶茶", "桂花ウーロンミルクティー", "Osmanthus Oolong Milk Tea", 620, 720],
    ["black-rice", "milk", "血糯米奶茶", "紫米ミルクティー", "Purple Rice Milk Tea", 680, 780],

    ["kiwi-cheese", "fruit", "奇异之旅", "キウイチーズティー", "Kiwi Cheese Tea", null, 780],
    ["dragon-cheese", "fruit", "粉红先生", "ドラゴンフルーツチーズティー", "Dragon Fruit Cheese Tea", null, 850],
    ["cherry-cheese", "fruit", "多肉车厘子", "チェリーチーズティー", "Cherry Cheese Tea", null, 850],
    ["grape-cheese", "fruit", "多肉葡萄", "グレープチーズティー", "Grape Cheese Tea", null, 780],
    ["straw-cheese", "fruit", "草莓芝士", "ストロベリーチーズティー", "Strawberry Cheese Tea", null, 780],
    ["straw-ole", "fruit", "草莓欧蕾", "ストロベリーチーズオーレ", "Strawberry Cheese au Lait", null, 780],
    ["peach-cheese", "fruit", "桃之夭夭", "ピーチチーズティー", "Peach Cheese Tea", null, 780],
    ["peach-ole", "fruit", "蜜桃欧蕾", "ピーチチーズオーレ", "Peach Cheese au Lait", null, 780],
    ["mango-cheese", "fruit", "芒芒果海", "マンゴーチーズ", "Mango Cheese", null, 780],
    ["longan-cheese", "fruit", "芝芝龙眼", "ロンガンチーズティー", "Longan Cheese Tea", null, 780],
    ["longan-coco", "fruit", "龙眼生打椰", "ロンガンココナツミルク", "Longan Coconut Milk", null, 850],
    ["yangzhi", "fruit", "杨枝甘露", "ヨンジーガムロ", "Mango Pomelo Sago", null, 850],
    ["peach-coco", "fruit", "椰椰桃桃甘露", "ピーチココナツミルク", "Peach Coconut Milk", null, 850],
    ["dragon-coco", "fruit", "火龙生打椰", "ドラゴンココナツミルク", "Dragon Fruit Coconut Milk", null, 850],
    ["grape-coco", "fruit", "巨峰生打椰", "グレープココナツミルク", "Kyoho Grape Coconut Milk", null, 850],
    ["kiwi-coco", "fruit", "奇异生打椰", "キウイココナツミルク", "Kiwi Coconut Milk", null, 850],
    ["ume-salt", "fruit", "青梅老盐茶", "青梅塩ティー", "Green Plum Salted Tea", null, 780],
    ["ume-lychee", "fruit", "青梅荔枝泡泡", "青梅ライチソーダ", "Green Plum Lychee Soda", null, 780],
    ["peach-sijichun", "fruit", "蜜桃四季春", "ピーチシキシュンティー", "Peach Four Seasons Tea", null, 780],
    ["grape-tea", "fruit", "葡萄多多", "爽快グレープティー", "Grape Tea", null, 780],

    ["lemon-oolong", "lemon", "柠檬搞乌龙", "レモンウーロンティー", "Lemon Oolong Tea", null, 640],
    ["lemon-black", "lemon", "茶里柠檬红", "レモンブラックティー", "Lemon Black Tea", null, 640],
    ["lemon-sijiqing", "lemon", "爆柠四季青", "レモンシキシュンティー", "Lemon Four Seasons Tea", null, 640],
    ["lemon-green", "lemon", "整颗爆柠绿", "レモンジャスミングリーンティー", "Lemon Jasmine Green Tea", null, 640],

    ["durian-mango", "special", "榴莲芒芒", "ドリアンマンゴー", "Durian Mango", 780, null],
    ["salt-osmanthus", "special", "老盐桂花牛乳茶", "塩桂花ミルク", "Salted Osmanthus Milk", 680, null],
    ["coco-redbean", "special", "椰冻冻红豆沙", "あずきスムージー", "Red Bean Smoothie", 680, null],
    ["avocado-yogurt", "special", "牛油优酪冰", "アボカドスムージー", "Avocado Smoothie", 780, null],
    ["berry-yogurt", "special", "莓莓优酪冰", "ストロベリースムージー", "Strawberry Smoothie", 780, null],
    ["mango-yogurt", "special", "多芒优酪冰", "マンゴースムージー", "Mango Smoothie", 780, null],

    ["guava-grape", "season", "粉芭葡奶", "グアバグレープミルク", "Guava Grape Milk", null, 850],
    ["guava-lemon", "season", "粉芭柠檬", "グアバレモンティー", "Guava Lemon Tea", null, 850],
    ["lychee-guava", "season", "荔荔粉芭撞奶", "ライチグアバミルク", "Lychee Guava Milk", null, 850],
    ["guava-cheese", "season", "芝芝粉芭", "グアバチーズティー", "Guava Cheese Tea", null, 850],
    ["passion-tea", "season", "酸Q百香果", "パッションフルーツティー", "Passion Fruit Tea", null, 850],
    ["passion-milk", "season", "奇异百香双打奶", "パッションフルーツミルク", "Passion Fruit Milk", null, 850],
    ["grape-sago", "season", "青提茉莉奶露", "グレープサゴミルクティー", "Grape Sago Milk Tea", null, 850],
    ["guava-mango-sago", "season", "芭乐多芒奶露", "グアバマンゴーサゴミルクティー", "Guava Mango Sago Milk Tea", null, 850],
  ];

  const ALL_TEMPS = ["hot", "normalIce", "lessIce", "roomTemp", "noIce"];
  const COLD_TEMPS = ["normalIce", "lessIce", "noIce"];
  const SWEETNESS = [120, 100, 70, 50, 30, 0];

  const items = RAW.map(([id, categoryID, name, nameJP, nameEN, m, l]) => {
    const prices = {};
    if (m != null) prices.m = m;
    if (l != null) prices.l = l;
    const smoothie = nameJP.includes("スムージー");
    return {
      id, categoryID, name, nameJP, nameEN, prices,
      defaultSize: l != null ? "L" : "M",
      allowedTemps: categoryID === "milk" ? ALL_TEMPS : smoothie ? ["normalIce"] : COLD_TEMPS,
      defaultTemp: "normalIce",
      allowedSweetness: SWEETNESS,
      defaultSweetness: 100,
      allowedToppingIDs: TOPPINGS.map((t) => t.id),
      // 标配小料（含在价格里，只用来显示）
      includedToppingIDs: categoryID === "milk" ? ["pearl"] : [],
      soldOut: false,
    };
  });

  window.CHALI_MENU = {
    storeName: "茶里茶里",
    eatInPricing: "sameTaxIncluded",
    categories: CATEGORIES,
    toppings: TOPPINGS,
    items,
  };
})();
