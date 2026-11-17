package net.xion.client.feature;

/** Version-neutral animation clock; old capes retain their default 110 ms timing. */
public final class CapeFrames {
	private CapeFrames() {}
	public static int at(long time, int frames, int frameMs) {
		int count = Math.max(1, frames);
		int duration = frameMs >= 16 && frameMs <= 1000 ? frameMs : 110;
		return (int) Math.floorMod(time / duration, count);
	}
}
