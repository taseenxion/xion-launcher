package net.xion.client.ui;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModDependency;
import net.fabricmc.loader.api.metadata.ModMetadata;
import net.minecraft.client.gui.screens.Screen;
import net.xion.client.compat.Colors;
import net.xion.client.compat.Compat;
import net.xion.client.compat.Gfx;
import net.xion.client.feature.ModToggles;
import net.xion.client.feature.PackLogos;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Mods page of the Xion menu.
 *
 * The grid is split into sections: XION MODS (the mods Xion Launcher itself installs) and YOUR
 * MODS (everything the player added). Cards carry Xion's own hand-drawn glyph instead of each
 * mod's logo, the mod name and version, a Config button, and an Enabled/Disabled pill. Cards
 * slide in one after another, the glyph pops in once its card has landed and floats gently.
 * Switching a mod applies on the next launch (see ModToggles).
 */
final class ModsPanel {
	enum Click { NONE, HANDLED, FILTER, XION }

	enum Filter { ALL, PACK, ADDED }

	private static final int CARD_H = 62;
	private static final int GAP = 6;
	private static final int CHIPS_H = 20;
	private static final int HEAD_H = 20;
	private static final int ICON = 26;
	private static final int PAD = 8;
	/** Never switched off from here: the client itself and what every profile needs. */
	private static final Set<String> CORE = Set.of("xionclient", "fabric-api", "fabric-language-kotlin");

	private static final class Entry {
		String id, name, version;
		ModContainer container; // null for a disabled jar
		Path jar;               // set for a disabled jar
		boolean loaded, pre, xion;
		String lockedBy;        // non-null: can't be switched off
		Function<Screen, Screen> config;
	}

	/** One titled run of cards: the Xion pack, then the player's own mods. */
	private static final class Block {
		final String title;
		final List<Entry> entries;

		Block(String title, List<Entry> entries) {
			this.title = title;
			this.entries = entries;
		}
	}

	private final List<Entry> all = new ArrayList<>();
	private Filter filter = Filter.ALL;
	private long openedAt = System.currentTimeMillis();
	private int loadedCount;

	ModsPanel(Map<String, Function<Screen, Screen>> configs) {
		scan(configs);
	}

	/** Replays the entrance animation (when the tab is opened). */
	void restart() {
		openedAt = System.currentTimeMillis();
	}

	int loadedCount() {
		return loadedCount;
	}

	// ---- data ----

	private void scan(Map<String, Function<Screen, Screen>> configs) {
		Map<String, Set<String>> neededBy = new HashMap<>();
		Set<String> loadedIds = new HashSet<>();
		for (ModContainer m : FabricLoader.getInstance().getAllMods()) {
			ModMetadata meta = m.getMetadata();
			String id = meta.getId();
			loadedIds.add(id);
			if (hidden(id) || m.getContainingMod().isPresent()) continue;
			Entry e = new Entry();
			e.id = id;
			e.name = meta.getName();
			e.version = meta.getVersion().getFriendlyString();
			e.container = m;
			e.loaded = true;
			e.xion = id.equals("xionclient");
			e.pre = e.xion || PackLogos.isPreinstalled(m);
			e.config = configs.get(id);
			all.add(e);
			try {
				for (ModDependency d : meta.getDependencies()) {
					if (d.getKind() == ModDependency.Kind.DEPENDS) {
						neededBy.computeIfAbsent(d.getModId(), k -> new LinkedHashSet<>()).add(meta.getName());
					}
				}
			} catch (Exception | LinkageError ignored) {
			}
		}
		loadedCount = all.size();
		for (Entry e : all) {
			if (CORE.contains(e.id)) e.lockedBy = e.xion ? "Xion Client" : "Every profile";
			else if (neededBy.containsKey(e.id)) {
				Set<String> by = neededBy.get(e.id);
				by.remove(e.name);
				if (!by.isEmpty()) e.lockedBy = "Needed by " + by.iterator().next() + (by.size() > 1 ? " +" + (by.size() - 1) : "");
			}
		}
		scanDisabled(loadedIds);
		all.sort(Comparator.comparing((Entry e) -> !e.xion).thenComparing(e -> !e.pre).thenComparing(e -> e.name.toLowerCase()));
	}

	private static boolean hidden(String id) {
		return id.equals("java") || id.equals("minecraft") || id.equals("fabricloader") || id.startsWith("mixinextras")
			|| (id.startsWith("fabric-") && !id.equals("fabric-api") && !id.equals("fabric-language-kotlin"));
	}

	/** Jars switched off earlier (mods/*.jar.disabled), so they can be switched back on. */
	private void scanDisabled(Set<String> loadedIds) {
		Path dir = PackLogos.modsDir();
		if (!Files.isDirectory(dir)) return;
		try (Stream<Path> files = Files.list(dir)) {
			files.filter(p -> p.getFileName().toString().endsWith(".jar.disabled")).forEach(p -> {
				JsonObject meta = readMeta(p);
				if (meta == null || !meta.has("id")) return;
				String id = meta.get("id").getAsString();
				if (loadedIds.contains(id) || hidden(id)) return;
				Entry e = new Entry();
				e.id = id;
				e.name = meta.has("name") ? meta.get("name").getAsString() : id;
				e.version = meta.has("version") ? meta.get("version").getAsString() : "";
				e.jar = p;
				e.loaded = false;
				e.pre = PackLogos.isManagedJar(p.getFileName().toString());
				all.add(e);
			});
		} catch (Exception ignored) {
		}
	}

	private static JsonObject readMeta(Path jar) {
		try (ZipFile z = new ZipFile(jar.toFile())) {
			ZipEntry en = z.getEntry("fabric.mod.json");
			if (en == null) return null;
			try (InputStream in = z.getInputStream(en)) {
				String text = new String(in.readAllBytes(), StandardCharsets.UTF_8).replaceAll("[\\u0000-\\u001f]+", " ");
				JsonElement el = JsonParser.parseString(text);
				return el.isJsonObject() ? el.getAsJsonObject() : null;
			}
		} catch (Exception e) {
			return null;
		}
	}

	/** The card glyph for a mod: Xion's own art, picked from what the mod does. */
	private static String kind(Entry e) {
		String id = e.id.toLowerCase();
		if (e.xion) return ModIcons.XION;
		if (id.contains("sodium") || id.contains("lithium") || id.contains("krypton") || id.contains("starlight")
			|| id.contains("ferrite") || id.contains("c2me") || id.contains("noisium") || id.contains("indium")
			|| id.contains("memoryleakfix") || id.contains("threadtweak") || id.contains("moreculling")
			|| id.contains("badoptimizations") || id.contains("modernfix") || id.contains("performance")) {
			return ModIcons.BARS;
		}
		if (id.contains("iris") || id.contains("oculus") || id.contains("continuity") || id.contains("entitytexture")
			|| id.contains("animatica") || id.contains("polytone") || id.contains("shader") || id.contains("visual")) {
			return ModIcons.LENS;
		}
		if (id.contains("modmenu") || id.contains("cloth") || id.contains("yacl") || id.contains("architectury")
			|| id.contains("config") || id.contains("owo")) {
			return ModIcons.GRID;
		}
		if (id.contains("kotlin") || id.contains("language") || id.contains("api") || id.contains("annotation")) {
			return ModIcons.CODE;
		}
		return ModIcons.CUBE;
	}

	private List<Block> blocks() {
		List<Entry> xion = new ArrayList<>(), added = new ArrayList<>();
		for (Entry e : all) (e.pre ? xion : added).add(e);
		List<Block> out = new ArrayList<>();
		if (filter != Filter.ADDED && !xion.isEmpty()) out.add(new Block("XION MODS", xion));
		if (filter != Filter.PACK && !added.isEmpty()) out.add(new Block("YOUR MODS", added));
		return out;
	}

	private int count(Filter f) {
		if (f == Filter.ALL) return all.size();
		int n = 0;
		for (Entry e : all) if (f == Filter.PACK ? e.pre : !e.pre) n++;
		return n;
	}

	// ---- layout ----

	private static int cols(int w) {
		return w >= 300 ? 2 : 1;
	}

	private static int cardW(int w) {
		int c = cols(w);
		return (w - (c - 1) * GAP) / c;
	}

	int height(int w) {
		int c = cols(w);
		int total = CHIPS_H;
		for (Block b : blocks()) {
			total += HEAD_H + ((b.entries.size() + c - 1) / c) * (CARD_H + GAP);
		}
		return total + 2;
	}

	private String chipLabel(Filter f) {
		String name = f == Filter.ALL ? "All" : f == Filter.PACK ? "Xion" : "Added";
		return name + "  " + count(f);
	}

	// ---- drawing ----

	void draw(Gfx g, int x, int y, int w, int h, double scroll, int mx, int my, float a) {
		long now = System.currentTimeMillis();
		float t = now / 1000f;

		int chipY = y - (int) scroll;
		if (chipY >= y - 1) {
			int cx = x;
			for (Filter f : Filter.values()) {
				String label = chipLabel(f);
				int cw = g.font.width(label) + 14;
				boolean sel = f == filter;
				boolean hov = mx >= cx && mx < cx + cw && my >= chipY && my < chipY + 14;
				g.pill(cx, chipY, cw, 14, Colors.alpha(sel ? Colors.lerp(Colors.CARD, Colors.ACCENT, 0.22f) : hov ? Colors.CARD_HOVER : Colors.CARD, a));
				g.pillOutline(cx, chipY, cw, 14, sel ? Colors.alpha(Colors.ACCENT, 0.7f * a) : Colors.alpha(0x14FFFFFF, a));
				g.text(label, cx + 7, chipY + 3, Colors.alpha(sel ? Colors.ACCENT : hov ? Colors.TEXT : Colors.MUTED, a), false);
				cx += cw + 5;
			}
		}

		int c = cols(w), cw = cardW(w);
		int iy = y + CHIPS_H - (int) scroll;
		int index = 0;
		for (Block b : blocks()) {
			if (iy + HEAD_H > y - 1 && iy < y + h + 1) header(g, b, x, iy, w, a);
			iy += HEAD_H;
			for (int i = 0; i < b.entries.size(); i++) {
				int cx = x + (i % c) * (cw + GAP);
				int cy = iy + (i / c) * (CARD_H + GAP);
				if (cy + CARD_H > y - 1 && cy < y + h + 1) {
					card(g, b.entries.get(i), cx, cy, cw, index, now, t, mx, my, a);
				}
				index++;
			}
			iy += ((b.entries.size() + c - 1) / c) * (CARD_H + GAP);
		}
	}

	/** Section title: accent label, hairline rule, count on the right. */
	private void header(Gfx g, Block b, int x, int y, int w, float a) {
		String label = b.title;
		String n = b.entries.size() + (b.entries.size() == 1 ? " mod" : " mods");
		int nw = g.font.width(n);
		g.text(label, x, y + 4, Colors.alpha(Colors.ACCENT, a), false);
		int tw = g.font.width(label);
		g.fill(x + tw + 8, y + 8, x + w - nw - 8, y + 9, Colors.alpha(Colors.lerp(Colors.CARD, Colors.ACCENT, 0.18f), a));
		g.text(n, x + w - nw, y + 4, Colors.alpha(Colors.MUTED, a), false);
	}

	private void card(Gfx g, Entry e, int cx, int cy, int cw, int index, long now, float t, int mx, int my, float a) {
		// Entrance: cards slide in from the left and fade, one after another.
		float p = Math.max(0f, Math.min(1f, (now - openedAt - index * 26L) / 300f));
		float ease = 1f - (1f - p) * (1f - p) * (1f - p);
		if (ease <= 0f) return;
		float ca = a * ease;
		int dx = Math.round((1f - ease) * 18f);
		int dy = Math.round((1f - ease) * 8f);
		// The glyph pops in a moment after its card has landed.
		float pop = Math.max(0f, Math.min(1f, (now - openedAt - index * 26L - 120L) / 280f));
		pop = 1f - (1f - pop) * (1f - pop);

		g.push();
		g.translate(dx, 0);
		int top = cy + dy;
		boolean hov = ease >= 1f && mx - dx >= cx && mx - dx < cx + cw && my >= top && my < top + CARD_H;

		boolean on = ModToggles.wanted(e.id, e.loaded);
		boolean pending = ModToggles.pending(e.id, e.loaded);
		boolean locked = e.lockedBy != null;

		// Card
		g.pill(cx, top, cw, CARD_H, Colors.alpha(hov ? Colors.CARD_HOVER : Colors.CARD, ca));
		g.vGradient(cx + 2, top + 1, cw - 4, 18, Colors.alpha(hov ? 0x18FFFFFF : 0x0CFFFFFF, ca), 0x00FFFFFF);
		int outline = hov ? Colors.alpha(Colors.ACCENT, 0.55f * ca)
			: pending ? Colors.alpha(Colors.ACCENT, (0.30f + 0.25f * pulse(t, 0)) * ca)
			: on && e.pre ? Colors.alpha(Colors.ACCENT, 0.18f * ca)
			: Colors.alpha(0x14FFFFFF, ca);
		g.pillOutline(cx, top, cw, CARD_H, outline);

		// Name and version
		String ver = e.version == null || e.version.isEmpty() ? "" : e.version;
		int verW = Math.min(g.font.width(ver), 38);
		String verFit = g.font.plainSubstrByWidth(ver, 38);
		int nameW = cw - PAD * 2 - (verFit.isEmpty() ? 0 : verW + 8);
		g.text(g.font.plainSubstrByWidth(e.name, nameW), cx + PAD, top + 7, Colors.alpha(on ? Colors.TEXT : Colors.MUTED, ca), false);
		if (!verFit.isEmpty()) g.text(verFit, cx + cw - PAD - g.font.width(verFit), top + 7, Colors.alpha(Colors.MUTED, ca), false);

		// Glyph: Xion's own art, centred, bobbing gently, grown on hover.
		int gy = top + 30;
		int size = Math.round(ICON * (0.55f + 0.45f * pop)) + (hov ? 2 : 0);
		int bob = Math.round((float) Math.sin(t * 2.0f + index * 0.7f) * 1.4f);
		if (hov) {
			g.rounded(cx + cw / 2 - 17, gy - 17 + bob, 34, 34, Colors.alpha(Colors.ACCENT, 0.09f * ca));
		}
		int iconColor = on ? (hov ? 0xFFFFFFFF : Colors.TEXT) : Colors.lerp(Colors.MUTED, Colors.CARD, 0.25f);
		ModIcons.draw(g, kind(e), cx + cw / 2, gy + bob, size, Colors.alpha(iconColor, ca * pop));

		// Footer: Config button, then the Enabled/Disabled pill.
		int fy = top + CARD_H - 18;
		boolean hasGear = e.config != null || e.xion;
		int bx = cx + PAD;
		if (hasGear) {
			boolean gh = hov && mx - dx >= bx && mx - dx < bx + 14 && my >= fy && my < fy + 14;
			g.pill(bx, fy, 14, 14, Colors.alpha(gh ? Colors.lerp(Colors.CARD_HOVER, Colors.ACCENT, 0.4f) : 0xFF1E2430, ca));
			g.centeredText("⚙", bx + 7f, fy + 3f, 1f, Colors.alpha(gh ? Colors.TEXT : Colors.lerp(Colors.MUTED, Colors.ACCENT, 0.45f), ca), false);
		}
		int pillX = hasGear ? bx + 18 : cx + PAD;
		int pillW = cx + cw - PAD - pillX;

		String label;
		int pillBg, pillFg;
		if (pending) {
			label = on ? "Turns off next launch" : "Turns on next launch";
			pillBg = Colors.alpha(Colors.ACCENT, 0.16f * ca);
			pillFg = Colors.alpha(Colors.ACCENT, (0.7f + 0.3f * pulse(t, 0)) * ca);
		} else if (locked) {
			label = "Required";
			pillBg = Colors.alpha(0xFF1E2430, ca);
			pillFg = Colors.alpha(Colors.MUTED, ca);
		} else if (on) {
			label = "Enabled";
			pillBg = Colors.alpha(Colors.OK, 0.16f * ca);
			pillFg = Colors.alpha(Colors.OK, ca);
		} else {
			label = "Disabled";
			pillBg = Colors.alpha(0xFF1E2430, ca);
			pillFg = Colors.alpha(Colors.MUTED, ca);
		}
		g.pill(pillX, fy, pillW, 14, pillBg);
		if (pending) g.pillOutline(pillX, fy, pillW, 14, Colors.alpha(Colors.ACCENT, 0.4f * ca));
				g.centeredText(g.font.plainSubstrByWidth(label, pillW - 8), pillX + pillW / 2f, fy + 3f, 1f, pillFg, false);
		g.pop();
	}

	/** Bottom-left status line of the menu. */
	void footer(Gfx g, int x, int y, float a) {
		int changes = ModToggles.pendingCount();
		if (changes > 0) {
			float t = System.currentTimeMillis() / 1000f;
			String s = "↻ " + changes + (changes == 1 ? " change" : " changes") + " — restart the game to apply";
			g.text(s, x, y, Colors.alpha(Colors.ACCENT, (0.7f + 0.3f * pulse(t, 0)) * a), false);
		} else {
			int pre = count(Filter.PACK);
			g.text(all.size() + " mods  ·  " + pre + " from Xion", x, y, Colors.alpha(Colors.MUTED, a), false);
		}
	}

	private static float pulse(float t, int phase) {
		return (float) (Math.sin(t * 3.0 + phase * 0.6) + 1) / 2f;
	}

	// ---- input ----

	Click click(double mx, double my, int x, int y, int w, int h, double scroll, Screen parent) {
		if (mx < x || mx >= x + w || my < y || my >= y + h) return Click.NONE;
		int chipY = y - (int) scroll;
		if (my >= chipY && my < chipY + 14) {
			int cx = x;
			for (Filter f : Filter.values()) {
				int cw = net.minecraft.client.Minecraft.getInstance().font.width(chipLabel(f)) + 14;
				if (mx >= cx && mx < cx + cw) {
					if (filter != f) {
						filter = f;
						restart();
					}
					Compat.click();
					return Click.FILTER;
				}
				cx += cw + 5;
			}
			return Click.NONE;
		}

		int c = cols(w), cw = cardW(w);
		int iy = y + CHIPS_H - (int) scroll;
		for (Block b : blocks()) {
			iy += HEAD_H;
			for (int i = 0; i < b.entries.size(); i++) {
				int cx = x + (i % c) * (cw + GAP);
				int cy = iy + (i / c) * (CARD_H + GAP);
				if (mx >= cx && mx < cx + cw && my >= cy && my < cy + CARD_H) {
					Entry e = b.entries.get(i);
					boolean hasGear = e.config != null || e.xion;
					int fy = cy + CARD_H - 18;
					int bx = cx + PAD;
					if (hasGear && mx >= bx && mx < bx + 14 && my >= fy && my < fy + 14) return openConfig(e, parent);
					Compat.click();
					if (e.lockedBy == null) ModToggles.set(e.id, !ModToggles.wanted(e.id, e.loaded), e.loaded);
					return Click.HANDLED;
				}
			}
			iy += ((b.entries.size() + c - 1) / c) * (CARD_H + GAP);
		}
		return Click.NONE;
	}

	private Click openConfig(Entry e, Screen parent) {
		Compat.click();
		if (e.xion) return Click.XION;
		try {
			Screen sc = e.config.apply(parent);
			if (sc != null) Compat.setScreen(sc);
		} catch (Exception | LinkageError ex) {
			System.out.println("[Xion] Could not open config: " + ex);
		}
		return Click.HANDLED;
	}
}
