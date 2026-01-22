import Foundation
import React
import WidgetKit

@objc(WidgetDataSync)
class WidgetDataSync: NSObject, RCTBridgeModule {
  
  private let appGroupIdentifier = "group.com.ssong.awallet"
  
  @objc
  func saveMonthlyExpenseData(
    _ data: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
      reject("ERROR", "Failed to access App Group UserDefaults", nil)
      return
    }
    
    guard let expense = data["expense"] as? Double,
          let income = data["income"] as? Double,
          let balance = data["balance"] as? Double,
          let monthStartDay = data["monthStartDay"] as? Int else {
      reject("ERROR", "Invalid data format", nil)
      return
    }
    
    let expenseData = MonthlyExpenseData(
      expense: expense,
      income: income,
      balance: balance,
      monthStartDay: monthStartDay,
      lastUpdated: Date()
    )
    
    do {
      let encoder = JSONEncoder()
      let encoded = try encoder.encode(expenseData)
      sharedDefaults.set(encoded, forKey: "monthlyExpenseData")
      sharedDefaults.synchronize()
      
      // 위젯 새로고침 요청
      WidgetCenter.shared.reloadTimelines(ofKind: "MonthlyExpenseWidget")
      
      resolve(nil)
    } catch {
      reject("ERROR", "Failed to encode data: \(error.localizedDescription)", error)
    }
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  @objc
  static func moduleName() -> String {
    return "WidgetDataSync"
  }
}

// MARK: - Data Model
struct MonthlyExpenseData: Codable {
  let expense: Double
  let income: Double
  let balance: Double
  let monthStartDay: Int
  let lastUpdated: Date
}
