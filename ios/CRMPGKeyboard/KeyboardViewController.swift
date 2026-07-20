import SwiftUI
import UIKit

final class KeyboardViewController: UIInputViewController {
    private let store = KeyboardStore()
    private var hostingController: UIHostingController<KeyboardRootView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        embedSwiftUI()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        store.hasFullAccess = hasFullAccess
        store.reloadFromCache()
        Task { @MainActor in
            await store.performSearch()
        }
        updateHeight()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        updateHeight()
    }

    private func updateHeight() {
        let height: CGFloat = 360
        for constraint in view.constraints where constraint.firstAttribute == .height {
            constraint.constant = height
            return
        }
        let heightConstraint = view.heightAnchor.constraint(equalToConstant: height)
        heightConstraint.priority = .defaultHigh
        heightConstraint.isActive = true
    }

    private func embedSwiftUI() {
        let root = KeyboardRootView(
            store: store,
            onInsert: { [weak self] text in
                guard let self, !text.isEmpty else { return }
                self.textDocumentProxy.insertText(text)
            },
            onAdvance: { [weak self] in
                // Best-effort move to next field in forms.
                self?.textDocumentProxy.insertText("\t")
            },
            onDismissKeyboard: { [weak self] in
                self?.dismissKeyboard()
            }
        )

        let host = UIHostingController(rootView: root)
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        hostingController = host
    }
}
