package net.xion.client.feature;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.xion.client.compat.Ids;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Xion Store cosmetics on every player. The store publishes one small public list of who wears what
 * (by Minecraft name); Xion Client downloads it about once a minute while you are in a world and draws
 * each player's store cape (also used for their elytra). Cape textures are fetched once and cached.
 * Nothing about you is sent: this only reads the public list.
 */
public final class StoreCosmetics {
	/** The account-backed wear list. The old store list can contain cosmetics equipped years ago. */
	public static final String ACCOUNT = "https://xionx.vercel.app";
	/** New launcher/account capes live here; old shop-only textures fall back to LEGACY. */
	public static final String ASSETS = ACCOUNT + "/assets/capes/";
	public static final String LEGACY = "https://xion-store.vercel.app/assets/capes/";
	private static final long FETCH_EVERY = 60_000L;
	private static final long FRAME_MS = 110;
	private static final Object LOADING = new Object(), MISSING = new Object();

	/** lowercase player name -> cape id */
	private static volatile Map<String, String> capes = Map.of();
	/** cape id -> frame count */
	private static volatile Map<String, Integer> frames = Map.of();
	private static final Map<String, Object> textures = new ConcurrentHashMap<>();
	private static final Set<String> fetching = ConcurrentHashMap.newKeySet();
	private static long lastFetch;
	private static volatile boolean busy;

	private StoreCosmetics() {}

	/** Called every client tick. */
	public static void tick(Minecraft mc) {
		if (mc.level == null || busy) return;
		long now = System.currentTimeMillis();
		if (now - lastFetch < FETCH_EVERY) return;
		lastFetch = now;
		busy = true;
		Thread t = new Thread(() -> {
			try {
				fetchWear();
			} catch (Exception ignored) {
			} finally {
				busy = false;
			}
		}, "Xion-Store");
		t.setDaemon(true);
		t.start();
	}

	private static void fetchWear() throws Exception {
		byte[] body = get(ACCOUNT + "/api/cosmetics?r=wear");
		if (body == null) return;
		JsonObject root = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject();
		Map<String, Integer> f = new ConcurrentHashMap<>();
		if (root.has("capes") && root.get("capes").isJsonObject()) {
			for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("capes").entrySet()) {
				try {
					int n = e.getValue().getAsInt();
					if (n > 0 && n <= 64) f.put(e.getKey(), n);
				} catch (Exception ignored) {
				}
			}
		}
		Map<String, String> c = new ConcurrentHashMap<>();
		if (root.has("players") && root.get("players").isJsonObject()) for (Map.Entry<String, JsonElement> e : root.getAsJsonObject("players").entrySet()) {
			if (!e.getValue().isJsonObject()) continue;
			JsonObject p = e.getValue().getAsJsonObject();
			if (p.has("cape") && p.get("cape").isJsonPrimitive()) {
				String id = p.get("cape").getAsString();
				if (f.containsKey(id)) c.put(e.getKey().toLowerCase(java.util.Locale.ROOT), id);
			}
		}
		frames = f;
		capes = c;
	}

	/** The store cape texture for this player right now (animated capes cycle frames), or null. */
	public static Object capeFor(String name) {
		if (name == null) return null;
		String id = capes.get(name.toLowerCase(java.util.Locale.ROOT));
		if (id == null) return null;
		int n = frames.getOrDefault(id, 1);
		String file = n > 1 ? id + "_" + (System.currentTimeMillis() / FRAME_MS) % n : id;
		Object t = textures.get(file);
		if (t == null) {
			load(file);
			// While an animation frame downloads, keep showing frame 0 if it is ready.
			Object first = n > 1 ? textures.get(id + "_0") : null;
			return first != null && first != LOADING && first != MISSING ? first : null;
		}
		return t == LOADING || t == MISSING ? null : t;
	}

	private static void load(String file) {
		if (!fetching.add(file)) return;
		textures.put(file, LOADING);
		Thread t = new Thread(() -> {
			byte[] png = null;
			try {
				png = get(ASSETS + file + ".png");
				// Halloween/winter and other old shop capes are intentionally retained for
				// players who bought them, but those PNGs only exist on the legacy host.
				if (png == null) png = get(LEGACY + file + ".png");
			} catch (Exception ignored) {
			}
			final byte[] data = png;
			try {
				Minecraft.getInstance().execute(() -> register(file, data));
			} catch (Exception e) {
				textures.put(file, MISSING);
				fetching.remove(file);
			}
		}, "Xion-Store-Tex");
		t.setDaemon(true);
		t.start();
	}

	private static void register(String file, byte[] png) {
		try {
			if (png == null) {
				textures.put(file, MISSING);
				return;
			}
			try (InputStream in = new ByteArrayInputStream(png)) {
				NativeImage img = NativeImage.read(in);
				//#if MC >= 12105
				DynamicTexture tex = new DynamicTexture(() -> "xion_store_cape_" + file, img);
				//#else
				DynamicTexture tex = new DynamicTexture(img);
				//#endif
				Object id = Ids.of("xionclient", "dynamic/store_cape/" + file);
				Minecraft.getInstance().getTextureManager().register(Ids.cast(id), tex);
				textures.put(file, id);
			}
		} catch (Exception e) {
			textures.put(file, MISSING);
		} finally {
			fetching.remove(file);
		}
	}

	private static byte[] get(String url) throws Exception {
		HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
		c.setConnectTimeout(6000);
		c.setReadTimeout(8000);
		c.setRequestProperty("User-Agent", "XionClient");
		try {
			if (c.getResponseCode() != 200) return null;
			try (InputStream in = c.getInputStream()) {
				return in.readAllBytes();
			}
		} finally {
			c.disconnect();
		}
	}
}
