package online.lubimka.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.net.URI;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    private static final int PICK_IMAGES = 1, LOCATION = 2;
    private WebView browser;
    private LinearLayout offline;
    private String retryUrl = Links.HOME;
    private ValueCallback<Uri[]> imageSelection;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;
    private boolean inBackAction, mayPickMultiple;
    private FileExport fileExport;
    private String exportScript;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets edges = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        root.setBackgroundColor(getColor(R.color.surface));
        browser = new WebView(this);
        fileExport = new FileExport(this);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                getAssets().open("export.js"), StandardCharsets.UTF_8))) {
            StringBuilder source = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) source.append(line).append('\n');
            exportScript = source.toString();
        } catch (IOException missingAsset) { throw new IllegalStateException(missingAsset); }
        root.addView(browser);
        offline = makeOfflineView();
        root.addView(offline);
        setContentView(root);

        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        browser.setWebViewClient(new SiteClient());
        browser.setWebChromeClient(new SiteChrome());
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
        if (state == null || browser.restoreState(state) == null) {
            if (!handleIntent(getIntent())) browser.loadUrl(Links.HOME);
        }
    }

    private LinearLayout makeOfflineView() {
        LinearLayout panel = new LinearLayout(this);
        panel.setGravity(Gravity.CENTER);
        panel.setOrientation(LinearLayout.VERTICAL);
        int gap = (int)(24 * getResources().getDisplayMetrics().density);
        panel.setPadding(gap, gap, gap, gap);
        panel.setBackgroundColor(getColor(R.color.surface));
        TextView title = new TextView(this);
        title.setText("Не удалось открыть страницу");
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        panel.addView(title);
        TextView explanation = new TextView(this);
        explanation.setText("Проверьте подключение к интернету и попробуйте ещё раз.");
        explanation.setGravity(Gravity.CENTER);
        explanation.setPadding(0, gap / 2, 0, gap);
        panel.addView(explanation);
        Button retry = new Button(this);
        retry.setText("Попробовать снова");
        retry.setOnClickListener(view -> { browser.loadUrl(retryUrl); });
        panel.addView(retry);
        panel.setVisibility(View.GONE);
        return panel;
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private boolean handleIntent(Intent intent) {
        if (intent == null) return false;
        if ("online.lubimka.app.OPEN_POST".equals(intent.getAction())) {
            browser.loadUrl(Links.HOME);
            EditText input = new EditText(this);
            input.setSingleLine();
            input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
            input.setHint("Ссылка на объявление");
            AlertDialog prompt = new AlertDialog.Builder(this).setTitle("Открыть объявление")
                    .setView(input).setNegativeButton("Отмена", null)
                    .setPositiveButton("Открыть", null).create();
            prompt.setOnShowListener(dialog -> prompt.getButton(AlertDialog.BUTTON_POSITIVE)
                    .setOnClickListener(button -> {
                        String post = Links.publicPost(input.getText().toString());
                        if (post == null) { input.setError("Нужна ссылка на объявление Любимки"); return; }
                        browser.loadUrl(post);
                        prompt.dismiss();
                    }));
            prompt.show();
            return true;
        }
        if (!Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) return false;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String post = text == null || text.length() > 8192 ? null : Links.sharedPost(text.toString());
        if (post == null) { message("Подходит ссылка на публичное объявление Любимки"); return false; }
        browser.loadUrl(post);
        return true;
    }

    private boolean trustedPage() { return Links.isSite(Links.parse(browser.getUrl())); }

    private void sharePost(String link) {
        String post = Links.publicPost(link);
        if (post == null) return;
        Intent share = new Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, post);
        startActivity(Intent.createChooser(share, "Поделиться объявлением"));
    }

    private boolean route(Uri target, boolean gesture) {
        URI parsed = Links.parse(target.toString());
        if (Links.isSite(parsed)) return false;
        if (!gesture || !trustedPage()) return true;
        if ("lubimka-save".equals(target.getScheme()) && "file".equals(target.getAuthority())) {
            fileExport.begin(browser, target);
            return true;
        }
        if ("lubimka-share".equals(target.getScheme()) && "post".equals(target.getAuthority())) {
            sharePost(target.getQueryParameter("url"));
            return true;
        }
        if (!Links.external(parsed)) return true;
        String action = "tel".equals(parsed.getScheme()) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW;
        try { startActivity(new Intent(action, target)); }
        catch (ActivityNotFoundException unavailable) { message("На телефоне нет приложения для этой ссылки"); }
        return true;
    }

    private final class SiteClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return request.isForMainFrame() && route(request.getUrl(), request.hasGesture());
        }
        @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
            fileExport.pageChanging();
            if (Links.isSite(Links.parse(url))) retryUrl = url;
            offline.setVisibility(View.GONE);
            view.setVisibility(View.VISIBLE);
        }
        @Override public void onPageFinished(WebView view, String url) {
            if (Links.isSite(Links.parse(url))) {
                CookieManager.getInstance().flush();
                view.evaluateJavascript(SHARE_SUPPORT, null);
                view.evaluateJavascript(exportScript, null);
            }
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
            if (req.isForMainFrame()) showFailure(req);
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse error) {
            if (req.isForMainFrame() && error.getStatusCode() >= 500) showFailure(req);
        }
        private void showFailure(WebResourceRequest req) {
            String target = req.getUrl().toString();
            if (!Links.isSite(Links.parse(target))) return;
            retryUrl = target;
            browser.setVisibility(View.INVISIBLE);
            offline.setVisibility(View.VISIBLE);
        }
    }

    // Some WebView providers lack Web Share. Forward only public announcement URLs,
    // through the same gesture-checked navigation path. Never expose a Java JS interface.
    private static final String SHARE_SUPPORT = """
        (() => {
          if (location.origin !== 'https://lubimka-app.netlify.app' || navigator.share) return;
          const canShare = data => {
            if (!data || !data.url || data.files) return false;
            try { const u = new URL(data.url); return u.origin === location.origin && /^\\/posts\\/[0-9a-f-]{36}\\/?$/i.test(u.pathname); }
            catch { return false; }
          };
          Object.defineProperty(navigator, 'canShare', {value:canShare, configurable:true});
          Object.defineProperty(navigator, 'share', {configurable:true, value:async data => {
            if (!canShare(data) || !navigator.userActivation?.isActive) throw new DOMException('Нужна ссылка на объявление', 'NotAllowedError');
            location.href = 'lubimka-share://post?url=' + encodeURIComponent(data.url);
          }});
        })()
        """;

    private final class SiteChrome extends WebChromeClient {
        @Override public boolean onCreateWindow(WebView parent, boolean dialog, boolean gesture, Message result) {
            if (!gesture || !trustedPage()) return false;
            // The temporary window captures target=_blank without loading the target's scripts.
            WebView target = new WebView(MainActivity.this);
            target.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request.isForMainFrame()) {
                        Uri url = request.getUrl();
                        if (!route(url, true)) browser.loadUrl(url.toString());
                        view.post(view::destroy);
                    }
                    return true;
                }
            });
            ((WebView.WebViewTransport)result.obj).setWebView(target);
            result.sendToTarget();
            return true;
        }
        @Override public boolean onShowFileChooser(WebView source, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (!trustedPage() || imageSelection != null) { callback.onReceiveValue(null); return true; }
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*")
                    .addCategory(Intent.CATEGORY_OPENABLE);
            mayPickMultiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, mayPickMultiple);
            imageSelection = callback;
            try { startActivityForResult(intent, PICK_IMAGES); }
            catch (ActivityNotFoundException e) { finishSelection(null); message("Не удалось открыть выбор фото"); }
            return true;
        }
        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!trustedPage() || !Links.isSite(Links.parse(origin)) || locationCallback != null) {
                callback.invoke(origin, false, false);
                return;
            }
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                callback.invoke(origin, true, false);
            } else {
                locationCallback = callback;
                locationOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION);
            }
        }
        @Override public void onGeolocationPermissionsHidePrompt() { finishLocation(false); }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == LOCATION) finishLocation(trustedPage() && results.length > 0
                && results[0] == PackageManager.PERMISSION_GRANTED);
    }
    private void finishLocation(boolean allowed) {
        if (locationCallback != null) locationCallback.invoke(locationOrigin, allowed, false);
        locationCallback = null;
        locationOrigin = null;
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FileExport.REQUEST) { fileExport.result(result, data); return; }
        if (request != PICK_IMAGES || imageSelection == null) return;
        List<Uri> images = new ArrayList<>();
        if (result == RESULT_OK && data != null && trustedPage()) {
            ClipData clip = data.getClipData();
            if (clip == null) addImage(images, data.getData());
            else for (int i = 0; i < Math.min(clip.getItemCount(), mayPickMultiple ? 32 : 1); i++) {
                addImage(images, clip.getItemAt(i).getUri());
            }
        }
        finishSelection(images.isEmpty() ? null : images.toArray(new Uri[0]));
    }
    private void addImage(List<Uri> selected, Uri uri) {
        if (uri == null || !"content".equals(uri.getScheme()) || selected.contains(uri)) return;
        try {
            String mime = getContentResolver().getType(uri);
            if (mime != null && mime.startsWith("image/")) selected.add(uri);
        } catch (SecurityException inaccessible) { /* Android can revoke access before the result arrives. */ }
    }
    private void finishSelection(Uri[] value) {
        if (imageSelection != null) imageSelection.onReceiveValue(value);
        imageSelection = null;
    }
    @Override public void onBackPressed() { navigateBack(); }
    private void navigateBack() {
        if (inBackAction) return;
        if (offline.getVisibility() == View.VISIBLE || !trustedPage()) { historyBack(); return; }
        inBackAction = true;
        browser.evaluateJavascript("""
            (() => {const d = [...document.querySelectorAll('dialog[open]')].pop();
            if(!d)return false; if(d.requestClose)d.requestClose();
            else if(d.dispatchEvent(new Event('cancel',{cancelable:true})))d.close(); return true;})()
            """, dismissed -> {
            inBackAction = false;
            if (!"true".equals(dismissed)) historyBack();
        });
    }
    private void historyBack() {
        if (browser.canGoBack()) browser.goBack();
        else finish();
    }
    private void message(String value) { Toast.makeText(this, value, Toast.LENGTH_SHORT).show(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        browser.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() { super.onPause(); browser.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); browser.onResume(); }
    @Override protected void onDestroy() {
        fileExport.clear();
        finishSelection(null);
        finishLocation(false);
        ((FrameLayout)browser.getParent()).removeView(browser);
        browser.destroy();
        super.onDestroy();
    }
}
