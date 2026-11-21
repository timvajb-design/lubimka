package online.lubimka.app;

import java.net.URI;
import java.util.regex.Pattern;

final class Links {
    static final String HOST = "lubimka-app.netlify.app";
    static final String HOME = "https://" + HOST + "/";
    private static final Pattern POST = Pattern.compile(
            "/posts/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/?");

    private Links() {}

    static URI parse(String value) {
        if (value == null || value.length() > 8192 || value.indexOf('\\') >= 0) return null;
        try {
            return URI.create(value);
        } catch (IllegalArgumentException invalid) {
            return null;
        }
    }

    static boolean isSite(URI uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && HOST.equalsIgnoreCase(uri.getHost()) && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    static String publicPost(String value) {
        URI uri = parse(value == null ? null : value.trim());
        if (!isSite(uri) || !POST.matcher(uri.getRawPath()).matches()) return null;
        String path = uri.getRawPath();
        return "https://" + HOST + path + (path.endsWith("/") ? "" : "/");
    }

    static String sharedPost(String text) {
        if (text == null || text.length() > 8192) return null;
        String selected = null;
        for (String word : text.trim().split("\\s+")) {
            String candidate = publicPost(word);
            if (candidate == null) continue;
            if (selected != null && !selected.equals(candidate)) return null;
            selected = candidate;
        }
        return selected;
    }

    static boolean external(URI uri) {
        if (uri == null || uri.getScheme() == null || uri.getRawUserInfo() != null) return false;
        if ("https".equalsIgnoreCase(uri.getScheme())) {
            return uri.getHost() != null && (uri.getPort() == -1 || uri.getPort() == 443);
        }
        if ("tel".equalsIgnoreCase(uri.getScheme())) {
            return uri.getRawSchemeSpecificPart().matches("[+0-9().-]{3,32}");
        }
        if ("tg".equalsIgnoreCase(uri.getScheme())) {
            return "resolve".equalsIgnoreCase(uri.getHost());
        }
        return "mailto".equalsIgnoreCase(uri.getScheme()) && uri.isOpaque()
                && uri.getRawSchemeSpecificPart().matches("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+");
    }
}
