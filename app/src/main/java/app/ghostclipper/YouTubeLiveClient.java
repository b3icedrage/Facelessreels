package app.ghostclipper;

import org.json.JSONArray;
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

    /**
     * Lists broadcasts owned by the authenticated channel, then filters the
     * response locally. YouTube rejects requests that combine mine=true with
     * broadcastStatus, so these filters must not be sent together.
     */
    public static JSONObject listMyActiveBroadcasts(String token) throws Exception {
        JSONObject response=get("liveBroadcasts?part=id%2Csnippet%2Cstatus&mine=true&maxResults=50",token);
        JSONArray items=response.optJSONArray("items");
        JSONArray active=new JSONArray();
        if(items!=null){
            for(int i=0;i<items.length();i++){
                JSONObject item=items.optJSONObject(i);
                if(item==null)continue;
                JSONObject status=item.optJSONObject("status");
                String lifecycle=status==null?"":status.optString("lifeCycleStatus","");
                if("live".equals(lifecycle)||"liveStarting".equals(lifecycle)
                        ||"testing".equals(lifecycle)||"testStarting".equals(lifecycle)){
                    active.put(item);
                }
            }
        }
        response.put("items",active);
        return response;
    }

    /**
     * Lists public videos that are currently live. No channel, title,
     * description, or subscription filtering is applied. Fetch every page
     * exposed by YouTube's search API so the user can choose a stream.
     */
    public static JSONObject listAllLiveStreams(String token) throws Exception {
        JSONArray all = new JSONArray();
        String page = null;
        int pages = 0;
        do {
            String path = "search?part=snippet&type=video&eventType=live&order=relevance&maxResults=50";
            if (page != null && !page.isEmpty()) path += "&pageToken=" + enc(page);
            JSONObject response = get(path, token);
            JSONArray items = response.optJSONArray("items");
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.optJSONObject(i);
                    if (item != null) all.put(item);
                }
            }
            page = response.optString("nextPageToken", null);
            pages++;
        } while (page != null && !page.isEmpty());

        JSONObject result = new JSONObject();
        result.put("items", all);
        result.put("pagesRead", pages);
        return result;
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
