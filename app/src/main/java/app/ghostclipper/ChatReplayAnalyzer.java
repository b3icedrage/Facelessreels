package app.ghostclipper;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Reads an elapsed-time chat replay CSV and converts messages into five-second activity bins.
 * Accepted first/header time fields: timestamp, time, offset, elapsed. Values may be seconds,
 * MM:SS, or HH:MM:SS. A header with a message/chat/text column is also accepted.
 */
public final class ChatReplayAnalyzer {
    private ChatReplayAnalyzer() {}

    public static Map<Long, Double> read(InputStream input) throws Exception {
        Map<Long, Double> bins = new HashMap<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            int timeColumn = 0;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                String[] cells = splitCsv(line);
                if (first) {
                    first = false;
                    for (int i = 0; i < cells.length; i++) {
                        String h = cells[i].trim().toLowerCase(Locale.US);
                        if (h.contains("timestamp") || h.equals("time") || h.contains("elapsed") || h.equals("offset")) {
                            timeColumn = i;
                            break;
                        }
                    }
                    if (cells.length > 0 && !looksLikeTime(cells[timeColumn])) continue;
                }
                if (timeColumn >= cells.length) continue;
                long ms = parseTime(cells[timeColumn]);
                if (ms < 0) continue;
                long bin = (ms / 5000L) * 5000L;
                bins.put(bin, bins.containsKey(bin) ? bins.get(bin) + 1.0 : 1.0);
            }
        }
        if (bins.isEmpty()) throw new IllegalArgumentException("No usable timestamps found. Use CSV with a timestamp/time column in elapsed seconds, MM:SS or HH:MM:SS.");
        return bins;
    }

    private static boolean looksLikeTime(String value) {
        try { parseTime(value); return true; } catch (Exception e) { return false; }
    }

    private static long parseTime(String raw) {
        String s = raw.trim().replace("\"", "");
        if (s.isEmpty()) return -1;
        if (s.contains(":")) {
            String[] p = s.split(":");
            if (p.length < 2 || p.length > 3) return -1;
            double seconds;
            if (p.length == 3) seconds = Double.parseDouble(p[0]) * 3600 + Double.parseDouble(p[1]) * 60 + Double.parseDouble(p[2]);
            else seconds = Double.parseDouble(p[0]) * 60 + Double.parseDouble(p[1]);
            return seconds < 0 ? -1 : Math.round(seconds * 1000);
        }
        double seconds = Double.parseDouble(s);
        // Millisecond offsets are accepted when the value is clearly larger than a long video.
        if (seconds > 100000) return Math.round(seconds);
        return seconds < 0 ? -1 : Math.round(seconds * 1000);
    }

    private static String[] splitCsv(String line) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"' && quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') { cell.append('"'); i++; }
            else if (c == '"') quoted = !quoted;
            else if (c == ',' && !quoted) { out.add(cell.toString()); cell.setLength(0); }
            else cell.append(c);
        }
        out.add(cell.toString());
        return out.toArray(new String[0]);
    }
}
