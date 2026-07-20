import SwiftUI
import UIKit

@objc(KeyboardViewController)
final class KeyboardViewController: UIInputViewController {
    private var hostingController: UIHostingController<KeyboardRootView>?
    private let viewModel = KeyboardViewModel()
    private var heightConstraint: NSLayoutConstraint?

    override func viewDidLoad() {
        super.viewDidLoad()
        setupKeyboard()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        viewModel.bootstrap(hasFullAccess: hasFullAccess)
    }

    private func setupKeyboard() {
        let root = KeyboardRootView(
            viewModel: viewModel,
            onInsert: { [weak self] text in
                self?.textDocumentProxy.insertText(text)
            },
            onAdvance: { [weak self] in
                self?.advanceToNextInputMode()
            },
            onDismiss: { [weak self] in
                self?.dismissKeyboard()
            }
        )

        let host = UIHostingController(rootView: root)
        hostingController = host
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)

        let height = view.heightAnchor.constraint(equalToConstant: 320)
        height.priority = .defaultHigh
        heightConstraint = height

        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            height,
        ])
        host.didMove(toParent: self)
        view.backgroundColor = .secondarySystemBackground
    }

    override func textWillChange(_ textInput: (any UITextInput)?) {}
    override func textDidChange(_ textInput: (any UITextInput)?) {}
}
