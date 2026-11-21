import XCTest

final class ScannerSmokeTests: XCTestCase {
    @MainActor
    func testOpenScannerAndReturnToHome() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let scanner = app.navigationBars.buttons["Сканировать QR-адресник"]
        XCTAssertTrue(scanner.waitForExistence(timeout: 12))

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        XCTAssertFalse(cameraAlert(in: springboard).exists, "Камеру можно запрашивать только после открытия сканера")
        scanner.tap()

        // A fresh simulator may ask on first scanner use; choose refusal to also exercise the photo fallback.
        let alert = cameraAlert(in: springboard)
        if alert.waitForExistence(timeout: 4) {
            let deny = alert.buttons.matching(NSPredicate(format: "label IN %@", ["Don’t Allow", "Don't Allow", "Не разрешать", "Запретить"])).firstMatch
            XCTAssertTrue(deny.exists, "У системного запроса камеры должна быть кнопка отказа")
            deny.tap()
        }
        let photo = app.buttons["Выбрать фото с QR-кодом"]
        XCTAssertTrue(photo.waitForExistence(timeout: 10))
        XCTAssertTrue(photo.isHittable)
        let close = app.navigationBars.buttons["Закрыть"]
        XCTAssertTrue(close.isHittable)
        close.tap()
        XCTAssertTrue(scanner.waitForExistence(timeout: 10))
        XCTAssertFalse(photo.exists)
    }

    @MainActor
    private func cameraAlert(in springboard: XCUIApplication) -> XCUIElement {
        springboard.alerts.containing(NSPredicate(
            format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "camera", "камер"
        )).firstMatch
    }
}

