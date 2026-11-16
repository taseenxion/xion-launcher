package net.xion.client.ui;

import net.xion.client.XionConfig;
import net.xion.client.compat.Colors;
import net.xion.client.compat.Compat;
import net.xion.client.compat.Gfx;
import net.xion.client.feature.FpsTweaks;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * "FPS" tab of the Xion menu: independent overrides plus an explicit frame-rate selector. Unlimited
 * disables VSync, and switching to a finite cap cancels Unlimited rather than silently ignoring it.
 */
final class FpsPanel {
	private static final int ROW_H = 22, GAP = 4, HEAD_H = 34, CAP_H = 22, NOTE_H = 24;
	/** 260 is the vanilla "unlimited" value. */
	private static final int[] CAPS = { 60, 90, 120, 144, 240, 260 };

	private record Row(String label, String desc, BooleanSupplier get, Consumer<Boolean> set) {}

	private final List<Row> rows = new ArrayList<>();

	FpsPanel() {
		rows.add(new Row("No clouds", "Clouds off — free frames everywhere",
			() -> XionConfig.data.fpsNoClouds, v -> XionConfig.data.fpsNoClouds = v));
		rows.add(new Row("Minimal particles", "No block hits, explosions or splashes",
			() -> XionConfig.data.fpsNoParticles, v -> XionConfig.data.fpsNoParticles = v));
		rows.add(new Row("No entity shadows", "Skips the moving blobs under mobs",
			() -> XionConfig.data.fpsNoEntityShadows, v -> XionConfig.data.fpsNoEntityShadows = v));
		rows.add(new Row("No smooth lighting", "Ambient occlusion off, flat but fast",
			() -> XionConfig.data.fpsNoSmoothLight, v -> XionConfig.data.fpsNoSmoothLight = v));
		rows.add(new Row("Mipmap off", "Distant block textures render cheaper",
			() -> XionConfig.data.fpsNoMipmap, v -> XionConfig.data.fpsNoMipmap = v));
		rows.add(new Row("Low entity distance", "Far-away mobs and items not drawn",
			() -> XionConfig.data.fpsLowEntityDistance, v -> XionConfig.data.fpsLowEntityDistance = v));
		rows.add(new Row("Low biome blend", "Grass colours snap instead of blending",
			() -> XionConfig.data.fpsLowBiomeBlend, v -> XionConfig.data.fpsLowBiomeBlend = v));
		rows.add(new Row("VSync off", "Automatic with Unlimited; removes the monitor refresh cap",
			FpsTweaks::vsyncOff, v -> { if (!FpsTweaks.unlimited()) XionConfig.data.fpsNoVsync = v; }));
		rows.add(new Row("Render distance 6", "Draws 6 chunks instead of your usual distance",
			() -> XionConfig.data.fpsLowRenderDistance, v -> XionConfig.data.fpsLowRenderDistance = v));
		rows.add(new Row("Simulation distance 5", "Mobs and ticks only near you",
			() -> XionConfig.data.fpsLowSimDistance, v -> XionConfig.data.fpsLowSimDistance = v));
		rows.add(new Row("Unlimited FPS", "Uncapped rendering; automatically turns VSync off",
			FpsTweaks::unlimited, v -> {
				XionConfig.data.fpsUnlimited = v;
				if (!v && XionConfig.data.fpsCap >= 260) XionConfig.data.fpsCap = 0;
			}));
		//#if MC >= 12111
		rows.add(new Row("No chunk fade-in", "Chunks appear at once instead of fading",
			() -> XionConfig.data.fpsNoChunkFade, v -> XionConfig.data.fpsNoChunkFade = v));
		rows.add(new Row("Opaque leaves", "Solid leaf blocks render much faster",
			() -> XionConfig.data.fpsOpaqueLeaves, v -> XionConfig.data.fpsOpaqueLeaves = v));
		rows.add(new Row("No weather", "Rain and snow render only right next to you",
			() -> XionConfig.data.fpsNoWeather, v -> XionConfig.data.fpsNoWeather = v));
		//#endif
	}

	int height(int w) {
		return HEAD_H + rows.size() * (ROW_H + GAP) + CAP_H + NOTE_H + 2;
	}

	void draw(Gfx g, int x, int y, int w, int h, double scroll, int mx, int my, float a) {
		g.text("FPS Boost", x, y + 2, Colors.alpha(Colors.TEXT, a), false);
		String hint = FpsTweaks.unlimited() ? "Unlimited FPS · VSync off · no monitor refresh cap" : "Instant tweaks · your other video settings stay unchanged";
		g.text(g.font.plainSubstrByWidth(hint, w), x, y + 13, Colors.alpha(Colors.MUTED, a), false);

		int ry = y + HEAD_H - (int) scroll;
		for (Row r : rows) {
			if (ry + ROW_H > y + HEAD_H - 2 && ry < y + h + 1) row(g, r, x, ry, w, mx, my, a);
			ry += ROW_H + GAP;
		}

		// FPS cap cycler
		if (ry + CAP_H > y + HEAD_H - 2 && ry < y + h + 1) {
			boolean hov = mx >= x && mx < x + w && my >= ry && my < ry + CAP_H;
			g.pill(x, ry, w, CAP_H, Colors.alpha(hov ? Colors.CARD_HOVER : Colors.CARD, a));
			g.pillOutline(x, ry, w, CAP_H, hov ? Colors.alpha(Colors.ACCENT, 0.5f * a) : Colors.alpha(0x14FFFFFF, a));
			g.text("FPS cap", x + 7, ry + 7, Colors.alpha(Colors.TEXT, a), false);
			g.text("click to change", x + 7 + g.font.width("FPS cap") + 6, ry + 7, Colors.alpha(Colors.MUTED, a), false);
			String v = capLabel();
			int vw = g.font.width(v) + 12;
			g.pill(x + w - vw - 5, ry + 4, vw, CAP_H - 8, Colors.alpha(XionConfig.data.fpsCap == 0 ? 0xFF1E2430 : Colors.ACCENT, 0.2f * a));
			g.text(v, x + w - vw - 5 + 6, ry + 7, Colors.alpha(XionConfig.data.fpsCap == 0 ? Colors.MUTED : Colors.ACCENT, a), false);
		}
		ry += CAP_H + GAP;

		if (ry > y + HEAD_H - 12 && ry < y + h + 1) {
			g.text(g.font.plainSubstrByWidth("These overrides apply after the launcher's Boost / Turbo preset.", w), x, ry + 4, Colors.alpha(Colors.MUTED, a), false);
		}
	}

	private void row(Gfx g, Row r, int x, int y, int w, int mx, int my, float a) {
		boolean on = r.get().getAsBoolean();
		boolean hov = mx >= x && mx < x + w && my >= y && my < y + ROW_H;
		g.pill(x, y, w, ROW_H, Colors.alpha(hov ? Colors.CARD_HOVER : Colors.CARD, a));
		g.pillOutline(x, y, w, ROW_H, on ? Colors.alpha(Colors.ACCENT, 0.25f * a) : Colors.alpha(0x14FFFFFF, a));
		g.text(r.label, x + 7, y + 4, Colors.alpha(Colors.TEXT, a), false);
		g.text(g.font.plainSubstrByWidth(r.desc, w - 60), x + 7, y + 13, Colors.alpha(Colors.MUTED, a), false);
		int sx = x + w - 26, sy = y + (ROW_H - 10) / 2;
		g.pill(sx, sy, 20, 10, Colors.alpha(on ? Colors.ACCENT : 0xFF2A303C, a));
		g.rounded(on ? sx + 11 : sx + 1, sy + 1, 8, 8, Colors.alpha(on ? Colors.ON_PILL : 0xFF8B94A5, a));
	}

	private static String capLabel() {
		int c = FpsTweaks.unlimited() ? 260 : XionConfig.data.fpsCap;
		if (c == 0) return "Game default";
		if (c == 260) return "Unlimited";
		return c + " fps";
	}

	boolean click(double mx, double my, int x, int y, int w, double scroll) {
		int ry = y + HEAD_H - (int) scroll;
		for (Row r : rows) {
			if (mx >= x && mx < x + w && my >= ry && my < ry + ROW_H) {
				r.set().accept(!r.get().getAsBoolean());
				XionConfig.save();
				FpsTweaks.refresh();
				Compat.click();
				return true;
			}
			ry += ROW_H + GAP;
		}
		if (mx >= x && mx < x + w && my >= ry && my < ry + CAP_H) {
			int i = 0;
			int cap = FpsTweaks.unlimited() ? 260 : XionConfig.data.fpsCap;
			for (int k = 0; k < CAPS.length; k++) if (CAPS[k] == cap) i = k + 1;
			XionConfig.data.fpsCap = i >= CAPS.length ? 0 : CAPS[i];
			XionConfig.data.fpsUnlimited = XionConfig.data.fpsCap == 260;
			XionConfig.save();
			FpsTweaks.refresh();
			Compat.click();
			return true;
		}
		return false;
	}
}
