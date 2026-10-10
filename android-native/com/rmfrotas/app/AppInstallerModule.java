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
import java.util.List;

public class AppInstallerModule extends ReactContextBaseJavaModule {
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

    private HttpURLConnection getFinalConnection(String initialUrl) throws Exception {
        String currentUrl = initialUrl;
        for (int i = 0; i < 8; i++) {
            URL url = new URL(currentUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) RM-Frotas-Mobile");
            conn.setRequestProperty("Accept", "*/*");
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
                    currentUrl = new URL(base, location).toExternalForm();
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

    @ReactMethod
    public void downloadAndInstall(String downloadUrl, Promise promise) {
        if (downloadUrl == null || downloadUrl.isEmpty()) {
            promise.reject("ERR_NO_URL", "URL do APK não informada.");
            return;
        }

        promise.resolve(true);

        new Thread(() -> {
            HttpURLConnection connection = null;
            InputStream input = null;
            FileOutputStream output = null;
            try {
                Context context = reactContext.getApplicationContext();
                File cacheDir = context.getExternalCacheDir() != null ? context.getExternalCacheDir() : context.getCacheDir();
                File apkFile = new File(cacheDir, "rm-frotas-update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                connection = getFinalConnection(downloadUrl);

                int fileLength = connection.getContentLength();
                input = connection.getInputStream();
                output = new FileOutputStream(apkFile);

                byte[] data = new byte[16384];
                long total = 0;
                int count;
                int lastProgress = -1;

                while ((count = input.read(data)) != -1) {
                    total += count;
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
                    throw new Exception("Arquivo APK incompleto (" + apkFile.length() + " bytes).");
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
