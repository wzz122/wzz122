#if canImport(StoreKit)
import Foundation
import StoreKit

/// StoreKit 2 一次性买断 Pro。
/// 架构决策：v1 不做订阅；AI 云端功能上线后再评估 Pro+ 层。
@MainActor
public final class ProEntitlement: ObservableObject {
    /// App Store Connect 里配置的非消耗型内购
    public static let productID = "com.wzzsgdtc.colormatch.pro.lifetime"

    @Published public private(set) var isPro = false
    @Published public private(set) var product: Product?
    @Published public private(set) var isLoading = false

    private var updatesTask: Task<Void, Never>?

    public init() {
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    await transaction.finish()
                    await self?.refreshEntitlement()
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    /// 启动时调用：加载商品并刷新当前权益
    public func start() async {
        isLoading = true
        defer { isLoading = false }
        do {
            product = try await Product.products(for: [Self.productID]).first
        } catch {
            product = nil
        }
        await refreshEntitlement()
    }

    public func refreshEntitlement() async {
        var owned = false
        for await entitlement in Transaction.currentEntitlements {
            if case .verified(let transaction) = entitlement,
               transaction.productID == Self.productID,
               transaction.revocationDate == nil {
                owned = true
            }
        }
        isPro = owned
    }

    /// 购买。返回是否已解锁（用户取消返回 false，不抛错）
    @discardableResult
    public func purchase() async throws -> Bool {
        guard let product else { return false }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            if case .verified(let transaction) = verification {
                await transaction.finish()
                await refreshEntitlement()
                return isPro
            }
            return false
        case .userCancelled, .pending:
            return false
        @unknown default:
            return false
        }
    }

    /// 恢复购买
    public func restore() async throws {
        try await AppStore.sync()
        await refreshEntitlement()
    }
}
#endif
