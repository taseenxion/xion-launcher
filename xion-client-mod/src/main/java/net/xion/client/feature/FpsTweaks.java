package net.xion.client.feature;

import net.minecraft.client.CloudStatus;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.xion.client.XionConfig;

/**
 * OG-style FPS tweaks from the FPS tab of the Xion menu. While a tweak is on it forces its vanilla
 * option to the fast setting (and back to the vanilla default when switched off), so players see
 * exactly what changed. Applied once whenever the toggle set changes — vanilla options stay
 * hand-editable otherwise. The Boost/Turbo presets from Xion Launcher (Performance) apply first
 * at launch, these stack on top.
 */
public final class FpsTweaks {
	/** Last applied toggle set; rebuilt whenever it changes so the options are written once. */
	private static String applied;

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

	private static boolean any() {
		XionConfig.Data d = XionConfig.data;
		return d.fpsNoClouds || d.fpsNoParticles || d.fpsNoEntityShadows || d.fpsNoSmoothLight || d.fpsNoMipmap
			|| d.fpsLowEntityDistance || d.fpsLowBiomeBlend || d.fpsNoVsync || d.fpsOpaqueLeaves || d.fpsNoWeather
			|| d.fpsLowRenderDistance || d.fpsLowSimDistance || d.fpsUnlimited || d.fpsNoChunkFade
			|| d.fpsCap != 0;
	}

	public static void tick(Minecraft mc) {
		String s = state();
		if (s.equals(applied)) return;
		applied = s;
		if (mc.options != null && any()) apply(mc.options);
	}

	private static void apply(Options o) {
		XionConfig.Data d = XionConfig.data;
		//#if MC >= 11900
		o.cloudStatus().set(d.fpsNoClouds ? CloudStatus.OFF : CloudStatus.FANCY);
		o.entityShadows().set(!d.fpsNoEntityShadows);
		o.enableVsync().set(!d.fpsNoVsync);
		o.entityDistanceScaling().set(d.fpsLowEntityDistance ? 0.5 : 1.0);
		o.biomeBlendRadius().set(d.fpsLowBiomeBlend ? 0 : 2);
		if (d.fpsCap != 0) o.framerateLimit().set(d.fpsCap);
		if (d.fpsUnlimited) o.framerateLimit().set(260);
		// Distances: capped while on, restored to a sane value when switched off.
		if (d.fpsLowRenderDistance) o.renderDistance().set(Math.min(o.renderDistance().get(), 6));
		else if (o.renderDistance().get() < 8) o.renderDistance().set(12);
		if (d.fpsLowSimDistance) o.simulationDistance().set(Math.min(o.simulationDistance().get(), 5));
		else if (o.simulationDistance().get() < 8) o.simulationDistance().set(10);
		//#if MC >= 11903
		o.ambientOcclusion().set(!d.fpsNoSmoothLight);
		//#else
		o.ambientOcclusion().set(d.fpsNoSmoothLight ? net.minecraft.client.AmbientOcclusionStatus.OFF : net.minecraft.client.AmbientOcclusionStatus.MAX);
		//#endif
		o.mipmapLevels().set(d.fpsNoMipmap ? 0 : 4);
		//#if MC >= 12102
		o.particles().set(d.fpsNoParticles ? net.minecraft.server.level.ParticleStatus.MINIMAL : net.minecraft.server.level.ParticleStatus.ALL);
		//#else
		o.particles().set(d.fpsNoParticles ? net.minecraft.client.ParticleStatus.MINIMAL : net.minecraft.client.ParticleStatus.ALL);
		//#endif
		//#if MC >= 12111
		o.cutoutLeaves().set(!d.fpsOpaqueLeaves);
		o.chunkSectionFadeInTime().set(d.fpsNoChunkFade ? 0.0 : 1.0);
		// Only touch the weather distance when needed, so a player's own choice survives.
		if (d.fpsNoWeather) o.weatherRadius().set(0);
		else if (o.weatherRadius().get() < 1) o.weatherRadius().set(4);
		//#endif
		//#else
		o.renderClouds = d.fpsNoClouds ? CloudStatus.OFF : CloudStatus.FANCY;
		o.entityShadows = !d.fpsNoEntityShadows;
		o.enableVsync = !d.fpsNoVsync;
		o.entityDistanceScaling = d.fpsLowEntityDistance ? 0.5f : 1.0f;
		o.biomeBlendRadius = d.fpsLowBiomeBlend ? 0 : 2;
		if (d.fpsCap != 0) o.framerateLimit = d.fpsCap;
		if (d.fpsUnlimited) o.framerateLimit = 260;
		if (d.fpsLowRenderDistance) o.renderDistance = Math.min(o.renderDistance, 6);
		else if (o.renderDistance < 8) o.renderDistance = 12;
		if (d.fpsLowSimDistance) o.simulationDistance = Math.min(o.simulationDistance, 5);
		else if (o.simulationDistance < 8) o.simulationDistance = 10;
		o.ambientOcclusion = d.fpsNoSmoothLight ? net.minecraft.client.AmbientOcclusionStatus.OFF : net.minecraft.client.AmbientOcclusionStatus.MAX;
		o.mipmapLevels = d.fpsNoMipmap ? 0 : 4;
		o.particles = d.fpsNoParticles ? net.minecraft.client.ParticleStatus.MINIMAL : net.minecraft.client.ParticleStatus.ALL;
		//#endif
		o.save();
	}
}
