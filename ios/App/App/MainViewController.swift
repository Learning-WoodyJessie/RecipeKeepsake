import Capacitor
import WebKit

/// Subclasses Capacitor's bridge view controller solely to enable Safari Web
/// Inspector on Release/TestFlight builds, which are not inspectable by
/// default. Debug builds (Simulator runs) are already inspectable, so this
/// is what let us debug the blank-screen issue on a real TestFlight build by
/// attaching Safari's Develop menu the same way we did with the Simulator.
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        if #available(iOS 16.4, *) {
            self.webView?.isInspectable = true
        }
    }
}
