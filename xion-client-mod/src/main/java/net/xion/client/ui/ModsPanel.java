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
import net.xion.client.compat.Ids;

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
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Modern mod library: a pinned search/filter toolbar, readable icon-led cards and explicit controls.
 * Only visible cards render; filtered lists and textures are cached. Clicking a card no longer
 * accidentally disables a mod, and config screens open on release rather than inheriting the click.
 */
final class ModsPanel {
	enum Click { NONE, HANDLED, FILTER, XION }

	enum Filter { ALL, PACK, ADDED, CHANGES }
	private static final int CARD_H = ModsLayout.CARD, GAP = ModsLayout.GAP;
	/** Never switched off from here: the client itself and what every profile needs. */
	private static final Set<String> CORE = Set.of("xionclient", "fabric-api", "fabric-language-kotlin");

	private static final class Entry {
		String id, name, version, description = "", authors = "", search = "";
		ModContainer container; // null for a disabled jar
		Path jar;               // set for a disabled jar
		Path root;              // mod folder (dev) or jar file (game), for reading the logo
		String icon;            // icon path declared in fabric.mod.json, or null
		boolean loaded, pre, xion;
		String lockedBy;        // non-null: can't be switched off
		Function<Screen, Screen> config;
		float hover, switchAmount;
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
	private final SearchInput search = new SearchInput();
	private boolean searchFocused;
	private double smoothScroll;
	private long lastFrame;
	private List<Block> view = List.of();
	private Filter viewFilter;
	private String viewQuery;
	private int viewRevision = -1;
	private final List<Hit> hits = new ArrayList<>();
	private Entry hovered, selected, pressed;
	private ModsLayout.Rect pressedRect;
	private int pressedAction;
	private record Hit(Entry entry, ModsLayout.Controls controls) {}

	ModsPanel(Map<String, Function<Screen, Screen>> configs) {
		scan(configs);
	}

	/** Replays the entrance animation (when the tab is opened). */
	void restart() {
		openedAt = System.currentTimeMillis();
		smoothScroll = 0;
		lastFrame = 0;
		pressed = null;
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
			e.description = clean(meta.getDescription());
			e.authors = meta.getAuthors().stream().map(a -> a.getName()).collect(java.util.stream.Collectors.joining(", "));
			e.container = m;
			e.loaded = true;
			e.switchAmount = 1f;
			e.xion = id.equals("xionclient");
			e.pre = e.xion || PackLogos.isPreinstalled(m);
			e.config = configs.get(id);
			try {
				if (!m.getRootPaths().isEmpty()) e.root = m.getRootPaths().get(0);
			} catch (Exception | LinkageError ignored) {
			}
			try {
				e.icon = meta.getIconPath(64).orElse(null);
			} catch (Exception | LinkageError ignored) {
			}
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
		for (Entry e : all) e.search = (e.id + " " + e.name + " " + e.description + " " + e.authors).toLowerCase(Locale.ROOT);
		all.sort(Comparator.comparing((Entry e) -> !e.xion).thenComparing(e -> !e.pre).thenComparing(e -> e.name.toLowerCase(Locale.ROOT)));
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
				e.description = meta.has("description") && meta.get("description").isJsonPrimitive() ? clean(meta.get("description").getAsString()) : "";
				e.jar = p;
				e.root = p;
				e.icon = iconFromMeta(meta);
				e.loaded = false;
				e.pre = PackLogos.isManagedJar(p.getFileName().toString());
				all.add(e);
			});
		} catch (Exception ignored) {
		}
	}

	/** The icon path a fabric.mod.json declares: a plain path, or the biggest of its size map. */
	private static String iconFromMeta(JsonObject meta) {
		JsonElement ic = meta.get("icon");
		if (ic == null) return null;
		if (ic.isJsonPrimitive()) return ic.getAsString();
		if (ic.isJsonObject()) {
			String best = null;
			int bestSize = -1;
			for (Map.Entry<String, JsonElement> e : ic.getAsJsonObject().entrySet()) {
				int size = 0;
				try {
					size = Integer.parseInt(e.getKey().trim());
				} catch (NumberFormatException ignored) {
				}
				if (size >= bestSize && e.getValue().isJsonPrimitive()) {
					bestSize = size;
					best = e.getValue().getAsString();
				}
			}
			return best;
		}
		return null;
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

	/** The fallback glyph for a mod without a logo: Xion's own art, picked from what the mod does. */
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
		int revision = ModToggles.revision();
		if (filter == viewFilter && search.value().equals(viewQuery) && revision == viewRevision) return view;
		viewFilter = filter;
		viewQuery = search.value();
		viewRevision = revision;
		String query = search.value().trim().toLowerCase(Locale.ROOT);
		List<Entry> xion = new ArrayList<>(), added = new ArrayList<>();
		for (Entry e : all) {
			if (!query.isEmpty() && !e.search.contains(query)) continue;
			if (filter == Filter.CHANGES && !ModToggles.pending(e.id, e.loaded)) continue;
			(e.pre ? xion : added).add(e);
		}
		List<Block> out = new ArrayList<>();
		if (filter != Filter.ADDED && !xion.isEmpty()) out.add(new Block("Xion essentials", xion));
		if (filter != Filter.PACK && !added.isEmpty()) out.add(new Block("Your collection", added));
		return view = out;
	}

	private int count(Filter f) {
		if (f == Filter.ALL) return all.size();
		if (f == Filter.CHANGES) return ModToggles.pendingCount();
		int n = 0;
		for (Entry e : all) if (f == Filter.PACK ? e.pre : !e.pre) n++;
		return n;
	}

	// ---- layout and rendering ----

	int height(int w) {
		int total = ModsLayout.HEADER + ModsLayout.FOOTER;
		for (Block b : blocks()) total += ModsLayout.SECTION + ((b.entries.size() + ModsLayout.columns(w) - 1) / ModsLayout.columns(w)) * (CARD_H + GAP);
		return total;
	}

	void draw(Gfx g, int x, int y, int w, int h, double scroll, int mx, int my, float a) {
		long now = System.currentTimeMillis(), nano = System.nanoTime();
		float dt = lastFrame == 0 ? 0.016f : Math.min(0.05f, (nano - lastFrame) / 1_000_000_000f);
		lastFrame = nano;
		double max = Math.max(0, height(w) - h);
		smoothScroll += (Math.max(0, Math.min(max, scroll)) - smoothScroll) * Math.min(1, dt * 16);
		smoothScroll = Math.max(0, Math.min(max, smoothScroll));
		hits.clear();
		hovered = null;
		int top = y + ModsLayout.HEADER, bottom = y + h - ModsLayout.FOOTER;
		int c = ModsLayout.columns(w), cw = ModsLayout.cardWidth(w), iy = top - (int) Math.round(smoothScroll), index = 0;
		g.scissor(x - 1, top, x + w + 1, Math.max(top, bottom));
		for (Block b : blocks()) {
			if (iy + ModsLayout.SECTION >= top && iy <= bottom) {
				g.text(b.title, x + 1, iy + 7, Colors.alpha(Colors.MUTED, a), false);
				String n = Integer.toString(b.entries.size());
				g.text(n, x + w - g.font.width(n), iy + 7, Colors.alpha(Colors.MUTED, a), false);
			}
			iy += ModsLayout.SECTION;
			for (int i = 0; i < b.entries.size(); i++, index++) {
				int cx = x + (i % c) * (cw + GAP), cy = iy + (i / c) * (CARD_H + GAP);
				if (cy + CARD_H >= top && cy <= bottom) card(g, b.entries.get(i), cx, cy, cw, index, now, dt, mx, my, top, bottom, a);
			}
			iy += ((b.entries.size() + c - 1) / c) * (CARD_H + GAP);
		}
		if (blocks().isEmpty()) {
			g.centeredText("No matching mods", x + w / 2f, top + 26, 1.15f, Colors.alpha(Colors.TEXT, a), false);
			g.centeredText("Try another search or filter", x + w / 2f, top + 43, 0.9f, Colors.alpha(Colors.MUTED, a), false);
		}
		g.endScissor();
		if (max > 0 && bottom > top) {
			int viewH = bottom - top, bodyH = viewH + (int) max;
			int bar = Math.max(16, viewH * viewH / Math.max(1, bodyH));
			int barY = top + (int) ((viewH - bar) * smoothScroll / max);
			g.fill(x + w + 3, top, x + w + 5, bottom, Colors.alpha(0x15FFFFFF, a));
			g.rounded(x + w + 3, barY, 2, bar, Colors.alpha(Colors.ACCENT, 0.75f * a));
		}
		toolbar(g, x, y, w, mx, my, a, now);
		g.fill(x, bottom, x + w, bottom + 1, Colors.alpha(0x15FFFFFF, a));
		int changes = ModToggles.pendingCount();
		Entry info = hovered != null ? hovered : selected;
		String note = info != null ? info.name + " · " + (info.lockedBy != null ? info.lockedBy : info.description.isEmpty() ? info.id : info.description)
			: changes > 0 ? "↻ " + changes + " changes · restart Minecraft to apply" : "Click a switch to enable · Settings to configure · Ctrl+F to search";
		g.text(fit(g, note, w - 2), x + 1, bottom + 8, Colors.alpha(changes > 0 && info == null ? Colors.GOLD : Colors.MUTED, a), false);
	}

	private void toolbar(Gfx g, int x, int y, int w, int mx, int my, float a, long now) {
		g.scaledText("Mod library", x, y + 2, 1.35f, Colors.alpha(Colors.TEXT, a), false);
		String count = all.size() + " installed";
		g.text(count, x + w - g.font.width(count), y + 6, Colors.alpha(Colors.MUTED, a), false);
		ModsLayout.Rect r = new ModsLayout.Rect(x, y + 26, w, 24);
		g.pill(r.x(), r.y(), r.w(), r.h(), Colors.alpha(searchFocused ? 0xFF121214 : 0xFF0C0C0E, a));
		g.pillOutline(r.x(), r.y(), r.w(), r.h(), Colors.alpha(searchFocused ? 0x80ECE7DF : Colors.LINE_2, a));
		// Magnifier, sized for Minecraft's pixel grid.
		g.pillOutline(x + 9, y + 33, 7, 7, Colors.alpha(Colors.MUTED, a));
		g.fill(x + 15, y + 39, x + 18, y + 40, Colors.alpha(Colors.MUTED, a));
		g.fill(x + 17, y + 40, x + 18, y + 42, Colors.alpha(Colors.MUTED, a));
		int tx = x + 25, tw = Math.max(20, w - 51), start = 0;
		while (start < search.cursor() && g.font.width(search.value().substring(start, search.cursor())) > tw - 2) start = search.value().offsetByCodePoints(start, 1);
		g.scissor(tx, y + 30, tx + tw, y + 47);
		if (search.value().isEmpty()) g.text(fit(g, "Search mods…", tw), tx, y + 34, Colors.alpha(Colors.MUTED, a), false);
		else {
			if (searchFocused && search.selected()) {
				int sx = tx + g.font.width(search.value().substring(start, Math.max(start, search.start())));
				int ex = tx + g.font.width(search.value().substring(start, Math.max(start, search.end())));
				g.fill(sx, y + 32, ex, y + 44, Colors.alpha(Colors.ACCENT, 0.28f * a));
			}
			g.text(search.value().substring(start), tx, y + 34, Colors.alpha(Colors.TEXT, a), false);
		}
		if (searchFocused && (now / 500) % 2 == 0) {
			int caret = tx + g.font.width(search.value().substring(start, search.cursor()));
			g.fill(caret, y + 32, caret + 1, y + 44, Colors.alpha(Colors.ACCENT, a));
		}
		g.endScissor();
		if (!search.value().isEmpty()) g.text("×", x + w - 16, y + 34, Colors.alpha(Colors.MUTED, a), false);
		int chipW = (w - 3 * 5) / 4;
		for (Filter f : Filter.values()) {
			int cx = x + f.ordinal() * (chipW + 5), cy = y + 58;
			boolean on = f == filter, over = new ModsLayout.Rect(cx, cy, chipW, 16).contains(mx, my);
			String label = switch (f) { case ALL -> "All"; case PACK -> "Xion"; case ADDED -> "Added"; case CHANGES -> "Changes"; };
			if (w >= 400) label += "  " + count(f);
			g.pill(cx, cy, chipW, 16, Colors.alpha(on ? Colors.PILL : over ? 0xFF17171A : 0xFF0E0E10, a));
			g.pillOutline(cx, cy, chipW, 16, Colors.alpha(on ? Colors.PILL : Colors.LINE_2, a));
			g.centeredText(fit(g, label, chipW - 6), cx + chipW / 2f, cy + 4, 1f, Colors.alpha(on ? Colors.ON_PILL : Colors.MUTED, a), false);
		}
	}

	private void card(Gfx g, Entry e, int x, int y, int w, int index, long now, float dt, int mx, int my, int top, int bottom, float a) {
		float p = Math.max(0, Math.min(1, (now - openedAt - Math.min(index, 8) * 24L) / 280f));
		float enter = 1 - (1 - p) * (1 - p) * (1 - p);
		y += Math.round((1 - enter) * 7);
		float ca = a * enter;
		ModsLayout.Controls controls = ModsLayout.controls(x, y, w);
		boolean over = controls.card().contains(mx, my) && my >= top && my < bottom;
		e.hover += ((over ? 1 : 0) - e.hover) * Math.min(1, dt * 14);
		boolean on = ModToggles.wanted(e.id, e.loaded), pending = ModToggles.pending(e.id, e.loaded), locked = e.lockedBy != null;
		e.switchAmount += ((on ? 1 : 0) - e.switchAmount) * Math.min(1, dt * 18);
		if (enter > 0.75f) hits.add(new Hit(e, controls));
		if (over) hovered = e;
		g.pill(x, y, w, CARD_H, Colors.alpha(Colors.lerp(Colors.CARD, Colors.CARD_HOVER, e.hover), ca));
		g.pillOutline(x, y, w, CARD_H, Colors.alpha(e == selected ? Colors.ACCENT : Colors.lerp(Colors.LINE, 0x55ECE7DF, e.hover), ca));
		g.pill(x + 10, y + 9, 32, 32, Colors.alpha(0xFF070708, ca));
		int color = Colors.alpha(on ? 0xFFFFFFFF : Colors.MUTED, ca);
		if (e.xion) g.blit(Ids.LOGO, x + 12, y + 11, 28, 28, 0, 0, 256, 256, 256, 256, color);
		else {
			ModLogos.Logo logo = ModLogos.get(e.root, e.icon, e.id);
			if (logo != null) {
				int lw = logo.width(), lh = logo.height();
				int dw = Math.round(25 * Math.min(1f, lw / (float) lh)), dh = Math.round(25 * Math.min(1f, lh / (float) lw));
				g.blit(logo.texture(), x + 26 - dw / 2, y + 25 - dh / 2, dw, dh, 0, 0, lw, lh, lw, lh, color);
			} else ModIcons.draw(g, kind(e), x + 26, y + 25, 25, color);
		}
		g.text(fit(g, e.name, w - 94), x + 50, y + 12, Colors.alpha(on ? Colors.TEXT : Colors.MUTED, ca), false);
		String ver = e.version == null || e.version.isEmpty() ? e.id : "v" + e.version;
		g.scaledText(fit(g, ver, (int) ((w - 60) / 0.85f)), x + 50, y + 27, 0.85f, Colors.alpha(Colors.MUTED, ca), false);
		String description = e.description.isEmpty() ? e.pre ? "Included in your Xion setup" : "Added to your mod collection" : e.description;
		g.text(fit(g, description, w - 24), x + 12, y + 45, Colors.alpha(Colors.MUTED, ca), false);
		ModsLayout.Rect toggle = controls.toggle(), settings = controls.settings();
		if (locked) {
			g.pillOutline(toggle.x() + 8, toggle.y(), 7, 6, Colors.alpha(Colors.MUTED, ca));
			g.rounded(toggle.x() + 6, toggle.y() + 5, 11, 7, Colors.alpha(Colors.MUTED, 0.6f * ca));
		} else {
			g.pill(toggle.x(), toggle.y(), toggle.w(), toggle.h(), Colors.alpha(Colors.lerp(0xFF26262A, Colors.PILL, e.switchAmount), ca));
			g.pill(toggle.x() + 2 + Math.round(e.switchAmount * 12), toggle.y() + 2, 8, 8, Colors.alpha(Colors.lerp(Colors.MUTED, Colors.ON_PILL, e.switchAmount), ca));
		}
		int stateColor = pending ? Colors.GOLD : locked ? Colors.MUTED : on ? Colors.OK : Colors.DIM;
		String state = pending ? on ? "Enable next" : "Disable next" : locked ? "Required" : on ? "Active" : "Disabled";
		g.rounded(x + 12, y + 67, 3, 3, Colors.alpha(stateColor, ca));
		g.scaledText(fit(g, state, (int) ((w - 112) / 0.85f)), x + 20, y + 65, 0.85f, Colors.alpha(stateColor, ca), false);
		boolean hasConfig = e.xion || e.config != null, configOver = hasConfig && settings.contains(mx, my) && over;
		g.pill(settings.x(), settings.y(), settings.w(), settings.h(), Colors.alpha(hasConfig ? configOver ? 0xFF1E1E21 : 0xFF141416 : 0xFF0E0E10, ca));
		g.pillOutline(settings.x(), settings.y(), settings.w(), settings.h(), Colors.alpha(hasConfig ? configOver ? 0x80ECE7DF : Colors.LINE_2 : Colors.LINE, ca));
		XButton.drawIcon(g, XButton.Icon.GEAR, settings.x() + 8, settings.y() + 5, Colors.alpha(hasConfig ? Colors.TEXT : Colors.DIM, ca));
		g.text(hasConfig ? "Settings" : "No config", settings.x() + 22, settings.y() + 5, Colors.alpha(hasConfig ? Colors.TEXT : Colors.MUTED, ca), false);
	}

	private static String clean(String s) {
		return s == null ? "" : s.replaceAll("[\\p{Cntrl}§]+", " ").replaceAll("\\s+", " ").trim();
	}

	private static String fit(Gfx g, String text, int width) {
		if (text == null || width <= 0) return "";
		return g.font.width(text) <= width ? text : g.font.plainSubstrByWidth(text, Math.max(0, width - g.font.width("…"))) + "…";
	}

	// ---- input ----

	Click click(double mx, double my, int x, int y, int w, int h, double scroll, Screen parent) {
		pressed = null;
		if (!new ModsLayout.Rect(x, y, w, h).contains(mx, my)) { searchFocused = false; return Click.NONE; }
		if (new ModsLayout.Rect(x, y + 26, w, 24).contains(mx, my)) {
			searchFocused = true;
			search.focusEnd();
			if (mx >= x + w - 24 && !search.value().isEmpty()) { search.clear(); restart(); return Click.FILTER; }
			return Click.HANDLED;
		}
		searchFocused = false;
		int chipW = (w - 15) / 4;
		for (Filter f : Filter.values()) if (new ModsLayout.Rect(x + f.ordinal() * (chipW + 5), y + 58, chipW, 16).contains(mx, my)) {
			filter = f;
			restart();
			Compat.click();
			return Click.FILTER;
		}
		if (my < y + ModsLayout.HEADER || my >= y + h - ModsLayout.FOOTER) return Click.NONE;
		for (Hit hit : hits) {
			ModsLayout.Controls controls = hit.controls();
			if (!controls.card().contains(mx, my)) continue;
			pressed = hit.entry();
			pressedAction = controls.toggle().contains(mx, my) ? 1 : controls.settings().contains(mx, my) ? 2 : 3;
			pressedRect = pressedAction == 1 ? controls.toggle() : pressedAction == 2 ? controls.settings() : controls.card();
			return Click.HANDLED;
		}
		return Click.NONE;
	}

	Click release(double mx, double my, int button, Screen parent) {
		Entry e = pressed;
		pressed = null;
		if (button != 0 || e == null || !pressedRect.contains(mx, my)) return Click.NONE;
		if (pressedAction == 2) return openConfig(e, parent);
		Compat.click();
		if (pressedAction == 1 && e.lockedBy == null) ModToggles.set(e.id, !ModToggles.wanted(e.id, e.loaded), e.loaded);
		else selected = e;
		return Click.HANDLED;
	}

	Click key(int code, int modifiers) {
		boolean ctrl = (modifiers & 2) != 0;
		if (ctrl && code == 70) { searchFocused = true; search.selectAll(); return Click.HANDLED; }
		if (!searchFocused) return Click.NONE;
		if (code == 256) {
			if (!search.value().isEmpty()) { search.clear(); restart(); return Click.FILTER; }
			searchFocused = false;
			return Click.HANDLED;
		}
		if (code == 257 || code == 335) { searchFocused = false; return Click.HANDLED; }
		String before = search.value();
		boolean handled;
		if (ctrl && (code == 67 || code == 88)) {
			try { net.minecraft.client.Minecraft.getInstance().keyboardHandler.setClipboard(search.selection()); } catch (Exception ignored) {}
			if (code == 88) search.deleteSelection();
			handled = true;
		} else if (ctrl && code == 86) {
			try { search.insert(net.minecraft.client.Minecraft.getInstance().keyboardHandler.getClipboard()); } catch (Exception ignored) {}
			handled = true;
		} else handled = search.key(code, modifiers);
		if (!before.equals(search.value())) { restart(); return Click.FILTER; }
		return handled ? Click.HANDLED : Click.NONE;
	}

	Click character(char c, int modifiers) {
		if (!searchFocused || Character.isISOControl(c) || c == 167) return Click.NONE;
		if (search.insert(String.valueOf(c))) { restart(); return Click.FILTER; }
		return Click.HANDLED;
	}

	private Click openConfig(Entry e, Screen parent) {
		Compat.click();
		if (e.xion) return Click.XION;
		if (e.config == null) return Click.HANDLED;
		try {
			Screen sc = e.config.apply(parent);
			if (sc != null) Compat.setScreen(sc);
		} catch (Exception | LinkageError ex) {
			System.out.println("[Xion] Could not open config: " + ex);
		}
		return Click.HANDLED;
	}
}
