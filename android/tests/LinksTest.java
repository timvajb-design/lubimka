package online.lubimka.app;

import java.util.Objects;

public final class LinksTest {
    static int checks = 0;
    static void expect(Object expected, Object actual) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(expected + " <> " + actual);
        checks++;
    }
    public static void main(String[] unused) {
        String first = Links.HOME + "posts/00000000-0000-4000-8000-000000000001/";
        String next = Links.HOME + "posts/00000000-0000-4000-8000-000000000002/";
        expect(first, Links.publicPost(first));
        expect(first, Links.publicPost(first + "?from=share#local"));
        expect(first, Links.publicPost(first.substring(0, first.length()-1)));
        expect(first, Links.sharedPost("Нашёл объявление\n" + first));
        expect(null, Links.sharedPost(first + " " + next));
        expect(null, Links.sharedPost(null));
        expect(null, Links.publicPost(Links.HOME + "account/?token=fake"));
        expect(null, Links.publicPost(first.replace("https:", "http:")));
        expect(null, Links.publicPost(first.replace(".app/", ".app.evil.example/")));
        expect(null, Links.publicPost(first.replace("https://", "https://user@")));
        expect(null, Links.publicPost(first.replace(".app/", ".app:4444/")));
        expect(false, Links.isSite(Links.parse("file:///etc/hosts")));
        expect(false, Links.isSite(Links.parse("https://example.com\\@" + Links.HOST)));
        expect(true, Links.isSite(Links.parse(Links.HOME)));
        expect(true, Links.external(Links.parse("https://t.me/lubimkaa1_bot?start=login_test")));
        expect(true, Links.external(Links.parse("tg://resolve?domain=lubimkaa1_bot")));
        expect(true, Links.external(Links.parse("tel:+79775830015")));
        expect(false, Links.external(Links.parse("tel:*123%23")));
        expect(false, Links.external(Links.parse("intent://anything")));
        expect(false, Links.external(Links.parse("javascript:alert(1)")));
        expect(false, Links.external(Links.parse("file:///storage/test")));
        expect(false, Links.external(Links.parse("content://settings/system")));
        expect(false, Links.external(Links.parse("https://user:password@example.org")));
        expect(false, Links.external(Links.parse("tg://proxy?server=example.org")));
        System.out.println(checks + " link and share checks passed");
    }
}
