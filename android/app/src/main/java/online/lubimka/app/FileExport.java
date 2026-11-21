package online.lubimka.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/** One privately buffered generated file; its destination is always selected by the user. */
final class FileExport {
    static final int REQUEST = 3;
    private static final int LIMIT = 12 * 1024 * 1024;
    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable timeout = this::fail;
    private WebMessagePort current;
    private ByteArrayOutputStream bytes;
    private int expected;
    private String name;
    private String mime;
    private boolean choosing;

    FileExport(Activity activity) { this.activity = activity; }

    void begin(WebView web, Uri route) {
        if (choosing || current != null || !Links.isSite(Links.parse(web.getUrl()))) return;
        String id = route.getQueryParameter("id");
        if (id == null || !id.matches("[0-9a-f-]{36}")) return;
        String input = route.getQueryParameter("name");
        name = input == null ? "Любимка" : input.replaceAll("[^\\p{L}\\p{N} ._-]", "_");
        name = name.substring(0, Math.min(name.length(), 80)).replaceFirst("\\.[^.]*$", "").trim();
        if (name.isEmpty() || name.startsWith(".")) name = "Любимка";
        WebMessagePort[] ports = web.createWebMessageChannel();
        current = ports[0];
        current.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override public void onMessage(WebMessagePort port, WebMessage message) {
                if (port == current) receive(message.getData());
            }
        });
        main.postDelayed(timeout, 30000);
        web.postWebMessage(new WebMessage("lubimka-export:" + id, new WebMessagePort[]{ports[1]}),
                Uri.parse("https://" + Links.HOST));
    }

    private void receive(String data) {
        if (data == null || data.length() > 44000 || "error".equals(data)) { fail(); return; }
        try {
            if (bytes == null) {
                JSONObject meta = new JSONObject(data);
                mime = meta.getString("type");
                expected = meta.getInt("size");
                if (expected <= 0 || expected > LIMIT || extension(mime) == null) { fail(); return; }
                bytes = new ByteArrayOutputStream(expected);
            } else if (data.equals("end")) {
                if (bytes.size() != expected) { fail(); return; }
                disconnect();
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(mime)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .putExtra(Intent.EXTRA_TITLE, name + extension(mime));
                choosing = true;
                activity.startActivityForResult(save, REQUEST);
                return;
            } else {
                byte[] chunk = Base64.decode(data, Base64.NO_WRAP);
                if (chunk.length < 1 || chunk.length > 32768 || chunk.length > expected - bytes.size()) {
                    fail(); return;
                }
                bytes.write(chunk, 0, chunk.length);
            }
            main.removeCallbacks(timeout);
            main.postDelayed(timeout, 30000);
            current.postMessage(new WebMessage("next"));
        } catch (org.json.JSONException | IllegalArgumentException | ActivityNotFoundException invalid) {
            fail();
        }
    }

    void result(int code, Intent result) {
        if (!choosing || bytes == null) return;
        ByteArrayOutputStream snapshot = bytes;
        clear();
        Uri destination = result == null ? null : result.getData();
        if (code != Activity.RESULT_OK || destination == null || !"content".equals(destination.getScheme())) return;
        new Thread(() -> {
            try (OutputStream out = activity.getContentResolver().openOutputStream(destination, "wt")) {
                if (out == null) throw new IOException();
                snapshot.writeTo(out);
            } catch (IOException | SecurityException error) {
                main.post(() -> toast("Не удалось сохранить файл"));
                return;
            }
            main.post(() -> toast("Файл сохранён"));
        }, "lubimka-export").start();
    }

    void pageChanging() { if (!choosing) clear(); }
    void clear() { disconnect(); bytes = null; choosing = false; }
    private void disconnect() {
        main.removeCallbacks(timeout);
        if (current != null) { current.close(); current = null; }
    }
    private void fail() { clear(); toast("Не удалось сохранить файл. Поддерживаются PNG, JPEG и PDF до 12 МБ."); }
    private void toast(String text) {
        if (!activity.isDestroyed()) Toast.makeText(activity, text, Toast.LENGTH_LONG).show();
    }
    private static String extension(String type) {
        return switch (type) { case "image/png" -> ".png"; case "image/jpeg" -> ".jpg"; case "application/pdf" -> ".pdf"; default -> null; };
    }
}
