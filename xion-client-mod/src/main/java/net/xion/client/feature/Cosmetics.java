package net.xion.client.feature;

import com.google.gson.Gson;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.xion.client.XionConfig;
import net.xion.client.compat.Ids;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Xion capes. The set (capes.json + standard/HD PNG frames) ships with Xion Launcher,
 * which tells us its folder. Capes are shown on your own player and used for your elytra wings; like the
 * custom skin, only you see them. Free capes work for everyone, the rest need Xion+.
 */
public final class Cosmetics {
	public static final class Cape {
		public String id = "";
		public String name = "";
		public String cat = "";
		public String tier = "free";
		public int frames = 1;
		public int frameMs = 110;
		public int texWidth = 256, texHeight = 128;
		public boolean preview = false;
		public int previewWidth = 80, previewHeight = 128;

		public boolean pro() {
			return "pro".equals(tier);
		}

		public boolean usable() {
			return !pro() || Premium.active() || Premium.ownsCape(id);
		}
	}

	/** Texture size and where the outer face sits in it (4x the vanilla 64x32 layout). */
	public static final int TEX_W = 256, TEX_H = 128, FACE_U = 4, FACE_V = 4, FACE_W = 40, FACE_H = 64;
	private static final Object MISSING = new Object();
	private static final Object LOADING = new Object();

	private static List<Cape> capes;
	private static final Map<String, Object> textures = new ConcurrentHashMap<>();
	private static volatile String activeHd = "";
	private static Object lastHd;
	private static final ExecutorService LOADER = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "Xion-HD-Capes"); t.setDaemon(true); t.setPriority(Thread.MIN_PRIORITY); return t;
	});

	private Cosmetics() {}

	public static List<Cape> capes() {
		if (capes == null) {
			capes = new ArrayList<>();
			try {
				Path f = dir().resolve("capes.json");
				if (Files.isRegularFile(f)) capes.addAll(Arrays.asList(new Gson().fromJson(Files.readString(f), Cape[].class)));
			} catch (Exception e) {
				System.out.println("[Xion] Could not read capes: " + e);
			}
		}
		return capes;
	}

	private static Path dir() {
		String d = XionConfig.launcher.capesDir;
		return Path.of(d == null ? "" : d);
	}

	/** Id of the picked cape; a newer pick in the launcher replaces the in-game one. */
	public static String selectedId() {
		if (XionConfig.launcher.capeRev != XionConfig.data.capeRev) {
			XionConfig.data.cape = XionConfig.launcher.cape == null ? "" : XionConfig.launcher.cape;
			XionConfig.data.capeRev = XionConfig.launcher.capeRev;
			XionConfig.save();
		}
		String id = XionConfig.data.cape == null ? "" : XionConfig.data.cape;
		// Old wings/aura store capes are not part of the launcher set. Drop one if it is still saved,
		// otherwise it stays "worn" forever and hides every new cape.
		if (!id.isEmpty() && !capes().isEmpty() && find(id) == null) {
			XionConfig.data.cape = "";
			XionConfig.save();
			return "";
		}
		return id;
	}

	public static void select(String id) {
		XionConfig.data.cape = id;
		XionConfig.save();
	}

	public static Cape find(String id) {
		for (Cape c : capes()) if (c.id.equals(id)) return c;
		return null;
	}

	/** The cape to wear right now (null when none, or a Xion+ cape without Xion+). */
	public static Cape worn() {
		Cape c = find(selectedId());
		return c != null && c.usable() ? c : null;
	}

	/** Texture of the worn cape for this moment (animated capes cycle their frames), or null. */
	public static Object capeTexture() {
		Cape c = worn();
		String next = c != null && c.texWidth > TEX_W ? c.id : "";
		if (!next.equals(activeHd)) {
			String old = activeHd;
			activeHd = next;
			lastHd = null;
			// Keep only the currently worn HD animation in GPU memory. Preview textures are small.
			if (!old.isEmpty()) for (String key : new ArrayList<>(textures.keySet())) {
				if (!key.startsWith(old + "_") || !key.substring(old.length() + 1).matches("\\d+")) continue;
				Object tex = textures.remove(key);
				if (ready(tex)) Minecraft.getInstance().getTextureManager().release(Ids.cast(tex));
			}
		}
		return c == null ? null : texture(c);
	}

	public static Object texture(Cape c) {
		String file = c.frames > 1 ? c.id + "_" + CapeFrames.at(System.currentTimeMillis(), c.frames, c.frameMs) : c.id;
		if (c.texWidth > TEX_W) {
			Object tex = textures.get(file);
			if (tex == null) loadHd(c.id, file);
			return ready(tex) ? tex : lastHd;
		}
		Object t = textures.computeIfAbsent(file, Cosmetics::load);
		return t == MISSING ? null : t;
	}

	public static Object previewTexture(Cape c) {
		if (!c.preview) return texture(c);
		String file = c.id + "_preview_" + CapeFrames.at(System.currentTimeMillis(), c.frames, c.frameMs);
		Object t = textures.computeIfAbsent(file, Cosmetics::load);
		return t == MISSING ? null : t;
	}

	private static boolean ready(Object texture) {
		return texture != null && texture != MISSING && texture != LOADING;
	}

	private static void loadHd(String owner, String file) {
		if (textures.putIfAbsent(file, LOADING) != null) return;
		LOADER.execute(() -> {
			try (InputStream in = Files.newInputStream(dir().resolve(file + ".png"))) {
				NativeImage image = NativeImage.read(in);
				try { Minecraft.getInstance().execute(() -> {
					if (!owner.equals(activeHd)) { image.close(); textures.remove(file, LOADING); return; }
					Object texture = register(file, image);
					textures.put(file, texture);
					if (ready(texture)) lastHd = texture;
				}); } catch (Exception e) { image.close(); throw e; }
			} catch (Exception e) { textures.put(file, MISSING); }
		});
	}

	private static Object load(String file) {
		Path p = dir().resolve(file + ".png");
		if (!Files.isRegularFile(p)) return MISSING;
		try (InputStream in = Files.newInputStream(p)) {
			NativeImage img = NativeImage.read(in);
			return register(file, img);
		} catch (Exception e) {
			return MISSING;
		}
	}

	private static Object register(String file, NativeImage img) {
		try {
			//#if MC >= 12105
			DynamicTexture tex = new DynamicTexture(() -> "xion_cape_" + file, img);
			//#else
			DynamicTexture tex = new DynamicTexture(img);
			//#endif
			Object id = Ids.of("xionclient", "dynamic/cape/" + file);
			Minecraft.getInstance().getTextureManager().register(Ids.cast(id), tex);
			return id;
		} catch (Exception e) {
			img.close();
			return MISSING;
		}
	}
}
