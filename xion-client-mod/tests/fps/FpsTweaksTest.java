package net.xion.client.ui;

import net.minecraft.client.CloudStatus;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.xion.client.XionConfig;
import net.xion.client.feature.FpsTweaks;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

/** Regression tests against a tiny Options stub; no game window or accounts are needed. */
public class FpsTweaksTest {
	private static Minecraft fresh() throws Exception {
		Field applied = FpsTweaks.class.getDeclaredField("applied");
		applied.setAccessible(true);
		applied.set(null, null);
		try {
			Field restore = FpsTweaks.class.getDeclaredField("restore");
			restore.setAccessible(true);
			((Map<?, ?>) restore.get(null)).clear();
		} catch (NoSuchFieldException ignored) {
			// Allows running the same regression against a previous release with --ref.
		}
		XionConfig.data = new XionConfig.Data();
		return new Minecraft(new Options());
	}

	private static void check(boolean ok, String message) {
		if (!ok) throw new AssertionError(message);
	}

	private static String capLabel() throws Exception {
		Method method = FpsPanel.class.getDeclaredMethod("capLabel");
		method.setAccessible(true);
		return (String) method.invoke(null);
	}

	private static void clickCap(FpsPanel panel) throws Exception {
		Field field = FpsPanel.class.getDeclaredField("rows");
		field.setAccessible(true);
		int rows = ((List<?>) field.get(panel)).size();
		check(panel.click(10, 34 + rows * 26 + 5, 0, 0, 300, 0), "FPS selector click not consumed");
	}

	private static void qualityUnchanged(Options o, String before) {
		check(before.equals(o.quality()), "Changing FPS reset unrelated graphics: " + before + " -> " + o.quality());
	}

	public static void main(String[] args) throws Exception {
		Minecraft mc = fresh();
		Options o = mc.options;
		String quality = o.quality();
		XionConfig.data.fpsUnlimited = true;
		XionConfig.data.fpsCap = 60;
		FpsTweaks.tick(mc);
		check(!o.enableVsync, "Unlimited FPS left VSync ON (causes a 60 Hz / 60 FPS lock)");
		check(o.framerateLimit == 260, "Unlimited checkbox did not override the finite cap");
		qualityUnchanged(o, quality);
		int writes = o.writes, saves = o.saves;
		for (int i = 0; i < 100; i++) FpsTweaks.tick(mc);
		FpsTweaks.refresh();
		FpsTweaks.tick(mc);
		check(o.writes == writes && o.saves == saves, "Unchanged ticks repeatedly rewrote options");

		mc = fresh();
		o = mc.options;
		quality = o.quality();
		XionConfig.data.fpsCap = 260;
		FpsTweaks.tick(mc);
		check(!o.enableVsync && o.framerateLimit == 260, "Unlimited in the cap selector left another limiter active");
		qualityUnchanged(o, quality);

		mc = fresh();
		o = mc.options;
		o.enableVsync = false;
		quality = o.quality();
		XionConfig.data.fpsCap = 144;
		FpsTweaks.tick(mc);
		check(o.framerateLimit == 144 && !o.enableVsync, "A finite cap re-enabled VSync");
		qualityUnchanged(o, quality);

		mc = fresh();
		o = mc.options;
		o.enableVsync = false;
		o.framerateLimit = 260;
		o.renderClouds = CloudStatus.FAST;
		XionConfig.data.fpsNoClouds = true;
		FpsTweaks.tick(mc);
		check(o.renderClouds == CloudStatus.OFF && !o.enableVsync && o.framerateLimit == 260,
			"A clouds toggle overrode the game's FPS/VSync choice");
		XionConfig.data.fpsNoClouds = false;
		FpsTweaks.tick(mc);
		check(o.renderClouds == CloudStatus.FAST, "Turning off a tweak did not restore the player's previous choice");
		check(!o.enableVsync && o.framerateLimit == 260, "Restoring clouds changed frame limits");

		mc = fresh();
		o = mc.options;
		o.renderDistance = 17;
		o.simulationDistance = 9;
		o.mipmapLevels = 2;
		XionConfig.data.fpsLowRenderDistance = true;
		XionConfig.data.fpsLowSimDistance = true;
		XionConfig.data.fpsNoMipmap = true;
		FpsTweaks.tick(mc);
		check(o.renderDistance == 6 && o.simulationDistance == 5 && o.mipmapLevels == 0, "Speed overrides not applied");
		XionConfig.data.fpsLowRenderDistance = false;
		XionConfig.data.fpsLowSimDistance = false;
		XionConfig.data.fpsNoMipmap = false;
		FpsTweaks.tick(mc);
		check(o.renderDistance == 17 && o.simulationDistance == 9 && o.mipmapLevels == 2, "Original video choices were not restored");

		mc = fresh();
		o = mc.options;
		quality = o.quality();
		FpsTweaks.tick(mc);
		check(o.saves == 0 && o.writes == 0, "Disabled FPS tweaks still rewrote the game options");
		qualityUnchanged(o, quality);
		XionConfig.data.fpsUnlimited = true;
		mc.options = null;
		FpsTweaks.tick(mc);
		mc.options = o;
		FpsTweaks.tick(mc);
		check(!o.enableVsync && o.framerateLimit == 260, "Early tick cached the state before options were ready");

		fresh();
		FpsPanel panel = new FpsPanel();
		XionConfig.data.fpsUnlimited = true;
		XionConfig.data.fpsCap = 60;
		check("Unlimited".equals(capLabel()), "FPS label advertised a cap that Unlimited ignores");
		clickCap(panel);
		check(XionConfig.data.fpsCap == 0 && !XionConfig.data.fpsUnlimited, "Selector failed to cancel Unlimited");
		clickCap(panel);
		check(XionConfig.data.fpsCap == 60 && !XionConfig.data.fpsUnlimited, "Finite FPS selection was ignored by Unlimited");
		for (int i = 0; i < 5; i++) clickCap(panel);
		check(XionConfig.data.fpsCap == 260 && XionConfig.data.fpsUnlimited, "Selector Unlimited state disagrees with toggle");
		check("Unlimited".equals(capLabel()), "Unlimited label missing");
		check(panel.click(10, 34 + 10 * 26 + 5, 0, 0, 300, 0), "Unlimited toggle click not consumed");
		check(!XionConfig.data.fpsUnlimited && XionConfig.data.fpsCap == 0, "Turning Unlimited off left 260 selected");

		System.out.println("PASS: Unlimited/VSync, preset preservation, reversible overrides, no repeated writes, startup and cap UI");
	}
}
