package app.ghostclipper;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ContentValues;
import android.provider.MediaStore;
import android.os.Environment;
import android.net.Uri;
import android.os.Bundle;
import android.media.MediaMetadataRetriever;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.net.HttpURLConnection;
import java.net.URL;
import androidx.annotation.Nullable;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.effect.Presentation;
import androidx.media3.effect.Crop;
import androidx.media3.transformer.Transformer;
import java.io.*;
import java.util.Collections;

public class MainActivity extends AppCompatActivity {
    private static final int PICK_VIDEO=10, SAVE_VIDEO=11, SAVE_SRT=12, PICK_CHAT=13, CONNECT_YOUTUBE=14, CAPTURE_SCREEN=15;
    private static final String RELAY_URL="https://ghost-clipper-relay.kipkiruibrian102198.workers.dev";
    private static final String RELAY_PREFS="ghost_relay";
    private static final String YOUTUBE_SCOPE="https://www.googleapis.com/auth/youtube.readonly";
    private Uri source;
    private long durationMs=-1;
    private File rendered;
    private String pendingSrt;
    private java.util.Map<Long, Double> chatActivity = new java.util.HashMap<>();
    private Transformer transformer;
    private volatile boolean liveChatRunning=false;
    private String youtubeToken, liveChatId, livePageToken;
    private long liveStartEpochMs=0;
    private long livePollIntervalMs=5000;
    private final ChatSpikeDetector chatSpikeDetector=new ChatSpikeDetector();
    private String selectedLiveTitle="";
    private boolean isExporting=false;
    private TextView sourceLabel, durationLabel, status;
    private LinearLayout liveStreamsContainer;
    private WebView livePlayer;
    private EditText startField, endField;
    private CheckBox portrait, mute;
    private Button export, cancel;
    private ProgressBar progress;
    private android.content.BroadcastReceiver recorderReceiver;

    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+0.5f);}
    @Override public void onCreate(@Nullable Bundle state){super.onCreate(state); buildUi(); registerRecorderReceiver(); reconnectGhostRelay();}

    private void buildUi(){
        ScrollView scroll=new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(9,13,18));
        LinearLayout root=new LinearLayout(this); root.setOrientation(1);
        root.setPadding(dp(20),dp(28),dp(20),dp(28)); scroll.addView(root);

        TextView logo=label("GHOST CLIPPER",25,Color.rgb(0,217,232),true);
        root.addView(logo);
        TextView sub=label("LOCAL VIDEO CLIPPER  •  FREE  •  NO ACCOUNT",11,Color.LTGRAY,false);
        LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(-1,-2);sp.topMargin=dp(6);root.addView(sub,sp);
        gap(root,28);
        root.addView(label("01  SOURCE VIDEO",14,Color.WHITE,true));
        Button choose=button("Choose video from phone");root.addView(choose);
        choose.setOnClickListener(v->pickSource());
        sourceLabel=label("No video selected",13,Color.LTGRAY,false);gap(root,8);root.addView(sourceLabel);
        durationLabel=label("",12,Color.GRAY,false);root.addView(durationLabel);
        gap(root,18);
        root.addView(label("02  SMART TOOLS",14,Color.WHITE,true));
        Button highlights=button("Find highlight moments");
        root.addView(highlights);
        highlights.setOnClickListener(v->findHighlights());
        Button captions=button("Generate AI captions (offline model)");
        root.addView(captions);
        captions.setOnClickListener(v->generateCaptions());
        gap(root,18);
        root.addView(label("YOUTUBE LIVE",14,Color.WHITE,true));
        Button youtubeConnect=button("Connect my YouTube channel");
        root.addView(youtubeConnect);
        youtubeConnect.setOnClickListener(v->connectYoutube());
        Button bufferButton=button("Enable rolling video buffer (screen capture)");
        root.addView(bufferButton);
        bufferButton.setOnClickListener(v->requestScreenCapture());
        root.addView(label("LIVE VIDEO PLAYER",12,Color.rgb(198,255,0),true));
        livePlayer=new WebView(this);
        livePlayer.setBackgroundColor(Color.BLACK);
        livePlayer.setVisibility(View.GONE);
        WebSettings playerSettings=livePlayer.getSettings();
        playerSettings.setJavaScriptEnabled(true);
        playerSettings.setDomStorageEnabled(true);
        playerSettings.setMediaPlaybackRequiresUserGesture(false);
        livePlayer.setWebChromeClient(new WebChromeClient());
        LinearLayout.LayoutParams playerSize=new LinearLayout.LayoutParams(-1,dp(220));
        playerSize.topMargin=dp(8);
        root.addView(livePlayer,playerSize);
        Button youtubeFind=button("Show all live YouTube streams");
        root.addView(youtubeFind);
        youtubeFind.setOnClickListener(v->findSubscribedLiveStreams());
        liveStreamsContainer=new LinearLayout(this);
        liveStreamsContainer.setOrientation(1);
        root.addView(liveStreamsContainer);
        Button chatgptConnect=button("Connect to ChatGPT");
        root.addView(chatgptConnect);
        chatgptConnect.setOnClickListener(v->beginGhostPairing());
        Button youtubeStop=button("Stop live chat capture");
        root.addView(youtubeStop);
        youtubeStop.setOnClickListener(v->{
            liveChatRunning=false;
            if(LiveScreenRecorderService.isActive){
                Intent stop=new Intent(this,LiveScreenRecorderService.class);
                stop.setAction(LiveScreenRecorderService.ACTION_STOP);
                startService(stop);
            }
            status.setText("YouTube live chat and video buffer stopping.");
        });
        gap(root,22);
        root.addView(label("03  CLIP RANGE (SECONDS)",14,Color.WHITE,true));
        LinearLayout row=new LinearLayout(this);row.setOrientation(0);
        startField=numberField("Start","0");endField=numberField("End","30");
        LinearLayout.LayoutParams w=new LinearLayout.LayoutParams(0,dp(54),1);w.rightMargin=dp(6);row.addView(startField,w);
        LinearLayout.LayoutParams w2=new LinearLayout.LayoutParams(0,dp(54),1);w2.leftMargin=dp(6);row.addView(endField,w2);root.addView(row);
        gap(root,14);
        portrait=new CheckBox(this);portrait.setText("Crop to vertical 9:16 (Shorts / Reels)");portrait.setTextColor(Color.WHITE);portrait.setChecked(true);root.addView(portrait);
        mute=new CheckBox(this);mute.setText("Remove original audio");mute.setTextColor(Color.WHITE);root.addView(mute);
        gap(root,22);
        root.addView(label("04  RENDER MP4",14,Color.WHITE,true));
        export=button("Export clip");root.addView(export);export.setOnClickListener(v->startExport());
        cancel=button("Cancel export");cancel.setVisibility(View.GONE);root.addView(cancel);cancel.setOnClickListener(v->cancelExport());
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setIndeterminate(true);progress.setVisibility(View.GONE);
        LinearLayout.LayoutParams pp=new LinearLayout.LayoutParams(-1,dp(5));pp.topMargin=dp(14);root.addView(progress,pp);
        status=label("Choose a source video to begin.",13,Color.rgb(198,255,0),false);
        LinearLayout.LayoutParams st=new LinearLayout.LayoutParams(-1,-2);st.topMargin=dp(14);root.addView(status,st);
        gap(root,26);
        TextView foot=label("ON-DEVICE PROCESSING  •  NO API KEY REQUIRED",10,Color.GRAY,false);foot.setGravity(Gravity.CENTER);root.addView(foot);
        setContentView(scroll);
    }

    private TextView label(String s,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return t;}
    private void gap(LinearLayout p,int h){View v=new View(this);p.addView(v,new LinearLayout.LayoutParams(1,dp(h)));}
    private Button button(String s){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextColor(Color.BLACK);b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(0,217,232)));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(52));p.topMargin=dp(9);b.setLayoutParams(p);return b;}
    private EditText numberField(String hint,String value){EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);e.setHint(hint);e.setTextColor(Color.WHITE);e.setHintTextColor(Color.GRAY);e.setInputType(8194);e.setPadding(dp(10),0,dp(10),0);e.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(0,217,232)));return e;}

    private void pickSource(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("video/*");i.addCategory(Intent.CATEGORY_OPENABLE);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(i,PICK_VIDEO);}
    @Override protected void onActivityResult(int req,int res,@Nullable Intent data){super.onActivityResult(req,res,data);
        if(req==CAPTURE_SCREEN){
            if(res==RESULT_OK&&data!=null){
                Intent start=new Intent(this,LiveScreenRecorderService.class);
                start.setAction(LiveScreenRecorderService.ACTION_START);
                start.putExtra(LiveScreenRecorderService.EXTRA_RESULT_CODE,res);
                start.putExtra(LiveScreenRecorderService.EXTRA_DATA,data);
                if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(start);else startService(start);
                status.setText("Starting rolling video buffer. Switch to YouTube after the notification appears.");
            }else status.setText("Screen recording permission was cancelled. Chat monitoring will work, but no video can be clipped.");
            return;
        }
        if(req==CONNECT_YOUTUBE){if(data!=null)finishYoutubeSignIn(data);else status.setText("Google sign-in returned no account data (result code "+res+"). Check the Android OAuth client package name and SHA-1 fingerprint in Google Cloud.");return;}
        if(res!=RESULT_OK||data==null||data.getData()==null)return;
        if(req==PICK_VIDEO){source=data.getData();try{getContentResolver().takePersistableUriPermission(source,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){} inspectSource();}
        else if(req==SAVE_VIDEO)copyTo(data.getData());
        else if(req==SAVE_SRT)writeSrt(data.getData());
        else if(req==PICK_CHAT)loadChatReplay(data.getData());
    }
    private void inspectSource(){MediaMetadataRetriever m=new MediaMetadataRetriever();try{m.setDataSource(this,source);String d=m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);durationMs=d==null?-1:Long.parseLong(d);}catch(Exception e){status.setText("Cannot read selected video: "+e.getMessage());}finally{try{m.release();}catch(Exception ignored){}}
        String name=source.getLastPathSegment();sourceLabel.setText(name==null?"Video selected":name);
        if(durationMs>0){durationLabel.setText(String.format(java.util.Locale.US,"Duration %.1f seconds",durationMs/1000.0));endField.setText(String.format(java.util.Locale.US,"%.1f",Math.min(30.0,durationMs/1000.0)));status.setText("Source ready. Set your clip range.");}
    }
    private void startExport(){
        if(source==null){status.setText("Choose a video first.");return;}
        double a,b;try{a=Double.parseDouble(startField.getText().toString());b=Double.parseDouble(endField.getText().toString());}catch(Exception e){status.setText("Enter valid start and end times.");return;}
        if(a<0||b<=a||b-a<1){status.setText("End must be after start and clip must be at least 1 second.");return;}
        if(durationMs>0&&b*1000>durationMs+250){status.setText("End time exceeds source duration.");return;}
        rendered=new File(getCacheDir(),"ghostclip_"+System.currentTimeMillis()+".mp4");
        MediaItem item=new MediaItem.Builder().setUri(source).setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder().setStartPositionMs(Math.round(a*1000)).setEndPositionMs(Math.round(b*1000)).build()).build();
        java.util.List<androidx.media3.common.Effect> videoEffects=portrait.isChecked()?Collections.singletonList(Presentation.createForWidthAndHeight(1080,1920,Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)):Collections.emptyList();
        Effects effects=new Effects(Collections.emptyList(),videoEffects);
        EditedMediaItem edited=new EditedMediaItem.Builder(item).setEffects(effects).setRemoveAudio(mute.isChecked()).build();
        transformer=new Transformer.Builder(this).setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(new Transformer.Listener(){
                @Override public void onCompleted(Composition c,ExportResult r){isExporting=false;setBusy(false);status.setText("Render complete. Saving MP4 to Downloads...");saveRenderedToDownloads();}
                @Override public void onError(Composition c,ExportResult r,ExportException e){isExporting=false;setBusy(false);status.setText("Export failed: "+e.getMessage());}
            }).build();
        isExporting=true;setBusy(true);status.setText("Rendering on this phone. Keep Ghost Clipper open...");
        try{transformer.start(edited,rendered.getAbsolutePath());}catch(Exception e){isExporting=false;setBusy(false);status.setText("Could not start render: "+e.getMessage());}
    }



    private JSONObject relayRequest(String path,String method,JSONObject payload,String bearer)throws Exception{
        HttpURLConnection c=(HttpURLConnection)new URL(RELAY_URL+path).openConnection();
        c.setRequestMethod(method);c.setConnectTimeout(10000);c.setReadTimeout(15000);
        c.setRequestProperty("Content-Type","application/json");
        if(bearer!=null&&!bearer.isEmpty())c.setRequestProperty("Authorization","Bearer "+bearer);
        if(payload!=null){c.setDoOutput(true);try(OutputStream o=c.getOutputStream()){o.write(payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}
        int code=c.getResponseCode();InputStream in=code>=200&&code<300?c.getInputStream():c.getErrorStream();
        ByteArrayOutputStream out=new ByteArrayOutputStream();if(in!=null){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);in.close();}
        c.disconnect();JSONObject result=new JSONObject(out.toString("UTF-8"));
        if(code<200||code>=300)throw new IOException(result.optString("error","Relay HTTP "+code));
        return result;
    }
    private String ghostDeviceId(){
        android.content.SharedPreferences p=getSharedPreferences(RELAY_PREFS,MODE_PRIVATE);
        String id=p.getString("device_id",null);
        if(id==null){id=java.util.UUID.randomUUID().toString();p.edit().putString("device_id",id).apply();}
        return id;
    }
    private void beginGhostPairing(){
        new Thread(()->{
            try{
                java.security.SecureRandom random=new java.security.SecureRandom();
                String code=String.format(java.util.Locale.US,"%08d",random.nextInt(100000000));
                JSONObject req=new JSONObject();req.put("deviceId",ghostDeviceId());req.put("code",code);
                relayRequest("/api/pair/start","POST",req,null);
                runOnUiThread(()->new android.app.AlertDialog.Builder(this).setTitle("Pair Ghost Clipper")
                    .setMessage("Enter this one-time code in the Ghost Clipper ChatGPT integration:\n\n"+code+"\n\nIt expires in 5 minutes. Keep this screen open.")
                    .setPositiveButton("Waiting for ChatGPT",(d,w)->waitForGhostPair(code)).setNegativeButton("Cancel",null).show());
            }catch(Exception e){runOnUiThread(()->status.setText("Could not start ChatGPT pairing: "+e.getMessage()));}
        },"GhostClip-PairStart").start();
    }
    private void waitForGhostPair(String code){
        status.setText("Waiting for ChatGPT to approve pairing...");
        new Thread(()->{
            long until=System.currentTimeMillis()+300000;
            while(System.currentTimeMillis()<until){
                try{
                    JSONObject q=new JSONObject();q.put("code",code);
                    JSONObject r=relayRequest("/api/pair/status","POST",q,null);
                    if("paired".equals(r.optString("status"))){
                        getSharedPreferences(RELAY_PREFS,MODE_PRIVATE).edit().putString("token",r.getString("token")).putString("device_id",r.getString("deviceId")).apply();
                        runOnUiThread(()->status.setText("ChatGPT connected. Automatic reconnection is enabled."));
                        sendGhostHeartbeat();return;
                    }
                    Thread.sleep(2500);
                }catch(Exception e){try{Thread.sleep(2500);}catch(InterruptedException ignored){return;}}
            }
            runOnUiThread(()->status.setText("Pairing expired. Tap Connect to ChatGPT to try again."));
        },"GhostClip-PairWait").start();
    }
    private void reconnectGhostRelay(){
        String token=getSharedPreferences(RELAY_PREFS,MODE_PRIVATE).getString("token",null);
        if(token!=null&&!token.isEmpty())new Thread(()->{
            try{JSONObject r=relayRequest("/api/device/heartbeat","POST",new JSONObject(),token);
                runOnUiThread(()->status.setText("ChatGPT relay connected. Ghost Clipper is online."));
            }catch(Exception e){runOnUiThread(()->status.setText("ChatGPT relay reconnect failed: "+e.getMessage()));}
        },"GhostClip-AutoReconnect").start();
    }
    private void sendGhostHeartbeat(){
        String token=getSharedPreferences(RELAY_PREFS,MODE_PRIVATE).getString("token",null);
        if(token==null)return;
        new Thread(()->{try{relayRequest("/api/device/heartbeat","POST",new JSONObject(),token);}catch(Exception ignored){}},"GhostClip-Heartbeat").start();
    }
    private void sendGhostEvent(String type,String title,String details){
        String token=getSharedPreferences(RELAY_PREFS,MODE_PRIVATE).getString("token",null);
        if(token==null)return;
        new Thread(()->{try{JSONObject e=new JSONObject();e.put("type",type);e.put("title",title);e.put("details",details);relayRequest("/api/device/events","POST",e,token);}catch(Exception ignored){}},"GhostClip-Event").start();
    }

    private void connectYoutube(){
        GoogleSignInOptions options=new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail().requestScopes(new Scope(YOUTUBE_SCOPE)).build();
        GoogleSignInClient client=GoogleSignIn.getClient(this,options);
        status.setText("Opening secure Google sign-in...");
        startActivityForResult(client.getSignInIntent(),CONNECT_YOUTUBE);
    }

    private void finishYoutubeSignIn(Intent data){
        try{
            GoogleSignInAccount account=GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException.class);
            status.setText("Connected to Google. Checking your active YouTube broadcasts...");
            new Thread(()->{
                try{
                    String token=GoogleAuthUtil.getToken(this,account.getAccount(),"oauth2:"+YOUTUBE_SCOPE);
                    youtubeToken=token;
                    runOnUiThread(()->findSubscribedLiveStreams());
                }catch(Exception e){runOnUiThread(()->status.setText("YouTube connection failed: "+e.getMessage()));}
            }).start();
        }catch(Exception e){if(e instanceof ApiException){ApiException api=(ApiException)e;status.setText("Google sign-in error "+api.getStatusCode()+": "+api.getStatus().getStatusMessage()+". Check the Android OAuth client configuration.");}else{status.setText("Google sign-in failed: "+e.getClass().getSimpleName()+": "+e.getMessage());}}
    }

    /** Searches YouTube's live results and intersects them with this account's subscriptions. */
    private void findSubscribedLiveStreams(){
        if(youtubeToken==null||youtubeToken.isEmpty()){
            connectYoutube();
            return;
        }
        status.setText("Loading all currently live YouTube streams...");
        if(liveStreamsContainer!=null)liveStreamsContainer.removeAllViews();
        new Thread(()->{
            try{
                JSONObject response=YouTubeLiveClient.listAllLiveStreams(youtubeToken);
                JSONArray items=response.optJSONArray("items");
                int count=items==null?0:items.length();
                int pages=response.optInt("pagesRead",0);
                runOnUiThread(()->{
                    if(liveStreamsContainer!=null)liveStreamsContainer.removeAllViews();
                    if(count==0){
                        TextView empty=label("No public live streams were returned by YouTube. Try again later.",13,Color.LTGRAY,false);
                        liveStreamsContainer.addView(empty);
                    }else{
                        TextView heading=label(count+" LIVE YOUTUBE STREAM"+(count==1?"":"S"),12,Color.rgb(198,255,0),true);
                        liveStreamsContainer.addView(heading);
                        for(int i=0;i<items.length();i++){
                            JSONObject item=items.optJSONObject(i);
                            JSONObject snippet=item==null?null:item.optJSONObject("snippet");
                            JSONObject id=item==null?null:item.optJSONObject("id");
                            if(snippet==null||id==null)continue;
                            String videoId=id.optString("videoId","");
                            if(videoId.isEmpty())continue;
                            String title=snippet.optString("title","GTA 6 livestream");
                            String channel=snippet.optString("channelTitle","YouTube channel");
                            LinearLayout streamCard=new LinearLayout(this);
                            streamCard.setOrientation(LinearLayout.HORIZONTAL);
                            streamCard.setGravity(Gravity.CENTER_VERTICAL);
                            streamCard.setPadding(dp(6),dp(6),dp(6),dp(6));
                            streamCard.setBackgroundColor(Color.rgb(20,28,36));
                            LinearLayout.LayoutParams cardParams=new LinearLayout.LayoutParams(-1,dp(92));
                            cardParams.topMargin=dp(8);
                            liveStreamsContainer.addView(streamCard,cardParams);
                            ImageView thumbnail=new ImageView(this);
                            thumbnail.setScaleType(ImageView.ScaleType.CENTER_CROP);
                            LinearLayout.LayoutParams thumbParams=new LinearLayout.LayoutParams(dp(128),dp(76));
                            streamCard.addView(thumbnail,thumbParams);
                            JSONObject thumbs=snippet.optJSONObject("thumbnails");
                            JSONObject thumb=thumbs==null?null:thumbs.optJSONObject("medium");
                            if(thumb==null&&thumbs!=null)thumb=thumbs.optJSONObject("high");
                            String thumbUrl=thumb==null?"":thumb.optString("url","");
                            if(!thumbUrl.isEmpty())loadLiveThumbnail(thumbnail,thumbUrl);
                            Button stream=button(title+"  •  "+channel);
                            LinearLayout.LayoutParams streamParams=new LinearLayout.LayoutParams(0,dp(76),1);
                            streamParams.leftMargin=dp(8);
                            stream.setLayoutParams(streamParams);
                            streamCard.addView(stream);
                            stream.setOnClickListener(v->{
                                stream.setEnabled(false);
                                status.setText("Connecting to live chat for: "+title);
                                new Thread(()->{
                                    try{
                                        JSONObject details=YouTubeLiveClient.getLiveChatDetails(youtubeToken,videoId);
                                        String chatId=details.optString("activeLiveChatId","");
                                        String actualStart=details.optString("actualStartTime","");
                                        long started=System.currentTimeMillis();
                                        try{if(!actualStart.isEmpty())started=Instant.parse(actualStart).toEpochMilli();}catch(Exception ignored){}
                                        liveChatId=chatId;
                                        livePageToken=null;
                                        liveStartEpochMs=started;
                                        selectedLiveTitle=title;
                                        runOnUiThread(()->{
                                            stream.setEnabled(true);
                                            stream.setText("MONITORING CHAT  •  "+title);
                                            showLivePlayer(videoId);
                                            startLiveChatCapture();
                                            status.setText("Monitoring chat for “"+title+"”. Keep Ghost Clipper open; chat spikes will be detected automatically.");
                                            try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://www.youtube.com/watch?v="+videoId)));}
                                            catch(Exception e){status.setText("Chat monitor is active, but YouTube could not open: "+e.getMessage());}
                                        });
                                    }catch(Exception e){
                                        runOnUiThread(()->{stream.setEnabled(true);status.setText("Could not start chat monitoring: "+e.getMessage());});
                                    }
                                },"GhostClip-SelectLive").start();
                            });
                        }
                    }
                    status.setText("Loaded "+count+" live streams across "+pages+" result page"+(pages==1?"":"s")+". Choose one to open it in YouTube.");
                });
            }catch(Exception e){runOnUiThread(()->status.setText("Could not load live YouTube streams: "+e.getMessage()));}
        },"GhostClip-YouTubeDiscovery").start();
    }

    private void showLivePlayer(String videoId){
        if(livePlayer==null)return;
        livePlayer.setVisibility(View.VISIBLE);
        String html="<!doctype html><html><body style='margin:0;background:#000'><iframe width='100%' height='100%' src='https://www.youtube-nocookie.com/embed/"+videoId+"?autoplay=1&playsinline=1&rel=0' title='YouTube live stream' frameborder='0' allow='autoplay; encrypted-media; picture-in-picture' allowfullscreen></iframe></body></html>";
        livePlayer.loadDataWithBaseURL("https://www.youtube-nocookie.com",html,"text/html","UTF-8",null);
    }

    private void loadLiveThumbnail(ImageView target,String imageUrl){
        new Thread(()->{
            HttpURLConnection connection=null;
            try{
                connection=(HttpURLConnection)new URL(imageUrl).openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(15000);
                connection.setInstanceFollowRedirects(true);
                try(InputStream in=connection.getInputStream()){
                    Bitmap bitmap=BitmapFactory.decodeStream(in);
                    if(bitmap!=null)runOnUiThread(()->target.setImageBitmap(bitmap));
                }
            }catch(Exception ignored){
            }finally{if(connection!=null)connection.disconnect();}
        },"GhostClip-Thumbnail").start();
    }

    private void startLiveChatCapture(){
        liveChatRunning=false;
        chatSpikeDetector.reset();
        synchronized(chatActivity){chatActivity.clear();}
        liveChatRunning=true;
        new Thread(()->{
            while(liveChatRunning){
                try{
                    JSONObject response=YouTubeLiveClient.listChatMessages(youtubeToken,liveChatId,livePageToken);
                    String next=response.optString("nextPageToken",null);
                    if(next!=null&&!next.isEmpty())livePageToken=next;
                    livePollIntervalMs=Math.max(1000,response.optLong("pollingIntervalMillis",5000));
                    JSONArray items=response.optJSONArray("items");
                    int added=0;
                    ChatSpikeDetector.Spike detectedSpike=null;
                    if(items!=null)for(int i=0;i<items.length();i++){
                        JSONObject item=items.optJSONObject(i);
                        JSONObject snippet=item==null?null:item.optJSONObject("snippet");
                        if(snippet==null)continue;
                        String published=snippet.optString("publishedAt","");
                        long at=System.currentTimeMillis();
                        try{at=Instant.parse(published).toEpochMilli();}catch(Exception ignored){}
                        long relative=Math.max(0,at-liveStartEpochMs);
                        long bin=(relative/5000L)*5000L;
                        synchronized(chatActivity){Double old=chatActivity.get(bin);chatActivity.put(bin,(old==null?0:old)+1);}
                        ChatSpikeDetector.Spike candidate=chatSpikeDetector.add(at,1);
                        if(candidate!=null)detectedSpike=candidate;
                        added++;
                    }
                    final int count=added;
                    final ChatSpikeDetector.Spike spike=detectedSpike;
                    if(spike!=null){
                        sendGhostEvent("chat_spike",selectedLiveTitle,spike.recentMessages+" messages in 10 seconds; multiplier "+spike.multiplier);
                        if(LiveScreenRecorderService.isActive){
                            Intent clipSignal=new Intent(this,LiveScreenRecorderService.class);
                            clipSignal.setAction(LiveScreenRecorderService.ACTION_SPIKE);
                            if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(clipSignal);else startService(clipSignal);
                        }
                        long relative=Math.max(0,spike.timestampMs-liveStartEpochMs);
                        long bin=(relative/5000L)*5000L;
                        synchronized(chatActivity){chatActivity.put(bin,Math.max(chatActivity.containsKey(bin)?chatActivity.get(bin):0,spike.recentMessages));}
                        final long seconds=relative/1000L;
                        runOnUiThread(()->status.setText("🔥 CHAT EXPLOSION at "+String.format(java.util.Locale.US,"%02d:%02d",seconds/60,seconds%60)+" — "+spike.recentMessages+" messages in 10 seconds ("+String.format(java.util.Locale.US,"%.1fx",spike.multiplier)+" baseline). Event marked for clipping."));
                    }else{
                        runOnUiThread(()->status.setText("Monitoring “"+selectedLiveTitle+"” • "+count+" new messages • "+chatActivity.size()+" activity windows. Waiting for a chat explosion..."));
                    }
                    Thread.sleep(livePollIntervalMs);
                }catch(InterruptedException e){Thread.currentThread().interrupt();break;}
                catch(Exception e){liveChatRunning=false;runOnUiThread(()->status.setText("Live chat capture stopped: "+e.getMessage()));}
            }
        },"GhostClip-YouTubeChat").start();
    }

    private void requestScreenCapture(){
        android.media.projection.MediaProjectionManager manager=(android.media.projection.MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
        status.setText("Android will ask permission to record your screen. This is needed to capture the livestream video.");
        startActivityForResult(manager.createScreenCaptureIntent(),CAPTURE_SCREEN);
    }


    /**
     * MediaProjection records the display. Crop the finished spike to the
     * visible WebView player rectangle before saving it.
     */
    private void cropSpikeToPlayer(File input){
        if(livePlayer==null||livePlayer.getVisibility()!=View.VISIBLE||livePlayer.getWidth()<2||livePlayer.getHeight()<2){
            status.setText("Spike captured, but the live player is not visible. Keep the player open to crop highlights.");
            return;
        }
        int[] location=new int[2];
        livePlayer.getLocationOnScreen(location);
        android.util.DisplayMetrics dm=new android.util.DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(dm);
        float left=Math.max(-1f,Math.min(1f,2f*location[0]/dm.widthPixels-1f));
        float right=Math.max(-1f,Math.min(1f,2f*(location[0]+livePlayer.getWidth())/dm.widthPixels-1f));
        float top=Math.max(-1f,Math.min(1f,1f-2f*location[1]/dm.heightPixels));
        float bottom=Math.max(-1f,Math.min(1f,1f-2f*(location[1]+livePlayer.getHeight())/dm.heightPixels));
        if(right-left<0.02f||top-bottom<0.02f){
            status.setText("Could not determine the livestream player crop area.");
            return;
        }
        File cropped=new File(getCacheDir(),"ghost_spike_crop_"+System.currentTimeMillis()+".mp4");
        try{
            Crop crop=new Crop(left,right,bottom,top);
            Effects effects=new Effects(Collections.emptyList(),Collections.singletonList(crop));
            EditedMediaItem item=new EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input))).setEffects(effects).build();
            transformer=new Transformer.Builder(this).setVideoMimeType(MimeTypes.VIDEO_H264)
                .addListener(new Transformer.Listener(){
                    @Override public void onCompleted(Composition composition,ExportResult result){
                        if(!cropped.exists()||cropped.length()==0){
                            status.setText("Player crop produced an empty video.");
                            return;
                        }
                        input.delete();
                        rendered=cropped;
                        status.setText("Livestream spike cropped to the player. Saving to Downloads...");
                        saveRenderedToDownloads();
                    }
                    @Override public void onError(Composition composition,ExportResult result,ExportException error){
                        status.setText("Player crop failed: "+error.getMessage()+" • Original spike retained in app storage.");
                    }
                }).build();
            status.setText("Chat spike detected. Cropping the livestream player...");
            transformer.start(item,cropped.getAbsolutePath());
        }catch(Exception e){
            status.setText("Could not crop spike to player: "+e.getMessage());
        }
    }

    private void registerRecorderReceiver(){
        recorderReceiver=new android.content.BroadcastReceiver(){
            @Override public void onReceive(android.content.Context context,Intent intent){
                String message=intent.getStringExtra(LiveScreenRecorderService.EXTRA_MESSAGE);
                java.util.ArrayList<String> files=intent.getStringArrayListExtra(LiveScreenRecorderService.EXTRA_FILES);
                if(message!=null)status.setText(message);
                if(files!=null&&!files.isEmpty()){
                    File spikeFile=new File(files.get(0));
                    if(spikeFile.exists()&&spikeFile.getName().endsWith(".mp4")){
                        cropSpikeToPlayer(spikeFile);
                    }
                }
            }
        };
        IntentFilter filter=new IntentFilter(LiveScreenRecorderService.BROADCAST);
        if(android.os.Build.VERSION.SDK_INT>=33)registerReceiver(recorderReceiver,filter,android.content.Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(recorderReceiver,filter);
    }

    @Override protected void onDestroy(){
        liveChatRunning=false;
        if(recorderReceiver!=null){try{unregisterReceiver(recorderReceiver);}catch(Exception ignored){}}
        super.onDestroy();
    }

    private void pickChatReplay(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("text/*");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_CHAT);
    }
    private void loadChatReplay(Uri uri){
        try(InputStream in=getContentResolver().openInputStream(uri)){
            if(in==null)throw new IOException("Cannot open chat replay");
            chatActivity=ChatReplayAnalyzer.read(in);
            status.setText("Chat replay loaded: "+chatActivity.size()+" five-second activity windows. Run highlight detection to combine chat spikes with scene changes.");
        }catch(Exception e){status.setText("Could not read chat CSV: "+e.getMessage());}
    }

    private void findHighlights(){
        if(source==null){status.setText("Choose a video first.");return;}
        status.setText(chatActivity.isEmpty()?"Scanning scene changes. This may take a moment...":"Scoring scene changes and chat activity spikes...");
        new Thread(()->{
            try{
                java.util.List<HighlightDetector.Moment> moments=HighlightDetector.detect(this,source,durationMs,chatActivity);
                runOnUiThread(()->{
                    if(moments.isEmpty()){status.setText("No clear scene changes found. Try a longer video.");return;}
                    StringBuilder msg=new StringBuilder("Suggested moments: ");
                    for(int i=0;i<moments.size();i++){
                        HighlightDetector.Moment m=moments.get(i);
                        if(i>0)msg.append("  •  ");
                        msg.append(String.format(java.util.Locale.US,"%.0f–%.0fs",m.startMs/1000.0,m.endMs/1000.0));
                    }
                    HighlightDetector.Moment best=moments.get(0);
                    startField.setText(String.format(java.util.Locale.US,"%.1f",best.startMs/1000.0));
                    endField.setText(String.format(java.util.Locale.US,"%.1f",best.endMs/1000.0));
                    status.setText(msg.toString()+(chatActivity.isEmpty()?" (scene-change suggestions; review before export)":" (scene + chat-activity ranking; review before export)"));
                });
            }catch(Exception e){runOnUiThread(()->status.setText("Highlight scan failed: "+e.getMessage()));}
        }).start();
    }

    private void generateCaptions(){
        if(source==null){status.setText("Choose a video first.");return;}
        status.setText("Preparing offline speech model (first run downloads about 40 MB)...");
        new Thread(()->{
            try{
                File modelDir=VoskCaptioner.ensureModel(this);
                String srt=VoskCaptioner.transcribe(this,source,modelDir);
                runOnUiThread(()->{
                    pendingSrt=srt;
                    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/x-subrip");
                    i.putExtra(Intent.EXTRA_TITLE,"GhostClipper_Captions.srt");
                    status.setText("Transcription complete. Choose where to save the SRT captions.");
                    startActivityForResult(i,SAVE_SRT);
                });
            }catch(Exception e){runOnUiThread(()->status.setText("Caption generation failed: "+e.getMessage()));}
        }).start();
    }

    private void writeSrt(Uri destination){
        if(pendingSrt==null)return;
        try(OutputStream out=getContentResolver().openOutputStream(destination,"w")){
            if(out==null)throw new IOException("Could not open subtitle destination");
            out.write(pendingSrt.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            out.flush();status.setText("AI captions saved as SRT.");
        }catch(Exception e){status.setText("Could not save captions: "+e.getMessage());}
    }

    private void setBusy(boolean busy){export.setEnabled(!busy);cancel.setVisibility(busy?View.VISIBLE:View.GONE);progress.setVisibility(busy?View.VISIBLE:View.GONE);}
    private void cancelExport(){if(transformer!=null&&isExporting){transformer.cancel();isExporting=false;setBusy(false);if(rendered!=null)rendered.delete();status.setText("Export cancelled.");}}
    private void saveDialog(){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("video/mp4");i.putExtra(Intent.EXTRA_TITLE,"GhostClip_"+System.currentTimeMillis()+".mp4");startActivityForResult(i,SAVE_VIDEO);}
    private void saveRenderedToDownloads(){
        final File input=rendered;
        if(input==null||!input.exists()){status.setText("Clip file was not found; it could not be saved.");return;}
        new Thread(()->{
            Uri destination=null;
            try{
                if(android.os.Build.VERSION.SDK_INT>=29){
                    ContentValues values=new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME,"GhostClip_"+System.currentTimeMillis()+".mp4");
                    values.put(MediaStore.MediaColumns.MIME_TYPE,"video/mp4");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/Ghost Clipper");
                    values.put(MediaStore.MediaColumns.IS_PENDING,1);
                    destination=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
                    if(destination==null)throw new IOException("Android could not create a file in Downloads.");
                    try(InputStream in=new FileInputStream(input);OutputStream out=getContentResolver().openOutputStream(destination,"w")){
                        if(out==null)throw new IOException("Android could not open the Downloads file.");
                        byte[] buffer=new byte[65536];int count;
                        while((count=in.read(buffer))!=-1)out.write(buffer,0,count);
                        out.flush();
                    }
                    ContentValues ready=new ContentValues();ready.put(MediaStore.MediaColumns.IS_PENDING,0);
                    getContentResolver().update(destination,ready,null,null);
                }else{
                    throw new IOException("Automatic Downloads saving requires Android 10 or newer.");
                }
                input.delete();
                sendGhostEvent("clip_saved",input.getName(),"Saved to Downloads/Ghost Clipper");
                runOnUiThread(()->{status.setText("Saved automatically: Downloads/Ghost Clipper/"+input.getName());Toast.makeText(this,"Ghost Clipper: clip saved in Downloads",Toast.LENGTH_LONG).show();});
            }catch(Exception e){
                if(destination!=null)try{getContentResolver().delete(destination,null,null);}catch(Exception ignored){}
                runOnUiThread(()->status.setText("Could not save to Downloads: "+e.getMessage()));
            }
        },"GhostClip-SaveDownload").start();
    }
    private void copyTo(Uri dest){if(rendered==null||!rendered.exists()){status.setText("Rendered file not found.");return;}try(InputStream in=new FileInputStream(rendered);OutputStream out=getContentResolver().openOutputStream(dest,"w")){if(out==null)throw new IOException("Cannot open destination");byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);out.flush();rendered.delete();status.setText("Saved. Your MP4 is ready.");Toast.makeText(this,"Ghost Clipper: saved",Toast.LENGTH_LONG).show();}catch(Exception e){status.setText("Save failed: "+e.getMessage());}}
}
