import UIKit
import AVFoundation
import PhotosUI
import ImageIO
import Vision

final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate, PHPickerViewControllerDelegate {
    var onTag: ((URL) -> Void)?
    private let session = AVCaptureSession()
    // Configure/start/stop serially; interruption by the picker or dismissal cannot restart the camera out of order.
    private let captureQueue = DispatchQueue(label: "online.lubimka.app.qr-camera")
    private let preview = UIView()
    private lazy var previewLayer = AVCaptureVideoPreviewLayer(session: session)
    private let status = UILabel()
    private var alive = false
    private var completing = false

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "QR-адресник"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Закрыть", style: .plain, target: self, action: #selector(close))
        preview.backgroundColor = .black
        preview.layer.cornerRadius = 16
        preview.clipsToBounds = true
        previewLayer.videoGravity = .resizeAspectFill
        preview.layer.addSublayer(previewLayer)
        status.text = "Наведите камеру на QR-адресник «Любимки»."
        status.font = .preferredFont(forTextStyle: .body)
        status.adjustsFontForContentSizeCategory = true
        status.textAlignment = .center
        status.numberOfLines = 0
        let photo = UIButton(type: .system)
        var appearance = UIButton.Configuration.filled()
        appearance.title = "Выбрать фото с QR-кодом"
        appearance.baseBackgroundColor = .systemOrange
        appearance.baseForegroundColor = .black
        photo.configuration = appearance
        photo.addTarget(self, action: #selector(selectPhoto), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [preview, status, photo])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: safe.topAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -16)
        ])
        preview.setContentHuggingPriority(.defaultLow, for: .vertical)
        preview.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = preview.bounds
        guard let connection = previewLayer.connection, connection.isVideoOrientationSupported,
              let orientation = view.window?.windowScene?.interfaceOrientation else { return }
        switch orientation {
        case .portrait: connection.videoOrientation = .portrait
        case .portraitUpsideDown: connection.videoOrientation = .portraitUpsideDown
        case .landscapeLeft: connection.videoOrientation = .landscapeLeft
        case .landscapeRight: connection.videoOrientation = .landscapeRight
        default: break
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        alive = true
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: startCamera()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self = self, self.alive else { return }
                    if granted { self.startCamera() } else { self.noCamera() }
                }
            }
        default: noCamera()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        alive = false
        pauseCamera()
    }

    private func noCamera() {
        status.text = "Камера недоступна. Можно выбрать фотографию адресника."
    }

    private func startCamera() {
        captureQueue.async { [weak self] in
            guard let self = self else { return }
            if self.session.inputs.isEmpty {
                guard let camera = AVCaptureDevice.default(for: .video),
                      let input = try? AVCaptureDeviceInput(device: camera) else {
                    DispatchQueue.main.async { self.noCamera() }
                    return
                }
                let output = AVCaptureMetadataOutput()
                self.session.beginConfiguration()
                guard self.session.canAddInput(input) else {
                    self.session.commitConfiguration()
                    DispatchQueue.main.async { self.noCamera() }
                    return
                }
                self.session.addInput(input)
                guard self.session.canAddOutput(output) else {
                    self.session.removeInput(input)
                    self.session.commitConfiguration()
                    DispatchQueue.main.async { self.noCamera() }
                    return
                }
                self.session.addOutput(output)
                guard output.availableMetadataObjectTypes.contains(.qr) else {
                    self.session.removeOutput(output)
                    self.session.removeInput(input)
                    self.session.commitConfiguration()
                    DispatchQueue.main.async { self.noCamera() }
                    return
                }
                output.setMetadataObjectsDelegate(self, queue: .main)
                output.metadataObjectTypes = [.qr]
                self.session.commitConfiguration()
            }
            if !self.session.isRunning { self.session.startRunning() }
            DispatchQueue.main.async { self.view.setNeedsLayout() }
        }
    }

    private func pauseCamera() {
        let session = self.session
        captureQueue.async { if session.isRunning { session.stopRunning() } }
    }

    @objc private func close() { dismiss(animated: true) }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard alive, !completing, presentedViewController == nil else { return }
        let values = objects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
        if let tag = values.compactMap(LinkPolicy.petTag).first { open(tag) }
        else if !values.isEmpty { status.text = "Это другой QR-код. Наведите камеру на адресник «Любимки»." }
    }

    private func open(_ url: URL) {
        guard !completing else { return }
        completing = true
        pauseCamera()
        let callback = onTag
        dismiss(animated: true) { callback?(url) }
    }

    @objc private func selectPhoto() {
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
        present(picker, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true) { [weak self] in
            guard let self = self, let provider = results.first?.itemProvider else { return }
            self.status.text = "Ищем адресник на фото…"
            provider.loadFileRepresentation(forTypeIdentifier: "public.image") { [weak self] url, _ in
                // The system file URL is valid only during this callback. Downsample before decoding.
                let tag = url.flatMap(Self.decodeTag)
                DispatchQueue.main.async {
                    guard let self = self, self.alive, !self.completing else { return }
                    if let tag = tag { self.open(tag) }
                    else { self.status.text = "Адресник «Любимки» не найден на фото. Выберите другое изображение." }
                }
            }
        }
    }

    nonisolated private static func decodeTag(_ url: URL) -> URL? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 2048
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let request = VNDetectBarcodesRequest()
        request.symbologies = [.qr]
        do {
            try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            return request.results?.compactMap { $0.payloadStringValue }.compactMap(LinkPolicy.petTag).first
        } catch { return nil }
    }
}

