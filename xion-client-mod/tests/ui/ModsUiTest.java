package net.xion.client.ui;

public class ModsUiTest {
	private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
	public static void main(String[] args) {
		for (int width : new int[]{180, 220, 360, 419, 420, 492, 600, 720}) {
			int card = ModsLayout.cardWidth(width), cols = ModsLayout.columns(width);
			check(cols * card + (cols - 1) * ModsLayout.GAP <= width, "Grid overflow");
			for (int x : new int[]{0, 110, 400, 900, 1700}) {
				ModsLayout.Controls c = ModsLayout.controls(x, 80, card);
				for (ModsLayout.Rect r : new ModsLayout.Rect[]{c.toggle(), c.settings()}) {
					check(r.w() > 0 && r.h() > 0, "Negative control size at screen x=" + x);
					check(r.x() >= x && r.x() + r.w() <= x + card, "Control escapes card");
					check(r.y() >= 80 && r.y() + r.h() <= 80 + ModsLayout.CARD, "Control escapes vertically");
					check(r.contains(r.x() + r.w() / 2.0, r.y() + r.h() / 2.0), "Visible control not clickable");
					check(!r.contains(r.x() + r.w(), r.y()), "Hit test crosses neighboring control");
				}
			}
		}
		SearchInput input = new SearchInput();
		input.insert("Sodium Extra");
		input.key(65, 2);
		check(input.selection().equals("Sodium Extra"), "Select all");
		input.insert("Iris");
		check(input.value().equals("Iris"), "Replacement paste");
		input.key(263, 0);
		input.insert("o");
		check(input.value().equals("Irios"), "Caret insertion");
		input.key(259, 0);
		check(input.value().equals("Iris"), "Backspace");
		input.key(268, 0);
		input.key(261, 0);
		check(input.value().equals("ris"), "Forward deletion");
		input.clear();
		input.insert("mods 🎮 中文");
		input.focusEnd();
		input.key(259, 0);
		check(input.value().equals("mods 🎮 中"), "Unicode character deletion");
		input.key(259, 2);
		check(input.value().equals("mods 🎮 "), "Word deletion");
		input.clear();
		input.insert("x".repeat(80));
		check(input.value().length() == 64, "Bounded search input");
		input.selectAll();
		input.insert("§aSodium\u0000");
		check(!input.value().contains("§") && !input.value().contains("\u0000"), "Formatting/control injection");
		System.out.println("PASS: responsive card geometry, positive Settings widths, hit tests, search editing and Unicode limits");
	}
}
