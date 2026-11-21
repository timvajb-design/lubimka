import UIKit
import WebKit

final class BrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let web: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        return WKWebView(frame: .zero, configuration: configuration)
    }()
    private let errorPanel = UIStackView()
    private let message = UILabel()
    private var lastRequest = LinkPolicy.home
    private var exports: [ObjectIdentifier: URL] = [:]
    private var backObservation: NSKeyValueObservation?
    private lazy var backItem = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"),
                                               style: .plain, target: self, action: #selector(goBack))

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Любимка"
        view.backgroundColor = UIColor(red: 0.09, green: 0.07, blue: 0.06, alpha: 1)
        let scan = UIBarButtonItem(image: UIImage(systemName: "qrcode.viewfinder"), style: .plain,
                                   target: self, action: #selector(showScanner))
        scan.accessibilityLabel = "Сканировать QR-адресник"
        navigationItem.rightBarButtonItem = scan
        backItem.accessibilityLabel = "Назад"
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.isOpaque = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        // iOS owns both safe areas and the keyboard frame. The web chat owns its scroll position.
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: safe.topAnchor),
            web.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: safe.trailingAnchor)
        ])
        backObservation = web.observe(\.canGoBack, options: [.initial, .new]) { [weak self] view, _ in
            guard let self = self else { return }
            self.navigationItem.leftBarButtonItem = view.canGoBack ? self.backItem : nil
        }
        setupErrorPanel()
        load(LinkPolicy.home)
    }

    private func setupErrorPanel() {
        errorPanel.axis = .vertical
        errorPanel.spacing = 16
        errorPanel.alignment = .center
        message.font = .preferredFont(forTextStyle: .body)
        message.adjustsFontForContentSizeCategory = true
        message.textColor = .white
        message.textAlignment = .center
        message.numberOfLines = 0
        let retry = UIButton(type: .system)
        var config = UIButton.Configuration.filled()
        config.title = "Попробовать ещё раз"
        config.baseBackgroundColor = .systemOrange
        config.baseForegroundColor = .black
        retry.configuration = config
        retry.addTarget(self, action: #selector(retryLoading), for: .touchUpInside)
        errorPanel.addArrangedSubview(message)
        errorPanel.addArrangedSubview(retry)
        errorPanel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorPanel)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([errorPanel.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            errorPanel.centerYAnchor.constraint(equalTo: safe.centerYAnchor),
            errorPanel.widthAnchor.constraint(lessThanOrEqualTo: safe.widthAnchor, constant: -40)])
        errorPanel.isHidden = true
    }

    private func load(_ url: URL) {
        guard LinkPolicy.isApp(url) else { return }
        lastRequest = url
        errorPanel.isHidden = true
        web.isHidden = false
        web.load(URLRequest(url: url))
    }

    @objc private func retryLoading() { load(lastRequest) }
    @objc private func goBack() { if web.canGoBack { web.goBack() } }

    @objc func showScanner() {
        loadViewIfNeeded()
        guard presentedViewController == nil else { return }
        let scanner = ScannerController()
        scanner.onTag = { [weak self] url in self?.load(url) }
        let nav = UINavigationController(rootViewController: scanner)
        nav.modalPresentationStyle = .fullScreen
        present(nav, animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload {
            let source = action.sourceFrame
            let trusted = source.isMainFrame && source.securityOrigin.protocol == "https" &&
                source.securityOrigin.host.lowercased() == LinkPolicy.host && LinkPolicy.isAppBlob(url)
            decisionHandler(trusted ? .download : .cancel)
            return
        }
        if let frame = action.targetFrame, !frame.isMainFrame {
            let scheme = url.scheme?.lowercased()
            decisionHandler((scheme == "https" || url.absoluteString == "about:blank" || scheme == "blob") ? .allow : .cancel)
            return
        }
        if LinkPolicy.isApp(url) {
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                load(url)
            } else {
                if action.request.httpMethod == "GET" { lastRequest = url }
                decisionHandler(.allow)
            }
            return
        }
        decisionHandler(.cancel)
        let source = action.sourceFrame
        guard source.isMainFrame, source.securityOrigin.protocol == "https",
              source.securityOrigin.host.lowercased() == LinkPolicy.host,
              action.navigationType == .linkActivated || action.targetFrame == nil || LinkPolicy.isTaxi(url),
              LinkPolicy.canOpenExternally(url) else { return }
        openExternally(url)
    }

    // WebKit may request the popup UI delegate directly for links with target="_blank".
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let frame = action.sourceFrame
        guard action.targetFrame == nil, frame.isMainFrame, frame.securityOrigin.protocol == "https",
              frame.securityOrigin.host.lowercased() == LinkPolicy.host,
              let url = action.request.url else { return nil }
        if LinkPolicy.isApp(url) { load(url) }
        else if LinkPolicy.canOpenExternally(url) { openExternally(url) }
        return nil
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    // QR tags, posters and diary reports are generated on-device by the existing web app.
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let extensions = ["application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"]
        guard let ext = extensions[response.mimeType?.lowercased() ?? ""] else { completionHandler(nil); return }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false,
                                                    attributes: [.protectionKey: FileProtectionType.complete])
            let name = (suggestedFilename as NSString).lastPathComponent as NSString
            let cleanName = name.deletingPathExtension.filter { $0.isLetter || $0.isNumber || "-_ ".contains($0) }
            let file = directory.appendingPathComponent(cleanName.isEmpty ? "Любимка" : String(cleanName.prefix(70)))
                                .appendingPathExtension(ext)
            exports[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch { completionHandler(nil) }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = exports.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        if presentedViewController == nil { present(sheet, animated: true) }
        else { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = exports.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
        }
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "Не удалось сохранить файл", message: "Попробуйте выгрузить его ещё раз.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Закрыть", style: .cancel))
        present(alert, animated: true)
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:]) { [weak self] opened in
            guard !opened, let self = self, self.presentedViewController == nil else { return }
            let alert = UIAlertController(title: "Не удалось открыть ссылку",
                                          message: "Проверьте, установлено ли нужное приложение.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Закрыть", style: .cancel))
            self.present(alert, animated: true)
        }
    }

    private func showError(_ text: String) {
        message.text = text
        web.isHidden = true
        errorPanel.isHidden = false
        UIAccessibility.post(notification: .screenChanged, argument: message)
    }

    private func navigationFailed(_ error: Error) {
        let cause = error as NSError
        if cause.domain == NSURLErrorDomain && cause.code == NSURLErrorCancelled { return }
        // A blocked navigation or an external app handoff leaves the current page intact.
        if cause.domain == "WebKitErrorDomain" && cause.code == 102 { return }
        showError("Не удалось открыть «Любимку». Проверьте подключение к интернету.")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        navigationFailed(error)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showError("iOS остановила страницу. Откройте её ещё раз.")
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        web.isHidden = false
        errorPanel.isHidden = true
    }

    // Keep the website's existing confirmation and input dialogs functional inside WebKit.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage text: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard permitsDialog(frame) else { completionHandler(); return }
        let alert = UIAlertController(title: "Любимка", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Хорошо", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage text: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard permitsDialog(frame) else { completionHandler(false); return }
        let alert = UIAlertController(title: "Любимка", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Подтвердить", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt text: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard permitsDialog(frame) else { completionHandler(nil); return }
        let alert = UIAlertController(title: "Любимка", message: text, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "Готово", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        present(alert, animated: true)
    }

    private func permitsDialog(_ frame: WKFrameInfo) -> Bool {
        frame.isMainFrame && frame.securityOrigin.protocol == "https" &&
        frame.securityOrigin.host.lowercased() == LinkPolicy.host && presentedViewController == nil
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let firstParty = origin.protocol == "https" && origin.host.lowercased() == LinkPolicy.host
        decisionHandler(firstParty && frame.isMainFrame && type == .camera ? .prompt : .deny)
    }
}

