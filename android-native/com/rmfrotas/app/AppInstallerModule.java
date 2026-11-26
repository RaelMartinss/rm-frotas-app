package com.rmfrotas.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import javax.net.ssl.HttpsURLConnection;

public class AppInstallerModule extends ReactContextBaseJavaModule {
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
        "github.com",
        "api.github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com"
    ));

    private static final String ALLOWED_REPO_PREFIX = "/raelmartinss/rm-frotas-app/";
    private static final String ALLOWED_API_REPO_PREFIX = "/repos/raelmartinss/rm-frotas-app/";

    private final ReactApplicationContext reactContext;

    public AppInstallerModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "AppInstaller";
    }

    private void sendEvent(String eventName, WritableMap params) {
        try {
            if (reactContext != null) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
            }
        } catch (Exception ignored) {
        }
    }

    @ReactMethod
    public void canInstall(Promise promise) {
        try {
            boolean can = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                can = reactContext.getPackageManager().canRequestPackageInstalls();
            }
            promise.resolve(can);
        } catch (Exception e) {
            promise.reject("ERR_CAN_INSTALL", e.getMessage());
        }
    }

    @ReactMethod
    public void openInstallSettings(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + reactContext.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERR_SETTINGS", e.getMessage());
        }
    }

    private void validateDownloadUrl(URL url, boolean isInitialHop) throws SecurityException {
        if (url == null || !"https".equalsIgnoreCase(url.getProtocol())) {
            throw new SecurityException("Atualização bloqueada: apenas conexões seguras HTTPS são permitidas.");
        }

        String host = url.getHost() != null ? url.getHost().toLowerCase(Locale.US) : "";
        if (!ALLOWED_HOSTS.contains(host)) {
            throw new SecurityException("Atualização bloqueada: domínio não autorizado (" + host + ").");
        }

        if (isInitialHop) {
            String path = url.getPath() != null ? url.getPath().toLowerCase(Locale.US) : "";
            boolean validRepoPath =
                ("github.com".equals(host) && path.startsWith(ALLOWED_REPO_PREFIX)) ||
                ("api.github.com".equals(host) && path.startsWith(ALLOWED_API_REPO_PREFIX));
            if (!validRepoPath) {
                throw new SecurityException("Atualização bloqueada: origem fora do repositório oficial RM Frotas.");
            }
        }
    }

    private HttpsURLConnection getFinalConnection(String initialUrl) throws Exception {
        String currentUrl = initialUrl;
        for (int i = 0; i < 8; i++) {
            URL url = new URL(currentUrl);
            validateDownloadUrl(url, i == 0);

            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) RM-Frotas-Mobile");
            conn.setRequestProperty("Accept", "application/octet-stream,*/*");
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
            conn.setInstanceFollowRedirects(false);
            conn.connect();

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP ||
                code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location != null && !location.isEmpty()) {
                    URL base = new URL(currentUrl);
                    URL nextUrl = new URL(base, location);
                    validateDownloadUrl(nextUrl, false);
                    currentUrl = nextUrl.toExternalForm();
                    continue;
                }
            }
            if (code >= 200 && code < 300) {
                return conn;
            } else {
                conn.disconnect();
                throw new Exception("Falha HTTP " + code + ": " + conn.getResponseMessage());
            }
        }
        throw new Exception("Muitos redirecionamentos ao baixar APK");
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.US, "%02x", b & 0xff));
        }
        return sb.toString();
    }

    @ReactMethod
    public void downloadAndInstall(String downloadUrl, Promise promise) {
        startDownloadAndInstall(downloadUrl, null, promise);
    }

    @ReactMethod
    public void downloadAndInstallVerified(String downloadUrl, String expectedSha256, Promise promise) {
        startDownloadAndInstall(downloadUrl, expectedSha256, promise);
    }

    private void startDownloadAndInstall(String downloadUrl, String expectedSha256, Promise promise) {
        if (downloadUrl == null || downloadUrl.isEmpty()) {
            promise.reject("ERR_NO_URL", "URL do APK não informada.");
            return;
        }

        try {
            validateDownloadUrl(new URL(downloadUrl), true);
        } catch (Exception secErr) {
            promise.reject("ERR_UNTRUSTED_URL", secErr.getMessage());
            return;
        }

        promise.resolve(true);

        new Thread(() -> {
            HttpsURLConnection connection = null;
            InputStream input = null;
            FileOutputStream output = null;
            File apkFile = null;
            try {
                Context context = reactContext.getApplicationContext();
                File updatesDir = new File(context.getCacheDir(), "updates");
                if (!updatesDir.exists() && !updatesDir.mkdirs()) {
                    throw new Exception("Não foi possível preparar o diretório seguro de atualização.");
                }

                apkFile = new File(updatesDir, "rm-frotas-update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                connection = getFinalConnection(downloadUrl);

                int fileLength = connection.getContentLength();
                input = connection.getInputStream();
                output = new FileOutputStream(apkFile);
                MessageDigest digest = MessageDigest.getInstance("SHA-256");

                byte[] data = new byte[16384];
                byte[] headerBytes = new byte[4];
                int headerFilled = 0;
                long total = 0;
                int count;
                int lastProgress = -1;

                while ((count = input.read(data)) != -1) {
                    if (headerFilled < 4) {
                        int toCopy = Math.min(4 - headerFilled, count);
                        System.arraycopy(data, 0, headerBytes, headerFilled, toCopy);
                        headerFilled += toCopy;
                    }

                    total += count;
                    digest.update(data, 0, count);
                    output.write(data, 0, count);

                    if (fileLength > 0) {
                        int progress = (int) (total * 100 / fileLength);
                        if (progress != lastProgress) {
                            lastProgress = progress;
                            WritableMap progressMap = Arguments.createMap();
                            progressMap.putInt("progress", progress);
                            sendEvent("app_update_progress", progressMap);
                        }
                    }
                }

                output.flush();
                output.close();
                output = null;
                input.close();
                input = null;
                connection.disconnect();
                connection = null;

                if (!apkFile.exists() || apkFile.length() < 1000000) {
                    apkFile.delete();
                    throw new Exception("Arquivo APK incompleto (" + apkFile.length() + " bytes).");
                }

                // Verifica assinatura estrutural ZIP/APK (PK\x03\x04)
                if (headerFilled < 4 || headerBytes[0] != 0x50 || headerBytes[1] != 0x4B ||
                    headerBytes[2] != 0x03 || headerBytes[3] != 0x04) {
                    apkFile.delete();
                    throw new SecurityException("Arquivo baixado não é um pacote APK válido.");
                }

                if (expectedSha256 != null && !expectedSha256.trim().isEmpty()) {
                    String cleanExpected = expectedSha256.trim().toLowerCase(Locale.US);
                    if (cleanExpected.startsWith("sha256:")) {
                        cleanExpected = cleanExpected.substring(7);
                    }
                    String actualSha256 = bytesToHex(digest.digest());
                    if (!cleanExpected.equals(actualSha256)) {
                        apkFile.delete();
                        throw new SecurityException("Falha na verificação de integridade SHA-256 do APK.");
                    }
                }

                WritableMap completedMap = Arguments.createMap();
                completedMap.putInt("progress", 100);
                completedMap.putString("path", apkFile.getAbsolutePath());
                sendEvent("app_update_completed", completedMap);

                Uri apkUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

                try {
                    List<ResolveInfo> resInfoList = context.getPackageManager().queryIntentActivities(installIntent, PackageManager.MATCH_DEFAULT_ONLY);
                    for (ResolveInfo resolveInfo : resInfoList) {
                        String packageName = resolveInfo.activityInfo.packageName;
                        context.grantUriPermission(packageName, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    }
                } catch (Exception ignored) {}

                context.startActivity(installIntent);

            } catch (Exception e) {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (connection != null) connection.disconnect();
                    if (apkFile != null && apkFile.exists()) apkFile.delete();
                } catch (Exception ignored) {}

                WritableMap errorMap = Arguments.createMap();
                errorMap.putString("error", e.getMessage() != null ? e.getMessage() : "Erro desconhecido ao baixar APK");
                sendEvent("app_update_error", errorMap);
            }
        }).start();
    }

    @ReactMethod
    public void addListener(String eventName) {
    }

    @ReactMethod
    public void removeListeners(double count) {
    }
}
