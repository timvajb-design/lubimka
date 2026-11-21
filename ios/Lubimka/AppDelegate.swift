import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let browser = BrowserController()
    private var pendingScanner = false

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let navigation = UINavigationController(rootViewController: browser)
        navigation.navigationBar.tintColor = .systemOrange
        let window = UIWindow(windowScene: scene)
        window.rootViewController = navigation
        self.window = window
        pendingScanner = connectionOptions.shortcutItem?.type == "online.lubimka.app.scan"
        window.makeKeyAndVisible()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        if pendingScanner {
            pendingScanner = false
            browser.showScanner()
        }
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        guard shortcutItem.type == "online.lubimka.app.scan" else {
            completionHandler(false)
            return
        }
        browser.showScanner()
        completionHandler(true)
    }
}

