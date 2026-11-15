package net.xion.client.ui;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.xion.client.compat.Ids;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Real mod logos for the Mods page. Each card shows the icon the mod declares in fabric.mod.json
 * ("icon" is either a path or a size map, which Fabric's metadata resolves for us); a mod that
 * ships none falls back to its conventional assets/&lt;modid&gt;/icon.png and then to the hand-drawn
 * glyph. Textures load lazily on first draw (the draw thread is the render thread) and are cached
 * per jar.
 */
final class ModLogos {
	private static final Logo MISSING = new Logo(null, 0, 0);
	private static final Map<String, Logo> cache = new HashMap<>();

	/** A registered logo texture plus its pixel size, so it can be drawn aspect-correct. */
	record Logo(Object texture, int width, int height) {}

	private ModLogos() {}

	/**
	 * Logo for a mod, or null when the jar has none.
	 *
	 * @param root  the mod's own folder (an extracted directory in dev, the jar file in game)
	 * @param icon  the icon path declared in fabric.mod.json, or null for the conventional location
	 * @param modId used for the conventional assets/&lt;modid&gt;/icon.png fallback
	 */
	static Logo get(Path root, String icon, String modId) {
		if (root == null) return null;
		if (icon == null || icon.isEmpty()) icon = "assets/" + modId + "/icon.png";
		String key = root + "|" + icon;
		Logo t = cache.get(key);
		if (t == null) {
			t = load(root, icon, key);
			cache.put(key, t);
		}
		return t.texture() == null ? null : t;
	}

	private static Logo load(Path root, String icon, String key) {
		byte[] png = read(root, icon);
		if (png == null) return MISSING;
		try {
			NativeImage img;
			try (InputStream in = new ByteArrayInputStream(png)) {
				img = NativeImage.read(in);
			}
			//#if MC >= 12105
			DynamicTexture tex = new DynamicTexture(() -> "xion_modlogo_" + key, img);
			//#else
			DynamicTexture tex = new DynamicTexture(img);
			//#endif
			Object id = Ids.of("xionclient", "dynamic/modlogo/" + Integer.toHexString(key.hashCode()));
			Minecraft.getInstance().getTextureManager().register(Ids.cast(id), tex);
			return new Logo(id, img.getWidth(), img.getHeight());
		} catch (Exception e) {
			return MISSING;
		}
	}

	/** Reads a file from a folder (dev) or from inside a jar (installed), or null. */
	private static byte[] read(Path root, String icon) {
		try {
			if (Files.isDirectory(root)) {
				Path p = root.resolve(icon);
				return Files.isRegularFile(p) ? Files.readAllBytes(p) : null;
			}
			try (ZipFile z = new ZipFile(root.toFile())) {
				ZipEntry e = z.getEntry(icon);
				if (e == null) return null;
				try (InputStream in = z.getInputStream(e)) {
					return in.readAllBytes();
				}
			}
		} catch (Exception e) {
			return null;
		}
	}
}
