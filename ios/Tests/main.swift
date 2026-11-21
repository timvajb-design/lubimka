import Foundation

let token = "0123456789abcdef0123456789abcdef"
let original = "https://timvajb-design.github.io/lubimka/#tag=" + token
let current = "https://lubimka-app.netlify.app/#tag=" + token
precondition(LinkPolicy.petTag(original)?.absoluteString == current)
precondition(LinkPolicy.petTag(current)?.absoluteString == current)
for url in [
    "https://other.example/lubimka/#tag=" + token,
    current + "x", current + "%0a", current + "&x=1",
    original.replacingOccurrences(of: "https:", with: "http:"),
    original.replacingOccurrences(of: "/lubimka/", with: "/other/"),
    original.replacingOccurrences(of: "github.io/", with: "github.io:445/"),
    original.replacingOccurrences(of: "/#tag", with: "/?a=1#tag"),
    original.replacingOccurrences(of: "://", with: "://user:pass@"),
    "https://t.me/lubimkaa1_bot?start=login_example", "data:text/plain," + original
] { precondition(LinkPolicy.petTag(url) == nil) }

func address(_ text: String) -> URL { URL(string: text)! }
precondition(LinkPolicy.isApp(address(current)))
precondition(!LinkPolicy.isApp(address("https://lubimka-app.netlify.app.example/")))
precondition(!LinkPolicy.isApp(address("https://name@lubimka-app.netlify.app/")))
precondition(!LinkPolicy.isApp(address("http://lubimka-app.netlify.app/")))
precondition(LinkPolicy.isAppBlob(address("blob:https://lubimka-app.netlify.app/test-id")))
precondition(!LinkPolicy.isAppBlob(address("blob:https://other.example/test-id")))
precondition(!LinkPolicy.isAppBlob(address("blob:null/test-id")))
precondition(LinkPolicy.isTaxi(address("https://taxi.lubimka.online/zootaxi?source=website")))
precondition(!LinkPolicy.isTaxi(address("https://taxi.lubimka.online.evil.example/zootaxi")))
for url in ["https://t.me/lubimkaa1_bot?start=login_example", "https://yandex.ru/maps", "tel:+70000000000", "mailto:info@example.org"] {
    precondition(LinkPolicy.canOpenExternally(address(url)))
}
for url in ["file:///etc/passwd","http://example.org/","javascript:alert(1)","data:text/plain,x","tel:123;4","mailto:", "https://user@example.org/"] {
    precondition(!LinkPolicy.canOpenExternally(address(url)))
}
print("Link policy, Telegram handoff and supported pet tag formats passed.")

