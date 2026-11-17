package net.xion.client.ui;

import net.minecraft.client.gui.screens.Screen;
import net.xion.client.XionClient;
import net.xion.client.XionConfig;
import net.xion.client.compat.BaseScreen;
import net.xion.client.compat.Colors;
import net.xion.client.compat.Compat;
import net.xion.client.compat.Gfx;
import net.xion.client.compat.Ids;
import net.xion.client.feature.Badge;
import net.xion.client.feature.Premium;
import net.xion.client.feature.Pvp;
import net.xion.client.hud.HudManager;
import net.xion.client.hud.HudModule;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * The Right Shift menu: a glass command centre with an icon sidebar and one focused page at a time.
 * Pages cover mods, HUD modules, features, FPS tweaks, capes, the Xion+ crosshair editor, XION AI
 * and your profile. The AI page gets a wider, taller window so the chat has room to breathe.
 */
public class XionMenuScreen extends BaseScreen {
	public enum Tab { MODS, HUD, FEATURES, FPS, CAPES, AI, PROFILE, CROSSHAIR }

	private static final Tab[] TABS = { Tab.MODS, Tab.HUD, Tab.FEATURES, Tab.FPS, Tab.CAPES, Tab.AI, Tab.PROFILE };
	/** Crosshair editing is Xion+ only, so the tab only appears with a valid key. */
	private static final Tab[] TABS_XP = { Tab.MODS, Tab.HUD, Tab.FEATURES, Tab.FPS, Tab.CAPES, Tab.CROSSHAIR, Tab.AI, Tab.PROFILE };

	private static final int GAP = 6;
	private static final int CARD_H = 44;
	private static final int HEADER_H = 48;

	private record Toggle(String name, String desc, BooleanSupplier get, Consumer<Boolean> set, HudModule module, boolean premium) {
		Toggle(String name, String desc, BooleanSupplier get, Consumer<Boolean> set) {
			this(name, desc, get, set, null, false);
		}
	}

	private final Screen parent;
	private final CrosshairPanel crosshairPanel = new CrosshairPanel();
	private final CosmeticsPanel cosmeticsPanel = new CosmeticsPanel();
	private final FpsPanel fpsPanel = new FpsPanel();
	private final ModsPanel modsPanel;
	private final AIPanel aiPanel = new AIPanel();
	private Tab tab;
	private int px, py, pw, ph;
	private int sideX, sideY, sideW, sideH;
	private int contentX, contentY, contentW, contentH;
	private int cols, cardW;
	private double scroll;
	private long tabAt;
	private final List<Toggle> toggles = new ArrayList<>();

	public XionMenuScreen(Screen parent, Tab tab) {
		super("Xion Menu");
		this.parent = parent;
		this.tab = tab;
		this.tabAt = System.currentTimeMillis();
		for (HudModule m : HudManager.MODULES) {
			if (m.pvpOnly && !Pvp.active()) continue;
			toggles.add(new Toggle(m.name, m.description, () -> m.state().enabled, v -> m.state().enabled = v, m, m.premium));
		}
		modsPanel = new ModsPanel(ModConfigs.discover());
	}

	private List<Toggle> features() {
		List<Toggle> f = new ArrayList<>();
		f.add(new Toggle("Auto Sprint", "Always sprint when moving forward", () -> XionConfig.data.autoSprint, v -> XionConfig.data.autoSprint = v));
		f.add(new Toggle("Fullbright", "See clearly in the dark", () -> XionConfig.data.fullbright, v -> XionConfig.data.fullbright = v));
		f.add(new Toggle("HUD Background", "Dark boxes behind HUD text", () -> XionConfig.data.hudBackground, v -> XionConfig.data.hudBackground = v));
		f.add(new Toggle("Xion Badge", "Logo next to your name (tab, F5)", () -> XionConfig.data.badge, v -> XionConfig.data.badge = v));
		f.add(new Toggle("Custom Skin", "Use the skin from Xion Launcher", () -> XionConfig.data.customSkin, v -> XionConfig.data.customSkin = v));
		f.add(new Toggle("Xion Main Menu", "Replace the vanilla title screen", () -> XionConfig.data.customMenu, v -> XionConfig.data.customMenu = v));
		return f;
	}

	private Tab[] tabs() {
		return Premium.active() ? TABS_XP : TABS;
	}

	private String[] tabNames(Tab[] tabs) {
		if (Pvp.active()) {
			return tabs.length == TABS_XP.length
				? new String[]{"Mods", "PvP HUD", "Combat", "FPS", "Capes", "Crosshair", "XION AI", "Profile"}
				: new String[]{"Mods", "PvP HUD", "Combat", "FPS", "Capes", "XION AI", "Profile"};
		}
		return tabs.length == TABS_XP.length
			? new String[]{"Mods", "HUD Mods", "Features", "FPS", "Capes", "Crosshair", "XION AI", "Profile"}
			: new String[]{"Mods", "HUD Mods", "Features", "FPS", "Capes", "XION AI", "Profile"};
	}

	private static XButton.Icon icon(Tab t) {
		return switch (t) {
			case MODS -> XButton.Icon.GRID;
			case HUD -> XButton.Icon.SLIDERS;
			case FEATURES -> XButton.Icon.STAR;
			case FPS -> XButton.Icon.POWER;
			case CAPES -> XButton.Icon.SHIRT;
			case CROSSHAIR -> XButton.Icon.TARGET;
			case AI -> XButton.Icon.SPARK;
			case PROFILE -> XButton.Icon.PERSON;
		};
	}

	@Override
	protected void layout() {
		boolean ai = tab == Tab.AI;
		boolean mods = tab == Tab.MODS;
		int maxW = mods ? 740 : ai ? 640 : 620;
		int maxH = mods ? 420 : ai ? 404 : 350;
		pw = Math.min(width - 16, maxW);
		ph = Math.min(height - 16, maxH);
		px = (width - pw) / 2;
		py = (height - ph) / 2;

		sideW = Math.max(84, Math.min(mods ? 108 : 116, pw / 4));
		sideX = px + 8;
		sideY = py + HEADER_H + 4;
		sideH = ph - HEADER_H - 12;
		contentX = px + sideW + 16;
		contentY = py + HEADER_H + 8;
		contentW = pw - sideW - 24;
		contentH = ph - HEADER_H - 8 - (tab == Tab.HUD ? 20 : 0);
		cols = contentW >= 560 ? 3 : contentW >= 330 ? 2 : 1;
		cardW = (contentW - (cols - 1) * GAP) / cols;

		Tab[] tabs = tabs();
		String[] names = tabNames(tabs);
		int pitch = Math.max(16, Math.min(25, (sideH - 14) / Math.max(1, tabs.length)));
		int tabH = Math.max(14, pitch - 3);
		int ty = sideY + 7;
		for (int i = 0; i < tabs.length; i++) {
			Tab t = tabs[i];
			XButton b = add(new XButton(sideX + 6, ty + i * pitch, sideW - 12, tabH, names[i], XButton.Style.TAB, () -> switchTab(t)));
			b.icon(icon(t)).left();
			b.selected = t == tab;
			b.enter(0.04f + i * 0.028f, -14, 0);
		}

		int by = py + ph - 25;
		if (tab == Tab.HUD) {
			add(new XButton(contentX, by, 122, 18, "Edit HUD Layout", XButton.Style.PRIMARY, () -> Compat.setScreen(new HudEditorScreen(this))).enter(0.12f, 0, 8));
		}
		if (tab == Tab.CROSSHAIR) crosshairPanel.layout(this::add, contentX, contentY, contentW);
		add(new XButton(px + pw - 12 - 50, py + 15, 50, 18, "Done", XButton.Style.GLASS, this::onClose).enter(0.02f, 14, 0));
	}

	private void switchTab(Tab t) {
		tab = t;
		scroll = 0;
		tabAt = System.currentTimeMillis();
		if (t == Tab.MODS) modsPanel.restart();
		rebuild();
	}

	private void rebuild() {
		buttons.clear();
		layout();
	}

	private List<Toggle> currentToggles() {
		return tab == Tab.HUD ? toggles : tab == Tab.FEATURES ? features() : List.of();
	}

	private int rowsHeight() {
		if (tab == Tab.AI) return 0;
		if (tab == Tab.MODS) return modsPanel.height(contentW);
		if (tab == Tab.CAPES) return cosmeticsPanel.height(contentW);
		if (tab == Tab.FPS) return fpsPanel.height(contentW);
		int n = currentToggles().size();
		return ((n + cols - 1) / cols) * (CARD_H + GAP);
	}

	private float easeSince(long start, float seconds) {
		float t = Math.max(0f, Math.min(1f, (System.currentTimeMillis() - start) / (seconds * 1000f)));
		return 1f - (1f - t) * (1f - t) * (1f - t);
	}

	@Override
	protected void draw(Gfx g, int mx, int my, float pt) {
		float a = intro(0.32f);
		panorama(g);
		g.fill(0, 0, width, height, Colors.alpha(0x9006080C, a));

		int oy = (int) ((1 - a) * 12);
		g.push();
		g.translate(0, oy);
		drawShell(g, mx, my - oy, a);

		if (tab != Tab.MODS && rowsHeight() > contentH) {
			int trackX = contentX + contentW + 3;
			int barH = Math.max(12, contentH * contentH / rowsHeight());
			int barY = contentY + (int) ((contentH - barH) * (scroll / Math.max(1, rowsHeight() - contentH)));
			g.fill(trackX, contentY, trackX + 2, contentY + contentH, Colors.alpha(0x14FFFFFF, a));
			g.fill(trackX, barY, trackX + 2, barY + barH, Colors.alpha(Colors.ACCENT, a));
		}

		// Content fades and lifts in when a tab is picked; the shell stays put.
		float ta = easeSince(tabAt, 0.24f);
		g.push();
		g.translate(0, Math.round((1 - ta) * 7));
		switch (tab) {
			case MODS -> {
				modsPanel.draw(g, contentX, contentY, contentW, contentH, scroll, mx, my - oy, a * ta);
			}
			case PROFILE -> drawProfile(g, mx, my - oy, a * ta);
			case CROSSHAIR -> crosshairPanel.draw(g, contentX, contentY, contentW, a * ta);
			case CAPES -> cosmeticsPanel.draw(g, contentX, contentY, contentW, contentH, scroll, mx, my - oy, a * ta);
			case FPS -> fpsPanel.draw(g, contentX, contentY, contentW, contentH, scroll, mx, my - oy, a * ta);
			case AI -> aiPanel.draw(g, contentX, contentY, contentW, contentH, mx, my - oy, a * ta);
			default -> drawToggles(g, mx, my - oy, a * ta);
		}
		g.pop();

		drawButtons(g, mx, my - oy, a);
		g.pop();
	}

	private void drawShell(Gfx g, int mx, int my, float a) {
		long now = System.currentTimeMillis();

		// Layered card: soft shadow, glass body, breathing edge and a moonlight wash at the top.
		g.pill(px - 3, py + 4, pw + 6, ph + 6, Colors.alpha(0x50000000, a));
		g.pill(px, py, pw, ph, Colors.alpha(Colors.PANEL, a));
		float breathe = (float) ((Math.sin(now / 2400.0) + 1) / 2);
		g.pillOutline(px, py, pw, ph, Colors.alpha(Colors.lerp(0x22FFFFFF, 0x44C9D6FF, breathe), a));
		g.vGradient(px + 2, py + 2, pw - 4, Math.min(92, ph / 3), Colors.alpha(Colors.ACCENT, 0.075f * a), 0x00FFFFFF);

		// Slow drifting motes behind the glass.
		for (int i = 0; i < (tab == Tab.MODS ? 0 : 14); i++) {
			int dx = px + 16 + (int) ((i * 83L + now / 85) % Math.max(1, pw - 32));
			int dy = py + HEADER_H + (int) ((i * 47L + now / 120) % Math.max(1, ph - HEADER_H - 18));
			float tw = (float) ((Math.sin(now / 900.0 + i * 1.7) + 1) / 2);
			g.fill(dx, dy, dx + 1, dy + 1, Colors.alpha(Colors.ACCENT, (0.03f + 0.05f * tw) * a));
		}

		// Header.
		g.fill(px, py, px + pw, py + HEADER_H, Colors.alpha(0xC40A0D13, a));
		g.fill(px + 8, py + HEADER_H, px + pw - 8, py + HEADER_H + 1, Colors.alpha(0x1CFFFFFF, a));
		g.hGradient(px + 1, py, pw - 2, 2, Colors.alpha(Colors.ACCENT, 0.12f * a), Colors.alpha(Colors.ACCENT_2, 0.9f * a));
		int shimmerW = Math.max(80, Math.min(150, pw / 3));
		int shimmerX = px + (int) ((pw - shimmerW) * ((Math.sin(now / 2600.0) + 1) / 2));
		g.hGradient(shimmerX, py, shimmerW, 2, Colors.alpha(0xFFFFFFFF, 0f), Colors.alpha(0xFFFFFFFF, 0.55f * a));

		int lx = px + 13, ly = py + 12;
		int orb = Colors.lerp(Colors.ACCENT, Colors.ACCENT_2, breathe);
		g.pill(lx - 2, ly - 2, 28, 28, Colors.alpha(orb, 0.12f * a));
		g.pill(lx, ly, 24, 24, Colors.alpha(Colors.lerp(Colors.CARD, Colors.ACCENT, 0.2f), a));
		g.pillOutline(lx, ly, 24, 24, Colors.alpha(0x38FFFFFF, a));
		g.blit(Ids.LOGO, lx + 2, ly + 2, 20, 20, 0, 0, 256, 256, 256, 256, Colors.alpha(0xFFFFFFFF, a));

		g.scaledText("XION", px + 46, py + 8, 1.5f, Colors.alpha(Colors.TEXT, a), true);
		int titleW = (int) (g.font.width("XION") * 1.5f);
		int chipX = px + 46 + titleW + 8;
		g.pill(chipX, py + 10, 44, 13, Colors.alpha(Colors.lerp(Colors.CARD, Colors.ACCENT, 0.16f), a));
		g.pillOutline(chipX, py + 10, 44, 13, Colors.alpha(Colors.ACCENT, 0.35f * a));
		g.text("CLIENT", chipX + 6, py + 13, Colors.alpha(Colors.ACCENT, a), false);
		if (Pvp.active()) {
			int pvpX = chipX + 50;
			g.pill(pvpX, py + 10, 34, 13, Colors.alpha(Colors.ACCENT, a));
			g.text("PVP", pvpX + 6, py + 13, Colors.alpha(0xFF1A0709, a), false);
		}
		g.text("v" + XionClient.VERSION + "   ·   Nightfall", px + 46, py + 27, Colors.alpha(Colors.MUTED, a), false);

		String fps = minecraft.level == null ? "Ready" : HudManager.fps() + " FPS";
		g.text(fps, px + pw - 74 - g.font.width(fps), py + 20, Colors.alpha(Colors.MUTED, a), false);

		// Sidebar rail.
		g.pill(sideX, sideY, sideW, sideH, Colors.alpha(0x5510131B, a));
		g.pillOutline(sideX, sideY, sideW, sideH, Colors.alpha(0x16FFFFFF, a));
		g.fill(sideX + 5, sideY + 5, sideX + 6, sideY + sideH - 5, Colors.alpha(0x18FFFFFF, a));

		// Page canvas.
		if (tab != Tab.AI) {
			g.pill(contentX - 6, contentY - 6, contentW + 12, contentH + 12, Colors.alpha(0x6610141D, a));
			g.pillOutline(contentX - 6, contentY - 6, contentW + 12, contentH + 12, Colors.alpha(0x18FFFFFF, a));
			if (tab != Tab.MODS) g.fill(contentX - 6, contentY - 6, contentX - 4, contentY + 18, Colors.alpha(Colors.ACCENT, 0.8f * a));
			g.vGradient(contentX - 4, contentY - 4, contentW + 8, Math.min(54, contentH / 3), Colors.alpha(Colors.ACCENT_2, 0.045f * a), 0x00FFFFFF);
		}
	}

	private void drawToggles(Gfx g, int mx, int my, float a) {
		List<Toggle> list = currentToggles();
		for (int i = 0; i < list.size(); i++) {
			Toggle tg = list.get(i);
			int x = contentX + (i % cols) * (cardW + GAP);
			int y = contentY + (i / cols) * (CARD_H + GAP) - (int) scroll;
			if (y < contentY - 1 || y + CARD_H > contentY + contentH + 1) continue;
			boolean on = tg.get().getAsBoolean();
			boolean hov = mx >= x && mx < x + cardW && my >= y && my < y + CARD_H;
			g.pill(x, y, cardW, CARD_H, Colors.alpha(hov ? Colors.CARD_HOVER : Colors.CARD, a));
			boolean locked = tg.premium() && !Premium.active();
			g.pillOutline(x, y, cardW, CARD_H, on && !locked ? Colors.alpha(Colors.ACCENT, 0.3f * a) : Colors.alpha(0x14FFFFFF, a));
			if (on && !locked) g.fill(x, y + 5, x + 2, y + CARD_H - 5, Colors.alpha(Colors.ACCENT, 0.85f * a));
			g.text(g.font.plainSubstrByWidth(tg.name(), cardW - 62), x + 10, y + 9, Colors.alpha(locked ? Colors.MUTED : Colors.TEXT, a), false);
			if (tg.premium()) g.text("XION+", x + cardW - 30 - g.font.width("XION+"), y + 9, Colors.alpha(Colors.GOLD, a), false);
			String sub = tg.module() != null && hov && mx < x + cardW - 30 && !locked ? "Settings ›" : tg.desc();
			g.text(g.font.plainSubstrByWidth(sub, cardW - 42), x + 10, y + 26, Colors.alpha(sub.equals("Settings ›") ? Colors.ACCENT : Colors.MUTED, a), false);
			if (locked) on = false;
			int sx = x + cardW - 26, sy = y + (CARD_H - 10) / 2;
			g.pill(sx, sy, 20, 10, Colors.alpha(on ? Colors.ACCENT : 0xFF2A303C, a));
			g.rounded(on ? sx + 11 : sx + 1, sy + 1, 8, 8, Colors.alpha(on ? Colors.ON_PILL : 0xFF8B94A5, a));
		}
	}

	private void drawProfile(Gfx g, int mx, int my, float a) {
		int cx = contentX + 50;
		int top = contentY + 4;
		// Animated glow pad behind the avatar.
		float t = (float) ((Math.sin(System.currentTimeMillis() / 600.0) + 1) / 2);
		g.pill(cx - 42, top, 84, 138, Colors.alpha(Colors.CARD, a));
		g.pillOutline(cx - 42, top, 84, 138, Colors.alpha(Colors.lerp(0x24FFFFFF, 0x40C9D6FF, t), a));
		g.vGradient(cx - 40, top + 94, 80, 42, 0x00C9D6FF, Colors.alpha(0x22C9D6FF, a));
		int bob = (int) Math.round(Math.sin(System.currentTimeMillis() / 500.0) * 2);
		SkinView.body(g, Ids.skinOf(minecraft.player), cx - 16, top + 20 + bob, 2, Colors.alpha(0xFFFFFFFF, a));

		int ix = contentX + 112;
		String name = minecraft.getUser().getName();
		g.scaledText((XionConfig.data.badge ? Badge.glyph() + " " : "") + name, ix, top + 2, 1.5f, Colors.alpha(Colors.TEXT, a), true);
		boolean ms = "microsoft".equals(XionConfig.launcher.account);
		g.pill(ix, top + 20, ms ? 62 : 52, 12, Colors.alpha(ms ? 0xFF1D3B2E : 0xFF232937, a));
		g.text(ms ? "Microsoft" : "Offline", ix + 5, top + 22, Colors.alpha(ms ? Colors.OK : Colors.ACCENT, a), false);
		if (Premium.active()) {
			int px2 = ix + (ms ? 68 : 58);
			g.pill(px2, top + 20, 50, 12, Colors.alpha(0x33F5C86B, a));
			g.text("XION+", px2 + 7, top + 22, Colors.alpha(Colors.GOLD, a), false);
		}

		String[] lines = {
			"Skin: " + (net.xion.client.feature.SkinOverride.active() ? "custom (from Xion Launcher)" : "default"),
			"Badge: " + (XionConfig.data.badge ? "shown in tab list & F5" : "hidden"),
			"Minecraft " + Compat.MC_VERSION + "  ·  " + modsPanel.loadedCount() + " mods",
			"",
			"Change your skin in Xion Launcher",
			"→ Profile. Microsoft skins sync to",
			"everyone; offline skins show for you."
		};
		for (int i = 0; i < lines.length; i++) {
			g.text(lines[i], ix, top + 42 + i * 11, Colors.alpha(i >= 4 ? Colors.MUTED : Colors.TEXT, a), false);
		}
		if (contentH >= 210) {
			int bx = contentX + 8, by = top + 156, bw = (contentW - 24) / 2;
			for (int i = 0; i < 2; i++) {
				int x = bx + i * (bw + 8);
				g.pill(x, by, bw, 42, Colors.alpha(Colors.CARD, a));
				g.text(i == 0 ? "FREE · ANIMATED" : "XION+ · ANIMATED", x + 8, by + 7, Colors.alpha(i == 0 ? Colors.ACCENT : Colors.GOLD, a), false);
				g.scaledText(Badge.glyph(i == 1) + " Player", x + 8, by + 22, 1.2f, Colors.alpha(Colors.TEXT, a), false);
			}
		}

		// A quiet footer card so the right side of the wider menu does not feel empty.
		int fx = contentX + contentW - 118;
		if (fx > ix + 170) {
			g.pill(fx, top, 112, 74, Colors.alpha(Colors.CARD, a));
			g.pillOutline(fx, top, 112, 74, Colors.alpha(0x14FFFFFF, a));
			g.text("SESSION", fx + 8, top + 8, Colors.alpha(Colors.MUTED, a), false);
			g.scaledText(XionClient.sessionMinutes() + "m", fx + 8, top + 20, 1.6f, Colors.alpha(Colors.ACCENT, a), true);
			g.text("Xion Client", fx + 8, top + 48, Colors.alpha(Colors.TEXT, a), false);
			g.text("v" + XionClient.VERSION, fx + 8, top + 58, Colors.alpha(Colors.MUTED, a), false);
		}
	}

	@Override
	protected boolean click(double x, double y, int button) {
		if (tab == Tab.AI) return aiPanel.click(x, y, button);
		if (tab == Tab.CROSSHAIR) return crosshairPanel.click(x, y, button);
		if (tab == Tab.FPS) return fpsPanel.click(x, y, contentX, contentY, contentW, scroll);
		if (tab == Tab.CAPES) {
			// Locked capes stay locked; the key is entered in Xion Launcher, not bought in game.
			CosmeticsPanel.Click c = cosmeticsPanel.click(x, y, contentX, contentY, contentW, contentH, scroll);
			return c != CosmeticsPanel.Click.NONE;
		}
		if (tab == Tab.MODS) {
			if (button != 0) return false;
			ModsPanel.Click c = modsPanel.click(x, y, contentX, contentY, contentW, contentH, scroll, this);
			if (c == ModsPanel.Click.FILTER) scroll = 0;
			if (c == ModsPanel.Click.XION) switchTab(Tab.HUD);
			return c != ModsPanel.Click.NONE;
		}
		if (tab != Tab.HUD && tab != Tab.FEATURES) return false;
		List<Toggle> list = currentToggles();
		for (int i = 0; i < list.size(); i++) {
			int cxp = contentX + (i % cols) * (cardW + GAP);
			int cyp = contentY + (i / cols) * (CARD_H + GAP) - (int) scroll;
			if (x >= cxp && x < cxp + cardW && y >= cyp && y < cyp + CARD_H && cyp >= contentY - 4 && cyp < contentY + contentH) {
				Toggle tg = list.get(i);
				if (tg.premium() && !Premium.active()) {
					// No in-game store: Xion+ modules unlock when you sign in on Xion Launcher.
					Compat.click();
					return true;
				}
				// The card body opens a module's settings; the switch on the right toggles it.
				if (tg.module() != null && (x < cxp + cardW - 30 || button == 1)) {
					Compat.click();
					Compat.setScreen(new ModuleSettingsScreen(this, tg.module()));
					return true;
				}
				tg.set().accept(!tg.get().getAsBoolean());
				XionConfig.save();
				Compat.click();
				return true;
			}
		}
		return false;
	}

	@Override
	protected void release(double x, double y, int button) {
		if (tab == Tab.MODS && modsPanel.release(x, y, button, this) == ModsPanel.Click.XION) switchTab(Tab.HUD);
	}

	@Override
	protected void scroll(double x, double y, double amount) {
		if (tab == Tab.AI) {
			aiPanel.scroll(x, y, amount);
			return;
		}
		double max = Math.max(0, rowsHeight() - contentH);
		scroll = Math.max(0, Math.min(max, scroll - amount * 18));
	}

	@Override
	protected boolean key(int keyCode, int scanCode, int modifiers) {
		if (tab == Tab.MODS) {
			ModsPanel.Click result = modsPanel.key(keyCode, modifiers);
			if (result == ModsPanel.Click.FILTER) scroll = 0;
			if (result != ModsPanel.Click.NONE) return true;
			if (keyCode == 266 || keyCode == 267) {
				scroll = Math.max(0, Math.min(Math.max(0, rowsHeight() - contentH), scroll + (keyCode == 266 ? -1 : 1) * contentH * 0.75));
				return true;
			}
		}
		return tab == Tab.AI && aiPanel.key(keyCode, scanCode, modifiers);
	}

	@Override
	protected boolean character(char codePoint, int modifiers) {
		if (tab == Tab.MODS) {
			ModsPanel.Click result = modsPanel.character(codePoint, modifiers);
			if (result == ModsPanel.Click.FILTER) scroll = 0;
			return result != ModsPanel.Click.NONE;
		}
		return tab == Tab.AI && aiPanel.character(codePoint, modifiers);
	}

	@Override
	public void onClose() {
		XionConfig.save();
		Compat.setScreen(parent);
	}
}
