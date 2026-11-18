package net.xion.client.ui;

import net.minecraft.client.Minecraft;
import net.xion.client.compat.Colors;
import net.xion.client.compat.Gfx;
import net.xion.client.compat.Ids;

import java.util.Random;

/**
 * The Xion backdrop, shared with the launcher: the same black hole, pre-rendered from the
 * launcher's shader into a seamless 40-frame loop (tools/render-blackhole.js). Neighbouring frames
 * are crossfaded so the disk turns smoothly at any frame rate. The frames are neutral ivory and
 * are tinted with the launcher theme here. The view breathes slowly and follows the mouse a
 * little, with a few close stars drifting in front for depth.
 */
public final class Scenery {
	private static final int FRAMES = 40, TW = 768, TH = 432;
	private static final float FRAME_SECONDS = 0.4f;
	private static final Object[] HOLE = new Object[FRAMES];
	private static final float[][] STARS = new float[36][];
	private static float px, py;
	private static long last;

	static {
		for (int i = 0; i < FRAMES; i++) HOLE[i] = Ids.of("xionclient", String.format("textures/gui/hole/f%02d.png", i));
		Random r = new Random(11);
		for (int i = 0; i < STARS.length; i++) STARS[i] = new float[]{r.nextFloat(), r.nextFloat(), r.nextFloat() * 6.28f, 0.4f + r.nextFloat() * 1.2f, 0.4f + r.nextFloat() * 0.6f};
	}

	private Scenery() {}

	public static void draw(Gfx g, float alpha) {
		int w = g.width(), h = g.height();
		Minecraft mc = Minecraft.getInstance();
		double mx = mc.mouseHandler.xpos() / Math.max(1, mc.getWindow().getScreenWidth()) - 0.5;
		double my = mc.mouseHandler.ypos() / Math.max(1, mc.getWindow().getScreenHeight()) - 0.5;
		long now = System.nanoTime();
		float dt = last == 0 ? 0 : Math.min(0.1f, (now - last) / 1e9f);
		last = now;
		// Critically damped follow, so the parallax glides instead of snapping to the cursor.
		float k = 1f - (float) Math.exp(-dt * 1.8f);
		px += (float) (mx - px) * k;
		py += (float) (my - py) * k;
		double t = now / 1e9;

		g.fill(0, 0, w, h, Colors.alpha(0xFF000000, alpha));

		// Cover the screen at 16:9, breathing very slightly and leaning away from the cursor.
		float base = Math.max(w, h * 16f / 9f);
		float s = 1.05f + 0.012f * (float) Math.sin(t / 9.0);
		float dw = base * s, dh = dw * 9f / 16f;
		float unit = w / 900f;
		float x = (w - dw) / 2f - px * 10 * unit;
		float y = (h - dh) / 2f - py * 6 * unit;
		double f = t / FRAME_SECONDS;
		int i = (int) (Math.floor(f) % FRAMES);
		float blend = (float) (f - Math.floor(f));
		// Ivory frames take the theme accent, softened so the disk stays luminous.
		int tint = Colors.lerp(0xFFFFFFFF, Colors.ACCENT, 0.55f);
		g.push();
		g.translate(x, y);
		g.scale(dw / TW);
		g.blit(HOLE[i], 0, 0, TW, TH, 0, 0, TW, TH, TW, TH, Colors.alpha(tint, alpha));
		g.blit(HOLE[(i + 1) % FRAMES], 0, 0, TW, TH, 0, 0, TW, TH, TW, TH, Colors.alpha(tint, alpha * blend));
		g.pop();

		stars(g, w, h, t, alpha);

		// Quiet the edges so menus read cleanly: darker at the top and bottom, and on the left.
		g.vGradient(0, 0, w, h / 5, Colors.alpha(0x99000000, alpha), 0x00000000);
		g.vGradient(0, h * 3 / 5, w, h - h * 3 / 5, 0x00000000, Colors.alpha(0xB8000000, alpha));
		g.hGradient(0, 0, w / 2, h, Colors.alpha(0x8C000000, alpha), 0x00000000);
	}

	/** Close stars that twinkle and drift with stronger parallax than the black hole behind them. */
	private static void stars(Gfx g, int w, int h, double t, float alpha) {
		g.push();
		g.scale(0.5f);
		int W = w * 2, H = h * 2;
		for (float[] st : STARS) {
			float a = (float) Math.pow(Math.abs(Math.sin(st[2] + t * st[3] * 0.6)), 3) * st[4] * alpha;
			if (a < 0.03f) continue;
			int x = (int) (st[0] * W - px * 34 * (w / 900f)), y = (int) (st[1] * H - py * 20 * (w / 900f));
			g.fill(x, y, x + 1, y + 1, Colors.alpha(0xFFF2EEE6, a));
		}
		g.pop();
	}
}
