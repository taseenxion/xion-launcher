package net.xion.client.ui;

import net.xion.client.compat.Gfx;

/**
 * The glyphs the Mods page draws on its cards.
 *
 * Nothing here is taken from a mod's own icon file: every card shows the same hand-drawn,
 * monochrome line art in Xion's style, chosen from what the mod does (a client, a performance
 * mod, a shader loader, a config library, an API). Drawn from 1px rects so it stays crisp at
 * any GUI scale and picks up the card's text colour when a mod is switched off.
 */
final class ModIcons {
	static final String XION = "xion";
	static final String BARS = "bars";
	static final String LENS = "lens";
	static final String GRID = "grid";
	static final String CODE = "code";
	static final String CUBE = "cube";

	private ModIcons() {}

	/** Draws a glyph centred on (cx, cy) inside a size x size box. */
	static void draw(Gfx g, String kind, int cx, int cy, int size, int color) {
		int h = Math.max(4, size / 2);
		switch (kind) {
			case XION -> cross(g, cx, cy, h, color);
			case BARS -> bars(g, cx, cy, h, color);
			case LENS -> lens(g, cx, cy, h, color);
			case GRID -> grid(g, cx, cy, h, color);
			case CODE -> code(g, cx, cy, h, color);
			default -> cube(g, cx, cy, h, color);
		}
	}

	/** The Xion mark: a bold X. */
	private static void cross(Gfx g, int cx, int cy, int h, int c) {
		line(g, cx - h + 1, cy - h + 1, cx + h - 2, cy + h - 2, 2, c);
		line(g, cx + h - 2, cy - h + 1, cx - h + 1, cy + h - 2, 2, c);
	}

	/** Performance: three bars, rising. */
	private static void bars(Gfx g, int cx, int cy, int h, int c) {
		int w = Math.max(2, h / 4);
		int gap = Math.max(2, h / 5);
		int total = w * 3 + gap * 2;
		int bottom = cy + h - 1;
		int[] frac = {45, 72, 100};
		for (int i = 0; i < 3; i++) {
			int bh = Math.max(3, (2 * h - 2) * frac[i] / 100);
			int x = cx - total / 2 + i * (w + gap);
			g.fill(x, bottom - bh, x + w, bottom, c);
		}
	}

	/** Shaders and visuals: a lens. */
	private static void lens(Gfx g, int cx, int cy, int h, int c) {
		ring(g, cx, cy, h - 1, 2, c);
		disc(g, cx, cy, Math.max(2, h / 3), c);
	}

	/** Config and menu libraries: four tiles. */
	private static void grid(Gfx g, int cx, int cy, int h, int c) {
		int q = Math.max(2, h - 1);
		int gap = 2;
		int left = cx - q - gap / 2, top = cy - q - gap / 2;
		g.rounded(left, top, q, q, c);
		g.rounded(left + q + gap, top, q, q, c);
		g.rounded(left, top + q + gap, q, q, c);
		g.rounded(left + q + gap, top + q + gap, q, q, c);
	}

	/** APIs and languages: angle brackets. */
	private static void code(Gfx g, int cx, int cy, int h, int c) {
		for (int i = 1; i < h - 1; i++) {
			int y = cy - i;
			block(g, cx - h + 2 + i, y, c);
			block(g, cx - h + 2 + i, cy + i, c);
			block(g, cx + h - 3 - i, y, c);
			block(g, cx + h - 3 - i, cy + i, c);
		}
	}

	/** Everything else: an isometric block. */
	private static void cube(Gfx g, int cx, int cy, int h, int c) {
		int w = Math.max(3, h * 3 / 4);
		int top = cy - h + 1, bottom = cy + h - 1;
		line(g, cx, top, cx + w, cy - h / 2, 1, c);
		line(g, cx + w, cy - h / 2, cx + w, cy + h / 2, 1, c);
		line(g, cx + w, cy + h / 2, cx, bottom, 1, c);
		line(g, cx, bottom, cx - w, cy + h / 2, 1, c);
		line(g, cx - w, cy + h / 2, cx - w, cy - h / 2, 1, c);
		line(g, cx - w, cy - h / 2, cx, top, 1, c);
		line(g, cx - w, cy - h / 2, cx, cy, 1, c);
		line(g, cx + w, cy - h / 2, cx, cy, 1, c);
		line(g, cx, cy, cx, bottom, 1, c);
	}

	// ---- primitives ----

	private static void block(Gfx g, int x, int y, int c) {
		g.fill(x, y, x + 2, y + 2, c);
	}

	private static void disc(Gfx g, int cx, int cy, int r, int c) {
		for (int dy = -r; dy <= r; dy++) {
			int w = (int) Math.sqrt(Math.max(0, r * r - dy * dy));
			g.fill(cx - w, cy + dy, cx + w + 1, cy + dy + 1, c);
		}
	}

	private static void ring(Gfx g, int cx, int cy, int r, int t, int c) {
		int steps = Math.max(24, r * 10);
		for (int i = 0; i < steps; i++) {
			double a = Math.PI * 2 * i / steps;
			int x = (int) Math.round(cx + Math.cos(a) * r);
			int y = (int) Math.round(cy + Math.sin(a) * r);
			g.fill(x - t / 2, y - t / 2, x - t / 2 + t, y - t / 2 + t, c);
		}
	}

	/** Straight line of t x t pixels (Bresenham). */
	private static void line(Gfx g, int x1, int y1, int x2, int y2, int t, int c) {
		int dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
		int sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
		int err = dx - dy;
		int guard = dx + dy + 4;
		while (guard-- > 0) {
			g.fill(x1, y1, x1 + t, y1 + t, c);
			if (x1 == x2 && y1 == y2) break;
			int e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x1 += sx;
			}
			if (e2 < dx) {
				err += dx;
				y1 += sy;
			}
		}
	}
}
