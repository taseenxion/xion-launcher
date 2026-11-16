package net.xion.client.ui;

import net.minecraft.client.Minecraft;
import net.xion.client.compat.Colors;
import net.xion.client.compat.Compat;
import net.xion.client.compat.Gfx;
import net.xion.client.feature.XionAI;
import java.util.ArrayList;
import java.util.List;

/**
 * The XION AI tab: a small, animated chat window with typing bubbles, a pulsing assistant orb,
 * smooth scrolling and its own keyboard field (so it does not depend on vanilla widget APIs).
 */
final class AIPanel {
	// GLFW key values, kept as numbers because 26.x's unobfuscated compile classpath does not expose
	// LWJGL even though Minecraft still reports these exact values to screens.
	private static final int KEY_ENTER = 257, KEY_KP_ENTER = 335, KEY_BACKSPACE = 259, KEY_DELETE = 261;
	private static final int KEY_RIGHT = 262, KEY_LEFT = 263, KEY_PAGE_UP = 266, KEY_PAGE_DOWN = 267;
	private static final int KEY_HOME = 268, KEY_END = 269, KEY_V = 86;
	private static final int PAD = 9;
	private static final int BUBBLE_GAP = 5;
	private static final int CHIP_GAP = 5;
	private static final String[] SUGGESTIONS = {
		"Best Y level for diamonds?",
		"Starter base ideas",
		"How do I tame a wolf?",
		"Explain netherite gear"
	};

	private final StringBuilder input = new StringBuilder();
	private int caret;
	private boolean focused = true;
	private double targetScroll;
	private double smoothScroll;
	private double maxScroll;
	private long lastFrame;

	private int panelX, panelY, panelW, panelH;
	private int[] inputRect, sendRect, newRect, retryRect;
	private final List<int[]> suggestionRects = new ArrayList<>();
	private int lastCount = -1;

	private static final class Bubble {
		final boolean user;
		final boolean typing;
		final List<String> lines;
		final int w, h;
		final long at;

		Bubble(boolean user, boolean typing, List<String> lines, int w, int h, long at) {
			this.user = user;
			this.typing = typing;
			this.lines = lines;
			this.w = w;
			this.h = h;
			this.at = at;
		}
	}

	void draw(Gfx g, int x, int y, int w, int h, int mx, int my, float a) {
		XionAI.welcome();
		panelX = x;
		panelY = y;
		panelW = w;
		panelH = h;
		suggestionRects.clear();

		long now = System.currentTimeMillis();
		long ns = System.nanoTime();
		float dt = lastFrame == 0 ? 0.016f : Math.min(0.05f, (ns - lastFrame) / 1_000_000_000f);
		lastFrame = ns;

		int headH = 28;
		int inputH = 24;
		int inputY = y + h - inputH - 5;
		int statusY = inputY - 10;
		int chatTop = y + headH + 3;
		int chatBottom = statusY - 2;
		int innerW = Math.max(40, w - PAD * 2);

		// Panel surface and a slow aurora glow behind the conversation.
		g.pill(x, y, w, h, Colors.alpha(0xD20A0D13, a));
		g.pillOutline(x, y, w, h, Colors.alpha(0x18FFFFFF, a));
		float glow = (float) ((Math.sin(now / 2600.0) + 1) / 2);
		int glowColor = Colors.lerp(Colors.ACCENT, Colors.ACCENT_2, glow);
		g.vGradient(x + 4, y + headH, w - 8, Math.min(78, h / 3), Colors.alpha(glowColor, 0.07f * a), 0x00FFFFFF);

		List<XionAI.Msg> msgs = XionAI.messages();
		if (msgs.size() != lastCount) {
			lastCount = msgs.size();
			targetScroll = 0;
		}

		boolean showSuggestions = msgs.size() <= 1 && !XionAI.busy();
		int suggestionH = showSuggestions ? 45 : 0;
		int bubbleBottom = chatBottom - suggestionH;
		int chatH = Math.max(24, bubbleBottom - chatTop);

		List<Bubble> bubbles = new ArrayList<>();
		int maxBubble = Math.max(70, (int) (innerW * 0.82f) - 16);
		for (XionAI.Msg m : msgs) {
			List<String> lines = wrap(g, m.text, m.user ? Math.max(60, (int) (innerW * 0.72f) - 12) : maxBubble - 12);
			int lineW = 0;
			for (String line : lines) lineW = Math.max(lineW, g.font.width(line));
			int bw = Math.min(innerW - (m.user ? 6 : 20), lineW + 13);
			bw = Math.max(30, bw);
			int bh = Math.max(17, lines.size() * 10 + 8);
			bubbles.add(new Bubble(m.user, false, lines, bw, bh, m.at));
		}
		if (XionAI.busy()) bubbles.add(new Bubble(false, true, List.of(), 47, 22, now - 320));

		int total = 0;
		for (Bubble b : bubbles) total += b.h + BUBBLE_GAP;
		if (total > 0) total -= BUBBLE_GAP;
		maxScroll = Math.max(0, total - chatH);
		targetScroll = clamp(targetScroll, 0, maxScroll);
		smoothScroll += (targetScroll - smoothScroll) * Math.min(1f, dt * 14f);
		if (Math.abs(targetScroll - smoothScroll) < 0.4) smoothScroll = targetScroll;

		int by = bubbleBottom - total + (int) Math.round(smoothScroll);
		g.scissor(x + 1, chatTop, x + w - 1, bubbleBottom);
		for (Bubble b : bubbles) {
			if (by + b.h >= chatTop - 20 && by <= bubbleBottom + 20) drawBubble(g, x, w, by, b, now, a);
			by += b.h + BUBBLE_GAP;
		}
		g.endScissor();

		if (showSuggestions) drawSuggestions(g, x, w, chatBottom - suggestionH + 2, mx, my, now, a);

		// Header is painted after the messages so tall bubbles slide underneath it cleanly.
		drawHeader(g, x, y, w, headH, mx, my, now, a, msgs.size());

		// Composer and the thin status strip above it.
		drawStatus(g, x, y, w, statusY, mx, my, now, a);
		drawComposer(g, x, y, w, inputY, inputH, mx, my, now, a);
	}

	private void drawHeader(Gfx g, int x, int y, int w, int headH, int mx, int my, long now, float a, int count) {
		g.fill(x, y, x + w, y + headH, Colors.alpha(0xF20A0D13, a));
		g.fill(x + 1, y + headH - 1, x + w - 1, y + headH, Colors.alpha(0x1EFFFFFF, a));
		float t = (float) ((Math.sin(now / 1700.0) + 1) / 2);
		g.hGradient(x + 9, y + headH - 1, w - 18, 1, Colors.alpha(Colors.ACCENT, 0.05f * a),
			Colors.alpha(Colors.lerp(Colors.ACCENT, Colors.ACCENT_2, t), 0.75f * a));

		int lx = x + 10, ly = y + 7;
		int orb = Colors.lerp(Colors.ACCENT, Colors.ACCENT_2, t);
		g.pill(lx, ly, 14, 14, Colors.alpha(orb, 0.2f * a));
		g.pill(lx + 2, ly + 2, 10, 10, Colors.alpha(orb, 0.9f * a));
		g.fill(lx + 6, ly + 4, lx + 7, ly + 10, Colors.alpha(0xFFFFFFFF, a));
		g.fill(lx + 4, ly + 6, lx + 9, ly + 7, Colors.alpha(0xFFFFFFFF, a));

		g.scaledText("XION AI", lx + 20, ly + 1, 1.15f, Colors.alpha(Colors.TEXT, a), true);
		if (w > 300) {
			int tw = (int) (g.font.width("XION AI") * 1.15f);
			g.text("Ask anything", lx + 20 + tw + 8, ly + 4, Colors.alpha(Colors.MUTED, a), false);
		}

		int nw = 38;
		newRect = new int[]{x + w - PAD - nw, y + 7, nw, 14};
		boolean overNew = inside(newRect, mx, my);
		boolean canNew = count > 1;
		g.pill(newRect[0], newRect[1], nw, 14, Colors.alpha(overNew && canNew ? Colors.CARD_HOVER : Colors.CARD, a));
		g.pillOutline(newRect[0], newRect[1], nw, 14, Colors.alpha(0x18FFFFFF, a));
		g.text("New", newRect[0] + 9, newRect[1] + 3, Colors.alpha(canNew ? Colors.MUTED : 0xFF454C5A, a), false);

		int dx = newRect[0] - 11, dy = y + 13;
		float pulse = (float) ((Math.sin(now / 420.0) + 1) / 2);
		int live = XionAI.busy() ? Colors.GOLD : Colors.OK;
		g.pill(dx - 2, dy - 2, 6, 6, Colors.alpha(live, 0.16f * a));
		g.rounded(dx, dy, 3, 3, Colors.alpha(live, (0.55f + 0.45f * pulse) * a));
	}

	private void drawBubble(Gfx g, int x, int w, int y, Bubble b, long now, float a) {
		float t = Math.min(1f, (now - b.at) / 320f);
		float e = t * t * (3f - 2f * t);
		if (e <= 0f) return;
		int bx = b.user ? x + w - PAD - b.w : x + PAD + 15;
		int by = y + Math.round((1f - e) * 6f);
		float alpha = a * e;

		if (b.user) {
			g.pill(bx, by, b.w, b.h, Colors.alpha(Colors.lerp(Colors.CARD, Colors.ACCENT, 0.24f), alpha));
			g.pillOutline(bx, by, b.w, b.h, Colors.alpha(Colors.ACCENT, 0.42f * alpha));
		} else {
			g.pill(bx, by, b.w, b.h, Colors.alpha(Colors.CARD, alpha));
			g.pillOutline(bx, by, b.w, b.h, Colors.alpha(0x1FFFFFFF, alpha));
			g.fill(bx, by + 4, bx + 1, by + b.h - 4, Colors.alpha(Colors.ACCENT, 0.72f * alpha));
			drawOrb(g, x + PAD + 1, by + 3, alpha, now);
		}

		if (b.typing) {
			float base = (now % 1200) / 1200f;
			for (int i = 0; i < 3; i++) {
				float p = (float) ((Math.sin((base * 3f + i * 0.22f) * Math.PI * 2f) + 1) / 2);
				int d = (int) Math.round(p * 2f);
				g.rounded(bx + 9 + i * 9, by + 8 - d, 4, 4, Colors.alpha(Colors.lerp(Colors.MUTED, Colors.ACCENT, p), alpha));
			}
			return;
		}

		int cx = bx + 7;
		for (int i = 0; i < b.lines.size(); i++) {
			g.text(b.lines.get(i), cx, by + 5 + i * 10, Colors.alpha(b.user ? 0xFFF4F7FF : Colors.TEXT, alpha), false);
		}
	}

	private void drawOrb(Gfx g, int x, int y, float a, long now) {
		float t = (float) ((Math.sin(now / 780.0) + 1) / 2);
		int c = Colors.lerp(Colors.ACCENT, Colors.ACCENT_2, t);
		g.pill(x, y, 12, 12, Colors.alpha(c, 0.18f * a));
		g.pill(x + 2, y + 2, 8, 8, Colors.alpha(c, 0.92f * a));
		g.fill(x + 5, y + 3, x + 6, y + 9, Colors.alpha(0xFFFFFFFF, a));
		g.fill(x + 3, y + 5, x + 8, y + 6, Colors.alpha(0xFFFFFFFF, a));
	}

	private void drawSuggestions(Gfx g, int x, int w, int top, int mx, int my, long now, float a) {
		int innerW = w - PAD * 2;
		int cw = (innerW - CHIP_GAP) / 2;
		int ch = 19;
		for (int i = 0; i < SUGGESTIONS.length; i++) {
			int col = i % 2, row = i / 2;
			int cx = x + PAD + col * (cw + CHIP_GAP);
			int cy = top + row * (ch + 4);
			int[] r = {cx, cy, cw, ch, i};
			suggestionRects.add(r);
			boolean over = inside(r, mx, my);
			float shimmer = (float) ((Math.sin(now / 700.0 + i) + 1) / 2);
			g.pill(cx, cy, cw, ch, Colors.alpha(over ? Colors.CARD_HOVER : Colors.CARD, a));
			g.pillOutline(cx, cy, cw, ch, Colors.alpha(Colors.ACCENT, (over ? 0.55f : 0.16f + 0.08f * shimmer) * a));
			g.text(g.font.plainSubstrByWidth(SUGGESTIONS[i], cw - 12), cx + 6, cy + 5,
				Colors.alpha(over ? Colors.TEXT : Colors.MUTED, a), false);
		}
	}

	private void drawStatus(Gfx g, int x, int y, int w, int statusY, int mx, int my, long now, float a) {
		retryRect = null;
		int innerW = w - PAD * 2;
		String status = XionAI.status();
		if (XionAI.busy()) {
			int dots = (int) ((now / 380) % 4);
			String s = "XION AI is thinking" + ".".repeat(dots);
			g.text(s, x + PAD, statusY + 1, Colors.alpha(Colors.MUTED, a), false);
			return;
		}
		if (status != null && !status.isEmpty()) {
			String shown = g.font.plainSubstrByWidth(status, Math.max(30, innerW - 40));
			g.text(shown, x + PAD, statusY + 1, Colors.alpha(Colors.BAD, a), false);
			retryRect = new int[]{x + w - PAD - 34, statusY - 1, 34, 12};
			boolean over = inside(retryRect, mx, my);
			g.pill(retryRect[0], retryRect[1], 34, 12, Colors.alpha(over ? Colors.CARD_HOVER : Colors.CARD, a));
			g.text("Retry", retryRect[0] + 5, retryRect[1] + 2, Colors.alpha(Colors.ACCENT, a), false);
			return;
		}
		String hint = g.font.plainSubstrByWidth("Enter to send  ·  Ctrl+V pastes  ·  New starts over", innerW);
		g.text(hint, x + PAD, statusY + 1, Colors.alpha(Colors.MUTED, a), false);
	}

	private void drawComposer(Gfx g, int x, int y, int w, int inputY, int inputH, int mx, int my, long now, float a) {
		int sendW = 24;
		int gap = 6;
		inputRect = new int[]{x + PAD, inputY, w - PAD * 2 - sendW - gap, inputH};
		sendRect = new int[]{x + w - PAD - sendW, inputY, sendW, inputH};

		boolean overInput = inside(inputRect, mx, my);
		g.pill(inputRect[0], inputRect[1], inputRect[2], inputH,
			Colors.alpha(focused || overInput ? Colors.CARD_HOVER : Colors.CARD, a));
		g.pillOutline(inputRect[0], inputRect[1], inputRect[2], inputH,
			Colors.alpha(focused ? Colors.ACCENT : 0x1FFFFFFF, (focused ? 0.8f : 0.22f) * a));

		int tx = inputRect[0] + 7, ty = inputY + 8;
		int textW = inputRect[2] - 14;
		if (input.length() == 0) {
			g.text("Ask XION AI anything…", tx, ty, Colors.alpha(Colors.MUTED, a), false);
		} else {
			int start = 0;
			while (start < caret && g.font.width(input.substring(0, caret)) - g.font.width(input.substring(0, start)) > textW) start++;
			String visible = g.font.plainSubstrByWidth(input.substring(start), textW);
			g.text(visible, tx, ty, Colors.alpha(Colors.TEXT, a), false);
			if (focused && (now / 500) % 2 == 0) {
				int cx = Math.min(tx + textW - 1, tx + g.font.width(input.substring(start, caret)));
				g.fill(cx, inputY + 6, cx + 1, inputY + inputH - 6, Colors.alpha(Colors.ACCENT, a));
			}
		}

		boolean can = input.length() > 0 && !XionAI.busy();
		boolean overSend = inside(sendRect, mx, my);
		int sbg = can ? (overSend ? Colors.lerp(Colors.ACCENT, 0xFFFFFFFF, 0.18f) : Colors.ACCENT) : 0xFF232937;
		g.pill(sendRect[0], sendRect[1], sendW, inputH, Colors.alpha(sbg, a));
		int col = Colors.alpha(can ? Colors.ON_PILL : Colors.MUTED, a);
		int ax = sendRect[0] + 7, ay = inputY + inputH / 2;
		for (int i = 0; i < 9; i++) g.fill(ax + i, ay, ax + i + 1, ay + 1, col);
		for (int i = 0; i < 4; i++) {
			g.fill(ax + 5 + i, ay - i - 1, ax + 6 + i, ay - i, col);
			g.fill(ax + 5 + i, ay + i + 1, ax + 6 + i, ay + i + 2, col);
		}
	}

	/** Wheel: positive amount scrolls up (away from the newest message). */
	void scroll(double mx, double my, double amount) {
		if (mx < panelX || mx >= panelX + panelW || my < panelY || my >= panelY + panelH) return;
		targetScroll = clamp(targetScroll + amount * 24, 0, maxScroll);
	}

	boolean click(double mx, double my, int button) {
		if (button != 0) return false;
		if (mx < panelX || mx >= panelX + panelW || my < panelY || my >= panelY + panelH) return false;

		if (newRect != null && inside(newRect, mx, my)) {
			clear();
			return true;
		}
		if (sendRect != null && inside(sendRect, mx, my)) {
			send();
			return true;
		}
		if (retryRect != null && inside(retryRect, mx, my)) {
			XionAI.retry();
			targetScroll = 0;
			Compat.click();
			return true;
		}
		for (int[] r : suggestionRects) {
			if (inside(r, mx, my)) {
				String text = SUGGESTIONS[r[4]];
				if (XionAI.ask(text)) {
					input.setLength(0);
					caret = 0;
					targetScroll = 0;
					Compat.click();
				}
				return true;
			}
		}
		focused = true;
		if (inputRect != null && inside(inputRect, mx, my)) caret = input.length();
		return true;
	}

	boolean key(int keyCode, int scanCode, int modifiers) {
		boolean ctrl = (modifiers & 2) != 0 || (modifiers & 192) != 0;
		switch (keyCode) {
			case KEY_ENTER, KEY_KP_ENTER -> {
				send();
				return true;
			}
			case KEY_BACKSPACE -> {
				backspace(ctrl);
				return true;
			}
			case KEY_DELETE -> {
				delete(ctrl);
				return true;
			}
			case KEY_LEFT -> {
				move(-1, ctrl);
				return true;
			}
			case KEY_RIGHT -> {
				move(1, ctrl);
				return true;
			}
			case KEY_HOME -> {
				caret = 0;
				return true;
			}
			case KEY_END -> {
				caret = input.length();
				return true;
			}
			case KEY_V -> {
				if (ctrl) {
					paste();
					return true;
				}
				return false;
			}
			case KEY_PAGE_UP -> {
				targetScroll = clamp(targetScroll + 70, 0, maxScroll);
				return true;
			}
			case KEY_PAGE_DOWN -> {
				targetScroll = clamp(targetScroll - 70, 0, maxScroll);
				return true;
			}
			default -> {
				return false;
			}
		}
	}

	boolean character(char c, int modifiers) {
		if (!focused) return false;
		if (c < 32 || c == 127 || c == 167) return false;
		if (input.length() >= 600) return true;
		input.insert(caret, c);
		caret++;
		return true;
	}

	private void send() {
		String text = input.toString().trim();
		if (text.isEmpty()) return;
		if (XionAI.ask(text)) {
			input.setLength(0);
			caret = 0;
			targetScroll = 0;
			Compat.click();
		}
	}

	private void clear() {
		XionAI.reset();
		input.setLength(0);
		caret = 0;
		targetScroll = 0;
		smoothScroll = 0;
		lastCount = -1;
		Compat.click();
	}

	private void backspace(boolean word) {
		if (caret == 0) return;
		int start = caret;
		if (word) {
			while (start > 0 && input.charAt(start - 1) == ' ') start--;
			while (start > 0 && input.charAt(start - 1) != ' ') start--;
		} else {
			start--;
		}
		input.delete(start, caret);
		caret = start;
	}

	private void delete(boolean word) {
		if (caret >= input.length()) return;
		int end = caret;
		if (word) {
			while (end < input.length() && input.charAt(end) == ' ') end++;
			while (end < input.length() && input.charAt(end) != ' ') end++;
		} else {
			end++;
		}
		input.delete(caret, end);
	}

	private void move(int dir, boolean word) {
		if (dir < 0) {
			if (word) {
				while (caret > 0 && input.charAt(caret - 1) == ' ') caret--;
				while (caret > 0 && input.charAt(caret - 1) != ' ') caret--;
			} else if (caret > 0) {
				caret--;
			}
		} else {
			if (word) {
				while (caret < input.length() && input.charAt(caret) == ' ') caret++;
				while (caret < input.length() && input.charAt(caret) != ' ') caret++;
			} else if (caret < input.length()) {
				caret++;
			}
		}
	}

	private void paste() {
		String clip = clipboard();
		if (clip == null || clip.isEmpty()) return;
		String clean = clip.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').replaceAll("\\p{Cntrl}", "");
		int room = 600 - input.length();
		if (room <= 0) return;
		if (clean.length() > room) clean = clean.substring(0, room);
		input.insert(caret, clean);
		caret += clean.length();
	}

	/** Reads the clipboard through Minecraft so it works on Windows, Linux and macOS. */
	private static String clipboard() {
		try {
			String value = Minecraft.getInstance().keyboardHandler.getClipboard();
			return value == null ? "" : value;
		} catch (Throwable ignored) {
			return "";
		}
	}

	private static List<String> wrap(Gfx g, String text, int width) {
		List<String> out = new ArrayList<>();
		if (width < 12) width = 12;
		if (text == null || text.isEmpty()) {
			out.add("");
			return out;
		}
		for (String para : text.split("\n", -1)) {
			if (para.isEmpty()) {
				out.add("");
				continue;
			}
			String line = "";
			for (String word : para.trim().split("\\s+")) {
				while (g.font.width(word) > width && word.length() > 1) {
					int n = word.length();
					while (n > 1 && g.font.width(word.substring(0, n)) > width) n--;
					if (!line.isEmpty()) {
						out.add(line);
						line = "";
					}
					out.add(word.substring(0, n));
					word = word.substring(n);
				}
				String candidate = line.isEmpty() ? word : line + " " + word;
				if (g.font.width(candidate) <= width) {
					line = candidate;
				} else {
					if (!line.isEmpty()) out.add(line);
					line = word;
				}
			}
			if (!line.isEmpty()) out.add(line);
		}
		if (out.isEmpty()) out.add("");
		return out;
	}

	private static boolean inside(int[] r, double mx, double my) {
		return r != null && mx >= r[0] && mx < r[0] + r[2] && my >= r[1] && my < r[1] + r[3];
	}

	private static double clamp(double v, double min, double max) {
		return Math.max(min, Math.min(max, v));
	}
}
