package net.xion.client.feature;

import net.minecraft.client.CloudStatus;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.xion.client.XionConfig;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * FPS overrides from the Xion menu, applied after the launcher's Boost/Turbo preset. Disabled
 * tweaks leave vanilla options alone; turning off an override restores its previous session value.
 * Unlimited always disables VSync as well as setting Minecraft's uncapped frame-limit sentinel.
 */
public final class FpsTweaks {
	/** Last applied toggle set; rebuilt whenever it changes so the options are written once. */
	private static String applied;
	private static final Map<String, Runnable> restore = new HashMap<>();

	private FpsTweaks() {}

	/** Forces the tweaks to be applied again on the next tick (after toggling in the menu). */
	public static void refresh() {
		applied = null;
	}

	private static String state() {
		XionConfig.Data d = XionConfig.data;
		return (d.fpsNoClouds ? "1" : "0") + (d.fpsNoParticles ? "1" : "0") + (d.fpsNoEntityShadows ? "1" : "0")
			+ (d.fpsNoSmoothLight ? "1" : "0") + (d.fpsNoMipmap ? "1" : "0") + (d.fpsLowEntityDistance ? "1" : "0")
			+ (d.fpsLowBiomeBlend ? "1" : "0") + (d.fpsNoVsync ? "1" : "0") + (d.fpsOpaqueLeaves ? "1" : "0")
			+ (d.fpsNoWeather ? "1" : "0") + (d.fpsLowRenderDistance ? "1" : "0") + (d.fpsLowSimDistance ? "1" : "0")
			+ (d.fpsUnlimited ? "1" : "0") + (d.fpsNoChunkFade ? "1" : "0") + ":" + d.fpsCap;
	}

	/** Either UI control can request unlimited frames; both must also turn VSync off. */
	public static boolean unlimited() {
		XionConfig.Data d = XionConfig.data;
		return d.fpsUnlimited || d.fpsCap >= 260;
	}

	public static boolean vsyncOff() {
		return XionConfig.data.fpsNoVsync || unlimited();
	}

	public static void tick(Minecraft mc) {
		if (mc.options == null) return;
		String s = state();
		if (s.equals(applied)) return;
		apply(mc.options);
		applied = s;
	}

	private static <T> boolean override(String id, boolean on, Supplier<T> get, Consumer<T> set, T value) {
		if (!on) {
			Runnable reset = restore.remove(id);
			if (reset == null) return false;
			reset.run();
			return true;
		}
		if (!restore.containsKey(id)) {
			T before = get.get();
			restore.put(id, () -> set.accept(before));
		}
		if (Objects.equals(get.get(), value)) return false;
		set.accept(value);
		return true;
	}

	private static void apply(Options o) {
		XionConfig.Data d = XionConfig.data;
		int cap = unlimited() ? 260 : Math.max(0, Math.min(260, d.fpsCap));
		boolean changed = false;
		//#if MC >= 11900
		changed |= override("clouds", d.fpsNoClouds, o.cloudStatus()::get, o.cloudStatus()::set, CloudStatus.OFF);
		changed |= override("entity-shadows", d.fpsNoEntityShadows, o.entityShadows()::get, o.entityShadows()::set, false);
		changed |= override("vsync", vsyncOff(), o.enableVsync()::get, o.enableVsync()::set, false);
		changed |= override("entity-distance", d.fpsLowEntityDistance, o.entityDistanceScaling()::get, o.entityDistanceScaling()::set, 0.5);
		changed |= override("biome-blend", d.fpsLowBiomeBlend, o.biomeBlendRadius()::get, o.biomeBlendRadius()::set, 0);
		changed |= override("frame-limit", cap > 0, o.framerateLimit()::get, o.framerateLimit()::set, cap);
		changed |= override("render-distance", d.fpsLowRenderDistance, o.renderDistance()::get, o.renderDistance()::set, Math.min(o.renderDistance().get(), 6));
		changed |= override("simulation-distance", d.fpsLowSimDistance, o.simulationDistance()::get, o.simulationDistance()::set, Math.min(o.simulationDistance().get(), 5));
		//#if MC >= 11903
		changed |= override("smooth-lighting", d.fpsNoSmoothLight, o.ambientOcclusion()::get, o.ambientOcclusion()::set, false);
		//#else
		changed |= override("smooth-lighting", d.fpsNoSmoothLight, o.ambientOcclusion()::get, o.ambientOcclusion()::set, net.minecraft.client.AmbientOcclusionStatus.OFF);
		//#endif
		changed |= override("mipmaps", d.fpsNoMipmap, o.mipmapLevels()::get, o.mipmapLevels()::set, 0);
		//#if MC >= 12102
		changed |= override("particles", d.fpsNoParticles, o.particles()::get, o.particles()::set, net.minecraft.server.level.ParticleStatus.MINIMAL);
		//#else
		changed |= override("particles", d.fpsNoParticles, o.particles()::get, o.particles()::set, net.minecraft.client.ParticleStatus.MINIMAL);
		//#endif
		//#if MC >= 12111
		changed |= override("leaves", d.fpsOpaqueLeaves, o.cutoutLeaves()::get, o.cutoutLeaves()::set, false);
		changed |= override("chunk-fade", d.fpsNoChunkFade, o.chunkSectionFadeInTime()::get, o.chunkSectionFadeInTime()::set, 0.0);
		changed |= override("weather", d.fpsNoWeather, o.weatherRadius()::get, o.weatherRadius()::set, 0);
		//#endif
		//#else
		changed |= override("clouds", d.fpsNoClouds, () -> o.renderClouds, v -> o.renderClouds = v, CloudStatus.OFF);
		changed |= override("entity-shadows", d.fpsNoEntityShadows, () -> o.entityShadows, v -> o.entityShadows = v, false);
		changed |= override("vsync", vsyncOff(), () -> o.enableVsync, v -> o.enableVsync = v, false);
		changed |= override("entity-distance", d.fpsLowEntityDistance, () -> o.entityDistanceScaling, v -> o.entityDistanceScaling = v, 0.5f);
		changed |= override("biome-blend", d.fpsLowBiomeBlend, () -> o.biomeBlendRadius, v -> o.biomeBlendRadius = v, 0);
		changed |= override("frame-limit", cap > 0, () -> o.framerateLimit, v -> o.framerateLimit = v, cap);
		changed |= override("render-distance", d.fpsLowRenderDistance, () -> o.renderDistance, v -> o.renderDistance = v, Math.min(o.renderDistance, 6));
		changed |= override("simulation-distance", d.fpsLowSimDistance, () -> o.simulationDistance, v -> o.simulationDistance = v, Math.min(o.simulationDistance, 5));
		changed |= override("smooth-lighting", d.fpsNoSmoothLight, () -> o.ambientOcclusion, v -> o.ambientOcclusion = v, net.minecraft.client.AmbientOcclusionStatus.OFF);
		changed |= override("mipmaps", d.fpsNoMipmap, () -> o.mipmapLevels, v -> o.mipmapLevels = v, 0);
		changed |= override("particles", d.fpsNoParticles, () -> o.particles, v -> o.particles = v, net.minecraft.client.ParticleStatus.MINIMAL);
		//#endif
		if (changed) o.save();
	}
}
