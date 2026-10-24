import Foundation

/// 初始菜单：按设计文档整理（分类、规格、价格区间、温度规则、小料）。
/// 标「待核对」的饮品是根据设计文档里的例子补的，日文名也是暂定，
/// 请对照店里的菜单屏在「管理 → 菜单」里改成实际的名字和价格。
enum SeedMenu {
    static let toppings: [Topping] = [
        Topping(id: "cheese", name: "芝士奶盖", nameJP: "チーズフォーム", price: 120),
        Topping(id: "coconutJelly", name: "椰子冻", nameJP: "ココナッツゼリー", price: 100),
        Topping(id: "pearl", name: "珍珠", nameJP: "タピオカ", price: 70),
        Topping(id: "pudding", name: "布丁", nameJP: "プリン", price: 70),
        Topping(id: "nata", name: "椰果", nameJP: "ナタデココ", price: 70),
        Topping(id: "redBean", name: "红豆", nameJP: "あずき", price: 70),
        Topping(id: "sago", name: "西米露", nameJP: "サゴ", price: 70),
        Topping(id: "oreo", name: "奥利奥", nameJP: "オレオ", price: 70),
    ]

    static let categories: [MenuCategory] = [
        MenuCategory(id: "milktea", name: "珍珠奶茶", nameJP: "タピオカミルクティー", colorHex: "8B5E3C"),
        MenuCategory(id: "fruit", name: "鲜果时光", nameJP: "フレッシュフルーツ", colorHex: "E07B39"),
        MenuCategory(id: "lemon", name: "清爽爆柠茶", nameJP: "レモンティー", colorHex: "B8A000"),
        MenuCategory(id: "special", name: "茶里特饮", nameJP: "チャリスペシャル", colorHex: "2E7D4F"),
        MenuCategory(id: "seasonal", name: "季节限定", nameJP: "季節限定", colorHex: "D94F7A"),
    ]

    static var menu: ShopMenu {
        let all = toppings.map(\.id)
        func item(_ id: String, _ name: String, _ jp: String, _ category: String, m: Int? = nil, l: Int? = nil, hot: Bool = false) -> MenuItem {
            MenuItem(
                id: id,
                name: name,
                nameJP: jp,
                categoryID: category,
                prices: SizePrices(m: m, l: l),
                allowedTemps: hot ? Temperature.allCases : Temperature.coldOnly,
                allowedToppingIDs: all
            )
        }
        let items: [MenuItem] = [
            // 珍珠奶茶：M / L，冷热均可
            item("pearl-milktea", "珍珠奶茶", "タピオカミルクティー", "milktea", m: 580, l: 680, hot: true), // 待核对
            item("oolong-roast-milk", "乌龙烤鲜奶", "焙煎ウーロンミルク", "milktea", m: 580, l: 680, hot: true),
            item("brown-sugar-pearl-milk", "黑糖珍珠鲜奶", "黒糖タピオカミルク", "milktea", m: 680, l: 780, hot: true), // 待核对
            item("milktea-trio", "奶茶三兄弟", "ミルクティー三兄弟", "milktea", l: 780, hot: true),
            // 鲜果时光：仅 L，仅冷
            item("kiwi-trip", "奇异之旅", "キウイトリップ", "fruit", l: 780),
            item("strawberry", "多肉莓子", "ごろごろイチゴ", "fruit", l: 850), // 待核对价格
            item("mango-pomelo", "杨枝甘露", "楊枝甘露", "fruit", l: 850),
            // 清爽爆柠茶：仅 L 640，仅冷
            item("lemon-oolong", "柠檬搞乌龙", "レモンウーロン", "lemon", l: 640),
            item("whole-lemon-green", "整颗爆柠绿", "まるごとレモン緑茶", "lemon", l: 640),
            // 茶里特饮：仅 M，仅冷
            item("salt-osmanthus-milk", "老盐桂花牛乳茶", "塩キンモクセイミルクティー", "special", m: 680),
            item("yogurt-ice", "优酪冰", "ヨーグルトスムージー", "special", m: 780), // 待核对：优酪冰系列各口味
            item("durian-milk", "榴莲牛乳", "ドリアンミルク", "special", m: 780), // 待核对名称、分类和价格
            // 季节限定：仅 L 850，仅冷
            item("pink-guava-grape", "粉芭葡奶", "ピンクグァバ＆グレープミルク", "seasonal", l: 850),
            item("passion-q", "酸Q百香果", "パッションフルーツQQ", "seasonal", l: 850),
        ]
        return ShopMenu(categories: categories, items: items, toppings: toppings)
    }
}
