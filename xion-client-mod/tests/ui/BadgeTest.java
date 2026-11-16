package net.xion.client.feature;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.xion.client.XionConfig;
import net.xion.client.compat.Compat;
import java.util.UUID;

public class BadgeTest {
	private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
	private static int badges(Component c) {
		return (int) c.getString().chars().filter(v -> (v >= 0xE7A0 && v <= 0xE7A8) || (v >= 0xE7B0 && v <= 0xE7CF)).count();
	}
	public static void main(String[] args) {
		for (int i = 0; i < 16; i++) {
			check(Badge.glyphAt(false, i * 140L).charAt(0) == 0xE7B0 + i, "Free animation frame");
			check(Badge.glyphAt(true, i * 140L).charAt(0) == 0xE7C0 + i, "Premium animation frame");
		}
		check(Badge.glyphAt(false, 2240).equals(Badge.glyphAt(false, 0)), "Animation loop");
		Component original = Compat.lit("[VIP] ").setStyle(Style.EMPTY.withColor(0x55FF55).withBold(true)).append(Compat.lit("Player"));
		Component badge = Badge.prefix(original);
		check(badges(badge) == 1 && badge.getString().endsWith("[VIP] Player"), "Badge prefix");
		check(badge.getSiblings().get(0) == original, "Server name component replaced");
		check(original.getStyle().color == 0x55FF55 && original.getStyle().bold, "Server rank style changed");
		char stale = '\uE7A0';
		Component cached = Compat.lit(stale + " ").append(original);
		Component updated = Badge.prefix(cached);
		check(updated.getString().charAt(0) != stale && badges(updated) == 1, "Cached badge frame did not refresh");
		check(updated.getSiblings().get(0) == original, "Cached frame lost rich name styling");
		Component nested = Compat.lit("").append(cached);
		check(badges(Badge.prefix(nested)) == 1, "Nested wrapper duplicated badge");
		Component legacy = Compat.lit("\uE7A0 [VIP] ").setStyle(original.getStyle()).append(Compat.lit("Player"));
		Component migrated = Badge.prefix(legacy);
		check(badges(migrated) == 1 && migrated.getString().endsWith("[VIP] Player"), "Legacy frame lost rank text");
		check(Badge.prefix(null) == null, "Null name");
		UUID self = UUID.randomUUID(), remote = UUID.randomUUID();
		Minecraft.getInstance().player = new Minecraft.TestPlayer(self);
		check(Badge.shows(self), "Free self badge hidden");
		Presence.online.put(remote, true);
		check(Badge.shows(remote), "Remote Xion player hidden");
		check(Badge.prefix(original, remote).getString().charAt(0) >= 0xE7C0, "Remote premium tier lost");
		Premium.enabled = true;
		check(Badge.prefix(original, self).getString().charAt(0) >= 0xE7C0, "Own premium tier lost");
		XionConfig.data.badge = false;
		check(!Badge.shows(self) && !Badge.shows(remote), "Badge privacy toggle ignored");
		System.out.println("PASS: free/premium animation, cached frames, legacy migration, rich name styles, presence and privacy");
	}
}
