import SwiftUI
import WebKit

@main
struct XRPAlertsApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainerView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}

struct WebContainerView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebHostController {
        return WebHostController()
    }
    func updateUIViewController(_ uiViewController: WebHostController, context: Context) {}
}

final class WebHostController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        let bg = UIColor(red: 24/255, green: 25/255, blue: 28/255, alpha: 1.0)
        view.backgroundColor = bg

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = bg
        webView.scrollView.backgroundColor = bg
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.uiDelegate = self
        webView.navigationDelegate = self
        view.addSubview(webView)

        if let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebBundle") {
            let dirURL = indexURL.deletingLastPathComponent()
            webView.loadFileURL(indexURL, allowingReadAccessTo: dirURL)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url {
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "scriptable" || (navigationAction.navigationType == .linkActivated && (scheme == "http" || scheme == "https")) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }
}
