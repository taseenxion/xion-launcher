package net.xion.client.feature;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.xion.client.XionClient;
import net.xion.client.XionConfig;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * XION AI: the chat assistant inside Xion Client. It talks to Google's Gemini API from a background
 * thread, keeps a short conversation in memory and never lets a network error reach the game thread.
 *
 * <p>The Gemini key stays on Xion's server; the public client only sends the short conversation to
 * the rate-limited XION AI endpoint. This keeps credentials out of jars and user config files.
 */
public final class XionAI {
	public static final String DEFAULT_ENDPOINT = "https://xionx.vercel.app/api/ai";
	private static final int KEEP_TURNS = 14;

	public static final class Msg {
		public final boolean user;
		public final String text;
		public final long at;
		/** Welcome/notice lines are shown but not sent back to the model. */
		public final boolean local;

		Msg(boolean user, String text, boolean local) {
			this.user = user;
			this.text = text;
			this.local = local;
			this.at = System.currentTimeMillis();
		}
	}

	private static final Object LOCK = new Object();
	private static final List<Msg> messages = new ArrayList<>();
	private static volatile boolean busy;
	private static volatile String status = "";
	private static volatile String lastPrompt = "";
	private static volatile long startedAt;
	private static volatile int generation;
	private static boolean welcomed;

	private XionAI() {}

	/** Adds the welcome line the first time the panel opens. */
	public static void welcome() {
		synchronized (LOCK) {
			if (welcomed) return;
			welcomed = true;
			messages.add(new Msg(false, "Hey, I'm XION AI. Ask me anything — Minecraft tips, builds, redstone, or whatever's on your mind.", true));
		}
	}

	/** A snapshot for the render thread; the list itself is never handed out. */
	public static List<Msg> messages() {
		welcome();
		synchronized (LOCK) {
			return new ArrayList<>(messages);
		}
	}

	public static int count() {
		synchronized (LOCK) {
			return messages.size();
		}
	}

	public static boolean busy() {
		return busy;
	}

	public static String status() {
		return status;
	}

	public static long elapsed() {
		return busy ? (System.currentTimeMillis() - startedAt) / 1000L : 0L;
	}

	public static String lastPrompt() {
		return lastPrompt;
	}

	/** Sends a new question, appending it to the conversation. Returns false when ignored. */
	public static boolean ask(String prompt) {
		String text = clean(prompt);
		if (text.isEmpty() || busy) return false;
		lastPrompt = text;
		synchronized (LOCK) {
			messages.add(new Msg(true, text, false));
		}
		run(text);
		return true;
	}

	/** Re-sends the last question without adding a duplicate user bubble. */
	public static boolean retry() {
		String text = lastPrompt;
		if (text.isEmpty() || busy) return false;
		run(text);
		return true;
	}

	/** Starts a fresh conversation. A request already in flight is ignored when it lands. */
	public static void reset() {
		synchronized (LOCK) {
			messages.clear();
			welcomed = false;
			status = "";
			lastPrompt = "";
		}
		generation++;
		busy = false;
		welcome();
	}

	private static void run(String prompt) {
		final int gen = ++generation;
		startedAt = System.currentTimeMillis();
		status = "";
		busy = true;
		Thread t = new Thread(() -> {
			String reply = null;
			String error = null;
			try {
				reply = generate();
			} catch (ApiException e) {
				error = friendly(e);
			} catch (SocketTimeoutException e) {
				error = "XION AI took too long to answer. Try again.";
			} catch (Exception e) {
				error = "Couldn't reach XION AI. Check your connection and try again.";
			}
			if (gen != generation) return;
			if (reply != null && !reply.isEmpty()) {
				synchronized (LOCK) {
					messages.add(new Msg(false, reply, false));
				}
				status = "";
			} else {
				status = error == null ? "XION AI didn't answer. Try again." : error;
			}
			busy = false;
		}, "Xion-AI");
		t.setDaemon(true);
		t.start();
	}

	private static String generate() throws Exception {
		HttpURLConnection c = (HttpURLConnection) new URL(endpoint()).openConnection();
		c.setRequestMethod("POST");
		c.setConnectTimeout(6000);
		c.setReadTimeout(26000);
		c.setDoOutput(true);
		c.setRequestProperty("Content-Type", "application/json");
		c.setRequestProperty("User-Agent", "XionClient/" + XionClient.VERSION);
		byte[] body = body().getBytes(StandardCharsets.UTF_8);
		c.setFixedLengthStreamingMode(body.length);
		try (OutputStream out = c.getOutputStream()) {
			out.write(body);
		}
		int code = c.getResponseCode();
		InputStream in = code / 100 == 2 ? c.getInputStream() : c.getErrorStream();
		String text = "";
		try {
			if (in != null) text = new String(in.readAllBytes(), StandardCharsets.UTF_8);
		} finally {
			if (in != null) in.close();
			c.disconnect();
		}
		if (code / 100 != 2) throw new ApiException(code, errorText(text));
		return parse(text);
	}

	private static String body() {
		JsonObject root = new JsonObject();
		JsonArray contents = new JsonArray();
		List<Msg> snapshot;
		synchronized (LOCK) {
			snapshot = new ArrayList<>(messages);
		}
		int from = Math.max(0, snapshot.size() - KEEP_TURNS);
		for (int i = from; i < snapshot.size(); i++) {
			Msg m = snapshot.get(i);
			if (m.local || m.text == null || m.text.isEmpty()) continue;
			JsonObject turn = new JsonObject();
			turn.addProperty("role", m.user ? "user" : "model");
			turn.add("parts", parts(m.text));
			contents.add(turn);
		}
		root.add("contents", contents);
		return root.toString();
	}

	private static JsonArray parts(String text) {
		JsonArray parts = new JsonArray();
		JsonObject part = new JsonObject();
		part.addProperty("text", text);
		parts.add(part);
		return parts;
	}

	/** Pulls the answer out of a Gemini response; ignores thinking parts and empty candidates. */
	private static String parse(String json) {
		try {
			JsonElement root = JsonParser.parseString(json);
			if (!root.isJsonObject()) return "";
			JsonArray candidates = root.getAsJsonObject().getAsJsonArray("candidates");
			if (candidates == null || candidates.size() == 0) return "";
			JsonObject candidate = candidates.get(0).getAsJsonObject();
			JsonObject content = candidate.getAsJsonObject("content");
			if (content == null || !content.has("parts")) return "";
			StringBuilder sb = new StringBuilder();
			for (JsonElement pe : content.getAsJsonArray("parts")) {
				if (!pe.isJsonObject()) continue;
				JsonObject p = pe.getAsJsonObject();
				if (p.has("thought") && p.get("thought").getAsBoolean()) continue;
				if (p.has("text")) sb.append(p.get("text").getAsString());
			}
			return tidy(sb.toString());
		} catch (Exception e) {
			return "";
		}
	}

	/** Small markdown clean-up so the chat reads nicely in Minecraft's font. */
	private static String tidy(String text) {
		return text
			.replace("\r", "")
			.replace("**", "")
			.replace("__", "")
			.replace("`", "")
			.replaceAll("(?m)^\\s*[-*]\\s+", "• ")
			.replaceAll("\\n{3,}", "\n\n")
			.trim();
	}

	private static String errorText(String json) {
		try {
			JsonObject root = JsonParser.parseString(json).getAsJsonObject();
			if (root.has("error")) return root.getAsJsonObject("error").has("message")
				? root.getAsJsonObject("error").get("message").getAsString() : "";
		} catch (Exception ignored) {
		}
		return "";
	}

	private static String friendly(ApiException e) {
		if (e.code == 401 || e.code == 403) return "XION AI authorization failed. Please update Xion Client.";
		if (e.code == 429) return "XION AI is popular right now. Try again in a moment.";
		if (e.code >= 500) return "XION AI is busy right now. Try again in a moment.";
		if (e.code == 400) return "That message couldn't be sent. Try asking in a different way.";
		return "XION AI couldn't answer. Try again.";
	}

	private static String endpoint() {
		String url = XionConfig.data.aiEndpoint;
		if (url == null || url.trim().isEmpty()) url = DEFAULT_ENDPOINT;
		return url.trim();
	}

	private static String clean(String s) {
		if (s == null) return "";
		String t = s.replace('\r', ' ').replace('\n', ' ').trim();
		return t.length() > 600 ? t.substring(0, 600) : t;
	}

	private static final class ApiException extends Exception {
		final int code;

		ApiException(int code, String message) {
			super(message == null || message.isEmpty() ? "HTTP " + code : message);
			this.code = code;
		}
	}
}
