package net.xion.client.ui;

/** Small, bounded, Unicode-safe editor used by the mod search field. No Minecraft widget dependency. */
final class SearchInput {
	private static final int MAX = 64;
	private String value = "";
	private int cursor, anchor;

	String value() { return value; }
	int cursor() { return cursor; }
	int start() { return Math.min(cursor, anchor); }
	int end() { return Math.max(cursor, anchor); }
	String selection() { return value.substring(start(), end()); }
	boolean selected() { return cursor != anchor; }
	void focusEnd() { cursor = anchor = value.length(); }
	void clear() { value = ""; cursor = anchor = 0; }
	void selectAll() { anchor = 0; cursor = value.length(); }

	boolean insert(String text) {
		StringBuilder clean = new StringBuilder();
		text.codePoints().filter(c -> !Character.isISOControl(c) && c != 167).forEach(clean::appendCodePoint);
		int room = MAX - (value.length() - (end() - start()));
		int length = Math.min(room, clean.length());
		if (length > 0 && length < clean.length() && Character.isHighSurrogate(clean.charAt(length - 1))) length--;
		if (length <= 0) return false;
		String part = clean.substring(0, length);
		int at = start();
		value = value.substring(0, at) + part + value.substring(end());
		cursor = anchor = at + part.length();
		return true;
	}

	boolean deleteSelection() {
		if (!selected()) return false;
		int at = start();
		value = value.substring(0, at) + value.substring(end());
		cursor = anchor = at;
		return true;
	}

	boolean key(int key, int modifiers) {
		boolean ctrl = (modifiers & 2) != 0, shift = (modifiers & 1) != 0;
		if (key == 65 && ctrl) { selectAll(); return true; }
		if (key == 259 || key == 261) {
			if (deleteSelection()) return true;
			boolean left = key == 259;
			int from = cursor, to = cursor;
			if (left && cursor > 0) from = ctrl ? word(-1) : value.offsetByCodePoints(cursor, -1);
			if (!left && cursor < value.length()) to = ctrl ? word(1) : value.offsetByCodePoints(cursor, 1);
			value = value.substring(0, from) + value.substring(to);
			cursor = anchor = from;
			return true;
		}
		int to;
		if (key == 268) to = 0;
		else if (key == 269) to = value.length();
		else if (key == 263 || key == 262) {
			int dir = key == 263 ? -1 : 1;
			if (selected() && !shift && !ctrl) to = dir < 0 ? start() : end();
			else if (ctrl) to = word(dir);
			else to = cursor == (dir < 0 ? 0 : value.length()) ? cursor : value.offsetByCodePoints(cursor, dir);
		} else return false;
		cursor = to;
		if (!shift) anchor = cursor;
		return true;
	}

	private int word(int dir) {
		int at = cursor;
		if (dir < 0) {
			while (at > 0 && Character.isWhitespace(value.codePointBefore(at))) at = value.offsetByCodePoints(at, -1);
			while (at > 0 && !Character.isWhitespace(value.codePointBefore(at))) at = value.offsetByCodePoints(at, -1);
		} else {
			while (at < value.length() && Character.isWhitespace(value.codePointAt(at))) at = value.offsetByCodePoints(at, 1);
			while (at < value.length() && !Character.isWhitespace(value.codePointAt(at))) at = value.offsetByCodePoints(at, 1);
		}
		return at;
	}
}
