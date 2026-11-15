package net.xion.client.ui;

import net.xion.client.XionConfig;
import net.xion.client.compat.Colors;
import net.xion.client.compat.Compat;
import net.xion.client.compat.Gfx;
import net.xion.client.feature.Crosshair;
import net.xion.client.feature.Premium;

import java.util.function.Consumer;

/** "Crosshair" tab of the Xion menu (Xion+ only): the custom crosshair editor. */
final class CrosshairPanel {
	private static final int SW = 12, SGAP = 4;
	private int swX, swY, pvX, pvY;
	private XButton styleBtn, sizeBtn, outlineBtn;

	void layout(Consumer<XButton> add, int x, int y, int w) {
		int bx = x, by = y + 46, bw = (w - 70) / 2 - 3;
		styleBtn = new XButton(bx, by, bw, 18, "", XButton.Style.SLAB, () -> {
			XionConfig.data.crosshairStyle = (XionConfig.data.crosshairStyle + 1) % Crosshair.STYLES.length;
			refresh();
		});
		sizeBtn = new XButton(bx + bw + 6, by, bw, 18, "", XButton.Style.SLAB, () -> {
			float s = XionConfig.data.crosshairSize + 0.25f;
			XionConfig.data.crosshairSize = s > 2f ? 0.5f : s;
			refresh();
		});
		outlineBtn = new XButton(bx, by + 24, bw * 2 + 6, 18, "", XButton.Style.SLAB, () -> {
			XionConfig.data.crosshairOutline = !XionConfig.data.crosshairOutline;
			refresh();
		});
		add.accept(styleBtn);
		add.accept(sizeBtn);
		add.accept(outlineBtn);
		swX = bx;
		swY = by + 58;
		pvX = x + w - 34;
		pvY = by + 22;
		refresh();
	}

	private void refresh() {
		styleBtn.label = "Style: " + Crosshair.STYLES[XionConfig.data.crosshairStyle];
		sizeBtn.label = "Size " + Math.round(XionConfig.data.crosshairSize * 100) + "%";
		outlineBtn.label = XionConfig.data.crosshairOutline ? "Dark outline: on" : "Dark outline: off";
		XionConfig.save();
	}

	void draw(Gfx g, int x, int y, int w, float a) {
		String who = Premium.owner().isEmpty() ? "Xion Premium active" : "Xion Premium  ·  " + Premium.owner();
		g.text(g.font.plainSubstrByWidth(who, w), x, y + 2, Colors.alpha(Colors.GOLD, a), false);
		g.text("Thanks for supporting Xion!", x, y + 14, Colors.alpha(Colors.MUTED, a), false);
		g.text("Custom crosshair", x, y + 34, Colors.alpha(Colors.TEXT, a), false);

		// live preview on a fake sky
		g.pill(pvX - 26, pvY - 26, 52, 52, Colors.alpha(0xFF3A5A8A, a));
		g.pill(pvX - 26, pvY + 6, 52, 20, Colors.alpha(0xFF3B6B2E, a));
		int style = XionConfig.data.crosshairStyle;
		if (style == 0) g.text("+", pvX - 2, pvY - 4, Colors.alpha(0xFFFFFFFF, a), false);
		else Crosshair.draw(g, pvX, pvY, style, XionConfig.data.crosshairColor, XionConfig.data.crosshairSize, XionConfig.data.crosshairOutline);

		g.text("Colour", swX, swY - 10, Colors.alpha(Colors.MUTED, a), false);
		for (int i = 0; i < Crosshair.SWATCHES.length; i++) {
			int sx = swX + i * (SW + SGAP);
			int c = Crosshair.SWATCHES[i];
			if (c == XionConfig.data.crosshairColor) g.pillOutline(sx - 2, swY - 2, SW + 4, SW + 4, Colors.alpha(0xFFFFFFFF, a));
			g.pill(sx, swY, SW, SW, Colors.alpha(c, a));
		}
	}

	boolean click(double mx, double my, int button) {
		if (my < swY || my > swY + SW) return false;
		int i = (int) ((mx - swX) / (SW + SGAP));
		if (i < 0 || i >= Crosshair.SWATCHES.length || mx - swX - i * (SW + SGAP) > SW) return false;
		XionConfig.data.crosshairColor = Crosshair.SWATCHES[i];
		XionConfig.save();
		Compat.click();
		return true;
	}
}
