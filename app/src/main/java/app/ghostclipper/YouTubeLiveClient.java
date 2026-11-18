package app.ghostclipper;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Minimal authenticated YouTube Live API client. */
public final class YouTubeLiveClient {
    private static final String API="https://www.googleapis.com/youtube/v3/";
    private YouTubeLiveClient(){}

    public static JSONObject listMyActiveBroadcasts(String token) throws Exception {
        return get("liveBroadcasts?part=id%2Csnippet&broadcastStatus=active&mine=true&maxResults=10",token);
    }

    public static JSONObject listChatMessages(String token,String chatId,String pageToken) throws Exception {
        String path="liveChat/messages?part=id%2Csnippet&liveChatId="+enc(chatId)+"&maxResults=2000";
        if(pageToken!=null&&!pageToken.isEmpty())path+="&pageToken="+enc(pageToken);
        return get(path,token);
    }

    private static JSONObject get(String path,String token) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(API+path).openConnection();
        c.setRequestMethod("GET");
        c.setConnectTimeout(20000);
        c.setReadTimeout(25000);
        c.setRequestProperty("Authorization","Bearer "+token);
        c.setRequestProperty("Accept","application/json");
        try{
            int code=c.getResponseCode();
            InputStream stream=code>=200&&code<300?c.getInputStream():c.getErrorStream();
            StringBuilder body=new StringBuilder();
            if(stream!=null)try(BufferedReader r=new BufferedReader(new InputStreamReader(stream,StandardCharsets.UTF_8))){String line;while((line=r.readLine())!=null)body.append(line);}
            JSONObject json=new JSONObject(body.toString());
            if(code<200||code>=300){
                JSONObject error=json.optJSONObject("error");
                String message=error==null?("HTTP "+code):error.optString("message","HTTP "+code);
                throw new java.io.IOException("YouTube API "+code+": "+message);
            }
            return json;
        }finally{c.disconnect();}
    }

    private static String enc(String value) throws Exception {
        return URLEncoder.encode(value,StandardCharsets.UTF_8.name());
    }
}
