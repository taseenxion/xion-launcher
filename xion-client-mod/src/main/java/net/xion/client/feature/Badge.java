package net.xion.client.feature;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.xion.client.XionConfig;
import net.xion.client.compat.Compat;

import java.util.UUID;

/**
 * Animated Xion shield badges beside player names: blue for free players, crowned gold for Xion+.
 * Frames are preloaded bitmap-font glyphs, not per-frame texture uploads. Every frame has the same
 * advance so names never jump sideways. The old glyphs remain recognized for compatibility.
 */
public final class Badge {
	public static final String GLYPH = "";
	private static final char FREE_FIRST = '\uE7B0', PRO_FIRST = '\uE7C0';
	private static final int FRAMES = 16;
	private static final long FRAME_MS = 140L;
	private static final String[] FREE = frames(FREE_FIRST), PRO = frames(PRO_FIRST);
	private static final Style BADGE_STYLE = Style.EMPTY.withColor(0xFFFFFF).withBold(false).withItalic(false).withObfuscated(false);

	/** Both free and premium badges animate. Only the appearance differs by entitlement. */
	public static String glyph() {
		return glyph(Premium.active());
	}

	public static String glyph(boolean pro) {
		return glyphAt(pro, System.currentTimeMillis());
	}

	static String glyphAt(boolean pro, long time) {
		int frame = (int) Math.floorMod(time / FRAME_MS, FRAMES);
		return (pro ? PRO : FREE)[frame];
	}

	private static String[] frames(char first) {
		String[] out = new String[FRAMES];
		for (int i = 0; i < FRAMES; i++) out[i] = String.valueOf((char) (first + i));
		return out;
	}

	private Badge() {}

	public static boolean isSelf(UUID id) {
		Minecraft mc = Minecraft.getInstance();
		return XionConfig.data.badge && id != null && mc.player != null && id.equals(mc.player.getUUID());
	}

	/** Your own badge, or another Xion Client player's (seen through the presence service). */
	public static boolean shows(UUID id) {
		return isSelf(id) || (XionConfig.data.badge && Presence.has(id));
	}

	private static boolean hasBadge(String s) {
		if (s.isEmpty()) return false;
		char c = s.charAt(0);
		return (c >= '\uE7A0' && c <= '\uE7A8') || (c >= FREE_FIRST && c < FREE_FIRST + FRAMES)
			|| (c >= PRO_FIRST && c < PRO_FIRST + FRAMES);
	}

	public static Component prefix(Component name) {
		return withGlyph(name, glyph());
	}

	/** Prefixes a player's name, retaining the server's original ranks, colors and hover styling. */
	public static Component prefix(Component name, UUID id) {
		boolean pro = isSelf(id) ? Premium.active() : Presence.pro(id);
		return withGlyph(name, glyph(pro));
	}

	private static Component withGlyph(Component name, String glyph) {
		if (name == null) return null;
		String text = name.getString();
		if (hasBadge(text)) {
			if (text.charAt(0) == glyph.charAt(0)) return name;
			// Refresh our own wrapper instead of freezing a cached frame or stacking a second badge.
			int rootLength = text.length();
			for (Component sibling : name.getSiblings()) rootLength -= sibling.getString().length();
			if (rootLength == 2 && text.charAt(1) == ' ') {
				var updated = Compat.lit(glyph + " ").setStyle(BADGE_STYLE);
				for (Component sibling : name.getSiblings()) updated.append(sibling);
				return updated;
			}
			if (rootLength == 0 && !name.getSiblings().isEmpty()) {
				var updated = Compat.lit("").setStyle(name.getStyle());
				updated.append(withGlyph(name.getSiblings().get(0), glyph));
				for (int i = 1; i < name.getSiblings().size(); i++) updated.append(name.getSiblings().get(i));
				return updated;
			}
			if (rootLength > 0) {
				var clean = Compat.lit(text.substring(1, rootLength).stripLeading()).setStyle(name.getStyle());
				for (Component sibling : name.getSiblings()) clean.append(sibling);
				name = clean;
			}
		}
		return Compat.lit(glyph + " ").setStyle(BADGE_STYLE).append(name);
	}
}
