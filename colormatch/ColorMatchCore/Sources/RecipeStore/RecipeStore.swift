#if canImport(SwiftData)
import ColorEngine
import Foundation
import SwiftData

/// 本地配方：一次仿色的完整可复用记录。
/// 全本地（SwiftData），不做云同步——App Store 隐私表保持 Data Not Collected。
@Model
public final class Recipe {
    @Attribute(.unique) public var id: UUID
    public var name: String
    public var createdAt: Date
    /// GradeParameters 的 JSON 编码（避免 SwiftData 迁移绑死参数结构）
    public var paramsData: Data
    /// 命中的风格族 id（styles.json），未命中为 nil
    public var styleID: String?
    /// 参考图缩略图（JPEG，长边 ≤256，只存缩略图控制库体积）
    @Attribute(.externalStorage) public var referenceThumbnail: Data?
    /// 导出用的稳定 UUID：同一配方重复导出 XMP 时保持一致
    public var exportUUID: UUID

    @Relationship(deleteRule: .cascade, inverse: \ExportRecord.recipe)
    public var exports: [ExportRecord] = []

    public init(
        id: UUID = UUID(),
        name: String,
        createdAt: Date = .now,
        params: GradeParameters,
        styleID: String? = nil,
        referenceThumbnail: Data? = nil
    ) throws {
        self.id = id
        self.name = name
        self.createdAt = createdAt
        self.paramsData = try JSONEncoder().encode(params)
        self.styleID = styleID
        self.referenceThumbnail = referenceThumbnail
        self.exportUUID = UUID()
    }

    public var params: GradeParameters? {
        try? JSONDecoder().decode(GradeParameters.self, from: paramsData)
    }
}

/// 导出历史（重新分享入口的数据源）
@Model
public final class ExportRecord {
    public var id: UUID
    public var createdAt: Date
    /// "xmp" / "report" / "cube"（v1.1）/ "renderedPhoto"
    public var kind: String
    public var fileName: String
    public var recipe: Recipe?

    public init(id: UUID = UUID(), createdAt: Date = .now, kind: String, fileName: String) {
        self.id = id
        self.createdAt = createdAt
        self.kind = kind
        self.fileName = fileName
    }
}

/// 仓储层：View 只通过这里读写，免费版配方上限在这里执行
public struct RecipeRepository {
    public enum RepositoryError: Error {
        case recipeLimitReached
    }

    private let context: ModelContext

    public init(context: ModelContext) {
        self.context = context
    }

    public static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: inMemory)
        return try ModelContainer(for: Recipe.self, ExportRecord.self, configurations: config)
    }

    public func count() throws -> Int {
        try context.fetchCount(FetchDescriptor<Recipe>())
    }

    /// 保存配方；免费版超出上限抛 recipeLimitReached（UI 弹 paywall）
    public func save(_ recipe: Recipe, isPro: Bool, maxFreeRecipes: Int) throws {
        if !isPro {
            let current = try count()
            guard current < maxFreeRecipes else {
                throw RepositoryError.recipeLimitReached
            }
        }
        context.insert(recipe)
        try context.save()
    }

    public func recentRecipes(limit: Int = 50) throws -> [Recipe] {
        var descriptor = FetchDescriptor<Recipe>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        descriptor.fetchLimit = limit
        return try context.fetch(descriptor)
    }

    public func recipe(id: UUID) throws -> Recipe? {
        var descriptor = FetchDescriptor<Recipe>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }

    public func recordExport(_ record: ExportRecord, for recipe: Recipe) throws {
        record.recipe = recipe
        context.insert(record)
        try context.save()
    }

    public func delete(_ recipe: Recipe) throws {
        context.delete(recipe)
        try context.save()
    }
}
#endif
