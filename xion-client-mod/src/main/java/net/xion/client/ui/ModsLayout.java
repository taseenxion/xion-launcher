package net.xion.client.ui;

/** Shared drawing/hit-test geometry. All control widths are local, never absolute coordinates. */
final class ModsLayout {
	static final int HEADER = 78, FOOTER = 22, CARD = 88, GAP = 8, SECTION = 22;

	record Rect(int x, int y, int w, int h) {
		boolean contains(double mx, double my) {
			return mx >= x && mx < x + w && my >= y && my < y + h;
		}
	}

	record Controls(Rect card, Rect toggle, Rect settings) {}

	static int columns(int width) {
		return width >= 420 ? 2 : 1;
	}

	static int cardWidth(int width) {
		int cols = columns(width);
		return (width - (cols - 1) * GAP) / cols;
	}

	static Controls controls(int x, int y, int width) {
		return new Controls(new Rect(x, y, width, CARD), new Rect(x + width - 36, y + 12, 24, 12),
			new Rect(x + width - 88, y + CARD - 28, 76, 18));
	}
}
