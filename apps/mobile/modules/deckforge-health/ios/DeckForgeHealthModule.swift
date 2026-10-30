import ExpoModulesCore
import HealthKit
import UIKit

public class DeckForgeHealthModule: Module {
  private let store = HKHealthStore()
  private var requested = false
  public func definition() -> ModuleDefinition {
    Name("DeckForgeHealth")
    AsyncFunction("permission") { () -> String in
      return HKHealthStore.isHealthDataAvailable() ? (self.requested ? "READ_REQUESTED" : "NOT_REQUESTED") : "UNAVAILABLE"
    }
    AsyncFunction("requestPermission") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else { promise.resolve("UNAVAILABLE"); return }
      DispatchQueue.main.async {
        guard UIApplication.shared.applicationState == .active else { promise.reject("FOREGROUND_REQUIRED", "Open the app to request access"); return }
        self.store.requestAuthorization(toShare: [], read: [HKQuantityType(.stepCount)]) { _, error in
          if error != nil { promise.reject("HEALTH_PERMISSION_ERROR", "Could not request optional access"); return }
          self.requested = true
          // HealthKit deliberately hides read authorization. Never claim GRANTED.
          promise.resolve("READ_REQUESTED")
        }
      }
    }
    AsyncFunction("read") { (start: String, end: String, promise: Promise) in
      let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      guard let from = formatter.date(from: start), let to = formatter.date(from: end), to > from, to.timeIntervalSince(from) <= 86400, to <= Date().addingTimeInterval(60) else { promise.reject("INVALID_WINDOW", "Invalid activity window"); return }
      DispatchQueue.main.async {
        guard UIApplication.shared.applicationState == .active, self.requested else { promise.reject("FOREGROUND_REQUIRED", "Request optional access in the foreground"); return }
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [.strictStartDate, .strictEndDate])
        let query = HKSampleQuery(sampleType: HKQuantityType(.stepCount), predicate: predicate, limit: 1001, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, error in
          if error != nil { promise.reject("HEALTH_READ_ERROR", "Could not read optional activity"); return }
          let rows = (samples as? [HKQuantitySample] ?? []).prefix(1000).map { sample -> [String: Any] in
            return ["source": "HEALTHKIT", "recordId": sample.uuid.uuidString.lowercased(), "origin": sample.sourceRevision.source.bundleIdentifier, "revision": String(describing: sample.metadata?[HKMetadataKeySyncVersion] ?? 0), "start": formatter.string(from: sample.startDate), "end": formatter.string(from: sample.endDate), "steps": sample.quantity.doubleValue(for: .count()), "manual": (sample.metadata?[HKMetadataKeyWasUserEntered] as? Bool) ?? false]
          }
          promise.resolve(["permission": "READ_REQUESTED", "samples": rows, "truncated": (samples?.count ?? 0) > 1000])
        }
        self.store.execute(query)
      }
    }
  }
}
