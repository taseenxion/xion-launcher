import net.xion.client.feature.CapeFrames;

public class CapeFramesTest {
	public static void main(String[] args) {
		for (int frames : new int[]{1, 8, 16, 24}) for (int ms : new int[]{50, 70, 80, 110}) {
			for (int i = 0; i < frames; i++) if (CapeFrames.at((long) i * ms, frames, ms) != i) throw new AssertionError("Incorrect frame timing");
			if (CapeFrames.at((long) frames * ms, frames, ms) != 0) throw new AssertionError("Loop does not wrap");
		}
		if (CapeFrames.at(110, 16, 0) != 1 || CapeFrames.at(999, 0, 50) != 0) throw new AssertionError("Invalid metadata is not safe");
		System.out.println("PASS: original 50/70/80 ms HD timing, old 110 ms defaults, frame counts and safe loop bounds");
	}
}
